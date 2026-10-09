import { ForbiddenException, HttpException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isLocale, type Locale } from "@rothern/i18n";
import type { DiscoveryTrigger } from "@rothern/db";
import { countryCanSee, hiddenCategoryWhere, visibleCategoryIds } from "@rothern/shared";
import { PrismaBypassService, PrismaService } from "../../../common/prisma/prisma.service";
import { CATEGORY_NAME_SELECT } from "../../../common/company/category-name";
import { deriveCategoryMatchCandidates } from "../../../common/helpers/tender-category-match.helper";
import { i18nMessage } from "../../../common/i18n/http-i18n";
import { tApi } from "../../../common/i18n/i18n.service";
import { appRoutes } from "../../../common/company/app-routes";
import {
  COUNTED_AUTO_RUN_WHERE,
  isCountedAutoRun,
  RUN_ERROR_DISCOVERY_OFF,
  RUN_ERROR_PRIVATE_LISTING,
} from "../../../common/company/ai-suggestions";
import { AUTH_COMPANY_SELECT } from "../../../common/company/auth-company-select";
import { inviteReachesAddress } from "../../../common/company/external-invite-policy";
import { resolveWebUrl } from "../../../common/config/web-url";
import { runWithLocale } from "../../../common/i18n/locale-context";
import { listingTitleParam } from "../../../common/notifications/notification-params";
import { isNotificationEnabled } from "../../../common/notifications/notification-prefs";
import { runWithTenantContext } from "../../../common/tenant/tenant-context";
import {
  toAuthenticatedCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/strategies/company-jwt.strategy";
import { CompanyConnectionsService } from "../../company-connections/services/company-connections.service";
import {
  inviteAddressHistories,
  queuedInviteCanLeave,
} from "../../company-connections/services/external-invite-dispatcher.service";
import { listingManageDenial } from "../../company-listings/listing-manage-access";
import { CompanyListingsService, DISCOVERY_HOLD_MS } from "../../company-listings/services/company-listings.service";
import { EmailService } from "../../email/email.service";
import { NotificationService } from "../../notifications/notification.service";
import { AiService } from "../ai.service";
import {
  BACKGROUND_SEARCH_TIMING,
  failedPassNote,
  SupplierDiscoveryService,
  worstSearchMs,
  type AnnotatedCandidate,
  type DiscoveryAiRunner,
  type DiscoveryCandidate,
} from "./supplier-discovery.service";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/**
 * DAKİKALIK İŞİN ARAMA BÜTÇESİ (round 5 gözden geçirme, R5-08).
 *
 * Herkese açık talepte anonim kategori duyurusu turun davetlerini en fazla
 * `DISCOVERY_HOLD_MS` (10 dk, tur satırının yazıldığı andan) bekler. Dakikalık
 * iş turları ART ARDA işler; arama süreleri yalnız `STUCK_AFTER_MS` ile
 * karşılaştırılmıştı — sağlayıcı yavaşken (geçiş düşer, yeniden denenir) işin
 * ikinci turu davet aşamasına duyurusu çoktan salındıktan sonra varıyor, davet
 * edilen üye firma adını taşıyan daveti hiç almıyordu.
 *
 * Kural: iş, başladığı andan bu süre içinde SON turunun aramasını bitirmiş
 * olmalı. Bir tur daha ancak en kötü araması (`worstSearchMs`: 5 dk) bu
 * bütçeye hâlâ sığıyorsa başlatılır (`fitsInTick`); sığmıyorsa tur PENDING
 * kalır ve bir sonraki dakikanın işi onu İLK tur olarak alır. Bütçe duyuru
 * beklemesinden türer: 1 dk tur işi bekledi + 1 dk aramanın çevresi (platform
 * üyeleri, işaretleme, davetler) düşülür → 8 dk. Dakikalık iş de en fazla bu
 * kadar meşgul kalır.
 *
 * KALAN SINIR: önündeki işin tamamını (8 dk) bekleyen tur yine duyurudan sonra
 * davet edebilir — bekleme bir ÜST SINIRDIR (kuyruk doluyken duyuru beklemez),
 * garanti değil.
 */
export const TICK_SEARCH_BUDGET_MS = DISCOVERY_HOLD_MS - 2 * MINUTE_MS;

/** Can one more run start `elapsedMs` into the tick (its worst-case search still ends inside the budget)? */
export function fitsInTick(elapsedMs: number): boolean {
  return elapsedMs + worstSearchMs(BACKGROUND_SEARCH_TIMING) <= TICK_SEARCH_BUDGET_MS;
}

/**
 * Takılı kalmış tur bu sürede ele alınır. Dakikalık iş art arda en fazla
 * `RUNS_PER_TICK` tur işler ve her turun `startedAt`i İŞİN başlangıcıdır; iş
 * aramalarını `TICK_SEARCH_BUDGET_MS` (8 dk) içinde bitirir → bu süre onun
 * ÜSTÜNDE kalmalı (sözleşme testi `supplier-discovery-external.spec.ts`
 * "R5-08"). Arama sürelerini ya da duyuru beklemesini büyütürken bunu da büyüt.
 */
export const STUCK_AFTER_MS = 15 * MINUTE_MS;
/**
 * Adayları yazılmış ama davet aşaması yarıda kalmış (süreç öldü) tur bu süre
 * içinde KALDIĞI YERDEN sürdürülür; daha eskisi FAILED olur.
 */
const RESUME_WINDOW_MS = 6 * HOUR_MS;
/**
 * Bir işte işlenen en fazla tur (her biri olağan durumda ~1 dk: paralel iki
 * web araması; geçişi düşüp yeniden denenen tur en fazla 5 dk). İkinci tur
 * yalnız işin arama bütçesine sığıyorsa başlar — bkz. `TICK_SEARCH_BUDGET_MS`.
 */
const RUNS_PER_TICK = 2;
/** İkinci tur: teklif sayısı bunun altındaysa. */
const SECOND_ROUND_MAX_BIDS = 3;
/** Talep başına en fazla OTOMATİK tur (yayın + ikinci tur). */
const MAX_AUTO_RUNS = 2;
const DEFAULT_DAILY_USD = 15;

export const AI_SUGGESTIONS_NOTIFICATION = "ai_supplier_suggestions";

/**
 * Sonuç mesajının metni — hangi sayı sıfır değilse ona göre (gözden geçirme
 * AI-6). Anahtarlar açık yazılır (katalogda aranabilsin).
 */
const RESULT_TEXT = {
  both: {
    body: "api.notifications.discovery.invitedBodyBoth",
    subject: "api.notifications.discovery.invitedEmailSubjectBoth",
  },
  members: {
    body: "api.notifications.discovery.invitedBodyMembers",
    subject: "api.notifications.discovery.invitedEmailSubjectMembers",
  },
  emails: {
    body: "api.notifications.discovery.invitedBodyEmails",
    subject: "api.notifications.discovery.invitedEmailSubjectEmails",
  },
} as const;

/** Bulduğunu KENDİSİ davet eden turlar (yayın + ikinci tur). */
const AUTO_TRIGGERS: DiscoveryTrigger[] = ["PUBLISH", "SECOND_ROUND"];

/**
 * ADAYIN DAVET SONUCU (ekran: yayın paneli + talep sayfası bandı).
 *  - INVITED: üye talebe davetli oldu / davet e-postası gönderildi
 *  - QUEUED: davet e-postası kuyrukta (alıcının ülkesinde mesai saatinde gider)
 *  - ALREADY_INVITED: tur bulduğunda zaten davetliydi
 *  - NOT_SENT: gönderilmedi (+ `inviteReason`)
 *  - WAITING: tur sürüyor, sıra bu adaya gelmedi
 */
export type CandidateInviteState = "INVITED" | "QUEUED" | "ALREADY_INVITED" | "NOT_SENT" | "WAITING";

/**
 * WEAK MATCH - a platform member the automatic run found but does NOT invite
 * (live re-check 2026-10-09, AUTO-MEMBER-1).
 *
 * The run invites in the buyer's name without asking. The member matcher also
 * returns companies it marks as not strong (`strongMatch` false: only the
 * top-level segment fits, or a relaxed item hit no category corroborates) -
 * right for the manual window, where the buyer picks, but the run invited them
 * all: an electrical firm, a hardware shop and two machine builders to a
 * hydraulic cylinder request. Now only a STRONG match is invited; the others
 * are written with this status ("not sent", reason `WEAK_MATCH` on the status
 * list) and nothing else happens to them: the anonymous category announcement
 * still reaches a company that declares the segment (it excludes INVITEES
 * only), and the buyer can still invite it from the "find suppliers" window -
 * the status list then shows it as invited.
 *
 * Written when the candidates are saved (`mergeCandidates`), not at invitation
 * time: `strongMatch` is not stored, and a resumed run reads only the rows.
 */
export const MEMBER_WEAK_MATCH = "WEAK_MATCH";

/**
 * Davet aşamasının aday satırına yazdığı "gönderilmedi" durumları (kolon serbest
 * metin). Kuyruğa giren/davet edilen aday INVITED, zaten davetli olan
 * ALREADY_INVITED yazılır; SUGGESTED / MEMBER = sıra henüz gelmedi.
 * `WEAK_MATCH` aday yazılırken konur (otomatik tur yalnız güçlü eşleşen üyeyi
 * davet eder — `MEMBER_WEAK_MATCH`).
 */
const NOT_SENT_STATUSES = new Set([
  MEMBER_WEAK_MATCH,
  "DAILY_LIMIT",
  "NOT_ELIGIBLE",
  "NOT_ALLOWED",
  "OPTED_OUT",
  "SKIPPED_REGISTERED",
  "COUNTRY_BLOCKED",
  "CONSENT_REQUIRED",
  "INVALID",
]);

/**
 * YAYIN SONRASI OTOMATİK TEDARİKÇİ KEŞFİ (2026-09-27, Faz 1; kullanıcı: "talep
 * açıldıktan sonra bile şirketler bulundu, tek tıkla davet gönder diyelim;
 * uluslararası ise yurt dışı dahil").
 *
 *  - Talep açılınca (`Listing.aiDiscovery`) tur kuyruğa girer (`enqueue`);
 *    dakikalık iş (`tick`) işler. Maliyet PLATFORMUN (`callAiSystem`): alıcının
 *    edinme kanalı değil, platformun; günlük USD tavanı `AI_DISCOVERY_DAILY_USD`.
 *  - Arama kapsamı talebin görünürlük ülkesinden (boş = yurt içi + yurt dışı).
 *  - Adaylar işaretlenir (zaten davetli, üye, onay isteyen ülke) ve kaydedilir.
 *  - TUR BULDUĞUNU KENDİSİ DAVET EDER (2026-10-08, sahip: "kutu seçiliyse AI
 *    arasın ve göndersin, bir daha sormasın; arkada arasın, bulabildiğine
 *    göndersin"). Alıcının onayı YOK; davet talebi YAYINLAYAN kişi adına
 *    (`createdById` — talebi yalnız açan kişi yayınlayabilir) ve MEVCUT davet
 *    yollarından geçer, hiçbir fren atlanmaz:
 *      · Rothern üyesi → `inviteDiscoveredMembers` (doğrudan talebe),
 *      · diğerleri → `inviteExternalForListing(…, "AI_AUTO")` (e-posta kuyruğu).
 *    Kapılar o metotlarda (paket, yönetim izni, talep durumu, günlük firma
 *    tavanı, engel/askı, ülke, çıkış, kayıtlı adres, onay isteyen ülke, kayda
 *    kapalı ülke); gönderim frenleri dağıtıcıda (platform tavanı + fren, adres
 *    başına 7 gün + özet, staging izin listesi). Yayınlayan kişi/firma artık
 *    davet edemiyorsa (pasif, askıda, paket düştü, izin alındı) davet GİTMEZ.
 *    ÖZEL talepte tur hiç koşmaz.
 *  - Tur bitince talebi yayınlayana SONUÇ bildirimi + e-posta: İKİ sayı ayrı
 *    söylenir — talebe davet edilen Rothern üyesi ve sıraya alınan davet
 *    e-postası (talep kapanmadan gidemeyecek adres sayılmaz); ikisi de sıfırsa
 *    hiçbir şey gitmez.
 *  - Tur, kuyruğa yazıldığı andaki değil İŞLENDİĞİ andaki talebi okur
 *    (2026-10-09, gözden geçirme AI-2): kutu kapatıldıysa (`discovery_off`) ya
 *    da talep özele çevrildiyse koşmaz; arama talebin GÜNCEL görünürlük
 *    ülkeleriyle yapılır; davet aşaması da (sürdürülen tur dahil) kutuya bakar.
 *  - HERKESE AÇIK talepte anonim kategori duyurusu turun davet aşamasını
 *    BEKLER (gözden geçirme AI-4, `CompanyListingsService.announceListingOpen`):
 *    tur biter bitmez `releaseHeldAnnouncement` çağrılır; turun davet ettiği
 *    üye firma adını taşıyan daveti alır, duyuruya girmez.
 *  - Süre yarılandığında teklif 3'ten azsa İKİNCİ TUR (önceki adaylar hariç);
 *    o da bulduğunu kendisi davet eder.
 *  - ÇÖKMEYE DAYANIKLI: adaylar yazıldıktan sonra süreç ölürse tur RUNNING
 *    kalır; dakikalık iş kirayı devralıp davet aşamasını kaldığı yerden
 *    sürdürür. Aynı adaya ikinci davet OLMAZ: sıra aday durumundan okunur
 *    (SUGGESTED/MEMBER = bekliyor) ve davet tabloları (talep × firma, talep ×
 *    adres) benzersizdir.
 *  - ROTHERN ÜYELERİ (2026-09-28, kullanıcı: "sistemimize kayıtlıysa ayrıca
 *    gösterelim, kategori ya da kalem eşleşmesi var diye"): tur platform
 *    dizinini de tarar (model çağrısı yok, AI kapalıyken de); web aramasında
 *    adresi/sitesi bir üyeyle eşleşen aday da üye sayılır (kaynak BOTH). Üye
 *    adayı (`status = MEMBER`, `memberCompanyId`) e-posta davetine değil
 *    DOĞRUDAN TALEBE davet edilir (`inviteDiscoveredMembers`, bağlantı şartı yok).
 *  - YALNIZ GÜÇLÜ EŞLEŞEN ÜYE (2026-10-09, AUTO-MEMBER-1): platform dizininin
 *    güçlü saymadığı üye (yalnız segment) otomatik davet EDİLMEZ; aday satırı
 *    `WEAK_MATCH` yazılır (`MEMBER_WEAK_MATCH`). Web aramasının da bulduğu üye
 *    davet edilir.
 */
@Injectable()
export class DiscoveryRunsService {
  private readonly logger = new Logger(DiscoveryRunsService.name);

  /** Elapsed-time clock of a tick; replaceable in tests (no real waiting). */
  clock: () => number = () => Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly bypass: PrismaBypassService,
    private readonly ai: AiService,
    private readonly discovery: SupplierDiscoveryService,
    private readonly connections: CompanyConnectionsService,
    private readonly config: ConfigService,
    @Optional() private readonly email?: EmailService,
    @Optional() private readonly notifications?: NotificationService,
    @Optional() private readonly listings?: CompanyListingsService,
  ) {}

  /**
   * Talep için tur kuyruğa al (aynı talepte bekleyen/koşan tur varsa yenisi
   * açılmaz). Talep satırı kilitlenir — `CompanyListingsService.enqueueDiscoveryRun`
   * ile AYNI kilit: yayın turu telafisi (dakikalık iş) ile düzenleme kaydı aynı
   * anda "tur yok" görüp iki tur yazamaz (ikinci gözden geçirme A-3: kutu
   * yeniden açılınca ikisi de aynı talebe tur yazmaya aday).
   */
  async enqueue(listingId: string, trigger: DiscoveryTrigger): Promise<string | null> {
    return this.bypass.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listingId} FOR UPDATE`;
      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        select: { id: true, companyId: true, targetCountries: true },
      });
      if (!listing) return null;
      const active = await tx.supplierDiscoveryRun.findFirst({
        where: { listingId, state: { in: ["PENDING", "RUNNING"] } },
        select: { id: true },
      });
      if (active) return active.id;
      const run = await tx.supplierDiscoveryRun.create({
        data: { listingId, companyId: listing.companyId, trigger, targetCountries: listing.targetCountries },
        select: { id: true },
      });
      return run.id;
    });
  }

  // ------------------------------------------------------------------ iş

  async tick(
    now: Date = new Date(),
  ): Promise<{ processed: number; notified: number; secondRounds: number; caughtUp: number }> {
    const began = this.clock();
    let notified = await this.recoverStuckRuns(now);
    const caughtUp = await this.catchUpPublishRuns(now);
    const secondRounds = await this.scheduleSecondRounds(now);
    const pending = await this.bypass.supplierDiscoveryRun.findMany({
      where: { state: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: RUNS_PER_TICK,
      select: { id: true },
    });
    let processed = 0;
    for (const r of pending) {
      // A further run only while its worst-case search still fits the tick
      // (R5-08); otherwise it stays PENDING for the next minute's tick.
      if (processed > 0 && !fitsInTick(this.clock() - began)) {
        this.logger.warn(`discovery tick: search budget used, run ${r.id} waits for the next tick`);
        break;
      }
      const out = await this.runOnce(r.id, now);
      if (out.claimed) processed++;
      if (out.notified) notified++;
    }
    return { processed, notified, secondRounds, caughtUp };
  }

  /**
   * TAKILI TURLAR. Adayları yazılmış otomatik tur (arama bitti, süreç davet
   * aşamasında öldü) kirası devralınarak KALDIĞI YERDEN sürdürülür — arama
   * yeniden koşmaz, davet edilmiş adaya ikinci davet gitmez. Adayı olmayan
   * (arama sırasında ölen) ya da `RESUME_WINDOW_MS`'ten eski tur FAILED olur.
   * Sonuç bildirimi gönderilen tur sayısını döner.
   */
  private async recoverStuckRuns(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - STUCK_AFTER_MS);
    const stuck = { state: "RUNNING" as const, startedAt: { lt: cutoff } };
    const resumable = {
      trigger: { in: AUTO_TRIGGERS },
      createdAt: { gt: new Date(now.getTime() - RESUME_WINDOW_MS) },
      candidates: { some: {} },
    };
    const dead = await this.bypass.supplierDiscoveryRun.findMany({
      where: { ...stuck, NOT: resumable },
      select: { id: true },
      take: 200,
    });
    for (const d of dead) {
      // Satır başına koşullu: bitiş damgasını alan süreç kapanış duyurularını
      // (bekletilen kategori duyurusu + gösterilmeyen eşleşmeler) bir kez yapar.
      const failed = await this.bypass.supplierDiscoveryRun.updateMany({
        where: { id: d.id, ...stuck, NOT: resumable },
        data: { state: "FAILED", error: "stuck", finishedAt: now },
      });
      if (failed.count === 1) await this.closingNotices(d.id, { hidden: true });
    }
    const rows = await this.bypass.supplierDiscoveryRun.findMany({
      where: { ...stuck, ...resumable },
      orderBy: { startedAt: "asc" },
      take: RUNS_PER_TICK,
      select: { id: true },
    });
    let notified = 0;
    for (const r of rows) {
      // Kira: ikinci örnek aynı turu sürdürmesin (koşul satırda yeniden değerlendirilir).
      const leased = await this.bypass.supplierDiscoveryRun.updateMany({
        where: { id: r.id, ...stuck },
        data: { startedAt: now },
      });
      if (leased.count !== 1) continue;
      try {
        if (await this.inviteAndFinish(r.id, now)) notified++;
      } catch (err) {
        // Tur RUNNING kalır; kira dolunca yeniden denenir (pencere bitince FAILED).
        this.logger.warn(`discovery run ${r.id} resume failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return notified;
  }

  /**
   * YAYIN TURU TELAFİSİ (derin denetim 2026-09-29 MU-09 S090, gözden geçirme):
   * yayın turu normalde `announceListingOpen` claim'inde (ya da düzenlemede
   * duyuru çoktan yapıldıysa `updateListing`'de) yazılır. Claim tek seferlik:
   * duyurusu yapılmış talebin açılışı düzenlemeyle ileri alınıp aynı anda
   * otomatik arama açılırsa embargo bitince claim alınamaz ve tur HİÇ
   * yazılmazdı (ekran "açılınca başlar" der, söz tutulmazdı). Burada duyurusu
   * yapılmış (`openNotifiedAt` dolu — duyurusu yapılmamış talebin turunu
   * duyuru yazar), teklife açık, otomatik araması açık ve yayın/ikinci tur
   * satırı olmayan talepler kuyruğa alınır. Duyuru ile yarışmasın diye damga
   * en az 2 dk eski olmalı.
   *
   * "Turu olmayan" = SAYILAN turu olmayan (`COUNTED_AUTO_RUN_WHERE`, ikinci
   * gözden geçirme A-3): kutu kapalıyken / talep özeldeyken aramadan düşen tur
   * sayılmaz — alıcı kutuyu yeniden açtıysa (düzenleme kaydı turu yazamadıysa
   * da) yayın turu buradan yeniden kuyruğa girer.
   */
  private async catchUpPublishRuns(now: Date): Promise<number> {
    const rows = await this.bypass.listing.findMany({
      where: {
        status: "OPEN",
        aiDiscovery: true,
        visibility: { not: "PRIVATE" },
        openNotifiedAt: { lte: new Date(now.getTime() - 2 * MINUTE_MS) },
        OR: [{ bidsOpenAt: null }, { bidsOpenAt: { lte: now } }],
        closesAt: { gt: now },
        discoveryRuns: { none: COUNTED_AUTO_RUN_WHERE },
      },
      orderBy: { openNotifiedAt: "asc" },
      select: { id: true },
      take: 50,
    });
    let n = 0;
    for (const l of rows) {
      if (await this.enqueueQuietly(l.id, "PUBLISH")) n++;
    }
    return n;
  }

  /**
   * Dakikalık işin kuyruğa alması: tek talebin hatası (ör. talep satırı kilidi
   * beklenirken transaction zaman aşımı) turu DURDURMAZ — o talep bir sonraki
   * dakikada yeniden denenir, bekleyen turlar bu dakikada işlenir.
   */
  private async enqueueQuietly(listingId: string, trigger: DiscoveryTrigger): Promise<string | null> {
    return this.enqueue(listingId, trigger).catch((err) => {
      this.logger.warn(
        `discovery enqueue failed (${listingId}, ${trigger}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    });
  }

  private async spentTodayUsd(now: Date): Promise<number> {
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const agg = await this.bypass.supplierDiscoveryRun.aggregate({
      where: { finishedAt: { gte: dayStart }, costUsd: { not: null } },
      _sum: { costUsd: true },
    });
    return Number(agg._sum.costUsd ?? 0);
  }

  /**
   * Günlük platform tavanı. `0` = DURDUR anahtarı (web araması koşmaz; platform
   * üyesi önerileri model istemediği için sürer) — `CONTENT_TRANSLATION_DAILY_USD`
   * ve `COLD_INVITE_MAX_DAILY` ile aynı kural (yayın denetimi 2026-09-28 Bölüm 15;
   * eskiden 0 varsayılan 15 USD'ye düşüyordu). Tanımsız/boş/geçersiz → varsayılan.
   */
  private dailyBudgetUsd(): number {
    const raw = this.config.get<string>("AI_DISCOVERY_DAILY_USD")?.toString().trim();
    if (!raw) return DEFAULT_DAILY_USD;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_DAILY_USD;
  }

  /** Tek turu işler; atomik sahiplenme (iki örnek aynı turu koşmaz). */
  async process(runId: string, now: Date = new Date()): Promise<boolean> {
    return (await this.runOnce(runId, now)).claimed;
  }

  /**
   * Tur: arama → adayları yaz → (otomatik turda) davet et → DONE → sonuç
   * bildirimi. `notified`: talebi yayınlayana sonuç mesajı gönderildi.
   */
  private async runOnce(runId: string, now: Date): Promise<{ claimed: boolean; notified: boolean }> {
    const claimed = await this.bypass.supplierDiscoveryRun.updateMany({
      where: { id: runId, state: "PENDING" },
      data: { state: "RUNNING", startedAt: now },
    });
    if (claimed.count === 0) return { claimed: false, notified: false };
    let notified = false;
    // Koşullu (takılı tur süpürmesi aynı satırı FAILED yapmış olabilir).
    const fail = (error: string) =>
      this.bypass.supplierDiscoveryRun.updateMany({
        where: { id: runId, state: "RUNNING" },
        data: { state: "FAILED", error: error.slice(0, 300), finishedAt: new Date() },
      });

    const run = await this.bypass.supplierDiscoveryRun.findUniqueOrThrow({
      where: { id: runId },
      select: {
        listingId: true,
        companyId: true,
        trigger: true,
        listing: {
          select: {
            status: true,
            visibility: true,
            aiDiscovery: true,
            targetCountries: true,
            categoryIds: true,
            createdById: true,
            items: { select: { name: true }, orderBy: { lineNo: "asc" }, take: 15 },
          },
        },
      },
    });
    if (!run.listing || !run.listingId || run.listing.status !== "OPEN") {
      await fail("listing_not_open");
      return { claimed: true, notified };
    }
    // Özel talepte otomatik arama YOK: tur bulduğunu kendisi davet ediyor;
    // yalnız davetlilerin gördüğü talebe yabancı firma çağrılmaz (kuyruğa
    // yazıldıktan sonra özele çevrilen talep de buraya düşer).
    if (run.listing.visibility === "PRIVATE") {
      await fail(RUN_ERROR_PRIVATE_LISTING);
      await this.closingNotices(runId, { hidden: false });
      return { claimed: true, notified };
    }
    // Kutu, tur kuyruktayken KAPATILDI (gözden geçirme AI-2): alıcı aramayı
    // istemiyor — model bütçesi harcanmaz, onun adına kimse davet edilmez.
    // (Kuyruk dolu olduğunda tur dakikalarca bekleyebilir.)
    if (!run.listing.aiDiscovery) {
      await fail(RUN_ERROR_DISCOVERY_OFF);
      await this.closingNotices(runId, { hidden: false });
      return { claimed: true, notified };
    }
    try {
      const [owner, creator, previous] = await Promise.all([
        this.bypass.company.findUnique({ where: { id: run.companyId }, select: { country: true } }),
        this.bypass.companyUser.findUnique({ where: { id: run.listing.createdById }, select: { locale: true } }),
        this.bypass.supplierDiscoveryCandidate.findMany({
          where: { run: { listingId: run.listingId }, runId: { not: runId } },
          select: { name: true, email: true, website: true, memberCompanyId: true },
        }),
      ]);
      const locale: Locale = isLocale(creator?.locale) ? creator.locale : "tr";
      const itemNames = run.listing.items.map((i) => i.name);
      const seenMembers = new Set(previous.map((p) => p.memberCompanyId).filter((m): m is string => !!m));

      // 1) Platform üyeleri — model çağrısı yok, bütçeden bağımsız.
      const platform = await this.discovery
        .discoverRegisteredFor(run.companyId, {
          categoryIds: run.listing.categoryIds,
          itemNames,
          listingId: run.listingId,
          locale,
        })
        .then((r) => r.candidates.filter((c) => !seenMembers.has(c.companyId)))
        .catch((err) => {
          this.logger.warn(`discovery run ${runId} platform pass failed: ${err instanceof Error ? err.message : String(err)}`);
          return [] as DiscoveryCandidate[];
        });

      // 1b) Alıcıya GÖSTERİLMEYEN ücretsiz/doğrulanmamış eşleşmelere çağrı
      // turun SONUNDA gider (`closingNotices`): herkese açık talepte anonim
      // kategori duyurusu turu bekler ve bu çağrı ondan SONRA gelmelidir —
      // yoksa aynı firmaya bir talep için iki e-posta giderdi (AI-4).

      // 2) Web araması — AI açık ve platform bütçesi yetiyorsa.
      let web: AnnotatedCandidate[] = [];
      let costUsd: number | null = null;
      let webError: string | null = null;
      if (!this.ai.isEnabled) webError = "ai_disabled";
      else if ((await this.spentTodayUsd(now)) >= this.dailyBudgetUsd()) webError = "platform_daily_budget";
      else {
        // Harcama çağrı başına toplanır: geçiş ortasında düşen turun ödenmiş
        // çağrıları da günlük tavana yazılsın (yayın denetimi 2026-09-28 B5-14 —
        // eskiden hata dalında costUsd null kalıyor, tavan saymıyordu).
        let spent = 0;
        try {
          const runner: DiscoveryAiRunner = async ({ stage: _stage, ...opts }) => {
            const res = await this.ai.callAiSystem(opts);
            spent += res.costUsd ?? 0;
            return res;
          };
          // Earlier candidates: the ADDRESS is never suggested again; the
          // COMPANY (another mailbox of it) is excluded too - unless this
          // request's invitation to that candidate never reached it (failed,
          // or dropped before it left: R5-04). Such a company can only be
          // reached through another mailbox.
          const previousEmails = [
            ...new Set(previous.map((p) => p.email?.trim().toLowerCase()).filter((e): e is string => !!e)),
          ];
          const unreached = new Set(
            previousEmails.length === 0
              ? []
              : (
                  await this.bypass.externalListingInvite.findMany({
                    where: { listingId: run.listingId, email: { in: previousEmails } },
                    select: { email: true, state: true, sentAt: true },
                  })
                )
                  .filter((i) => !inviteReachesAddress(i))
                  .map((i) => i.email),
          );
          const found = await this.discovery.searchWeb(
            {
              buyerCountry: owner?.country ?? null,
              // Talebin GÜNCEL ülkeleri (AI-2): tur satırındaki kopya kuyruğa
              // yazıldığı ana aittir; alıcı o arada "yalnız Türkiye"ye
              // daralttıysa yurt dışı geçişi koşmaz.
              targetCountries: run.listing.targetCountries,
              categoryIds: run.listing.categoryIds,
              itemNames,
              locale,
              excludeEmails: previousEmails,
              excludeCompanies: previous.filter((p) => !(p.email && unreached.has(p.email.trim().toLowerCase()))),
            },
            runner,
            // Arka plan: HTTP sınırı yok — araştırma çağrısına uzun süre ve
            // düşen geçişe TEK yeniden deneme (round 5, D1).
            BACKGROUND_SEARCH_TIMING,
          );
          costUsd = found.costUsd;
          web = await this.discovery.annotate(run.companyId, run.listingId, found.companies, now);
          // EKSİK ARAMA: bir geçiş yeniden denemeden sonra da düştü, diğeri
          // yanıt verdi. Tur DÜŞMEZ — yanıt veren geçişin adayları (ve platform
          // üyeleri) işlenir, düşen geçiş hata notuna yazılır ("DONE + not";
          // hiç aday çıkmadıysa aşağıda FAILED). Bütün geçişler düşerse
          // `searchWeb` fırlatır → catch.
          if (found.failedPasses.length > 0) {
            webError = failedPassNote(found.failedPasses);
            this.logger.warn(`discovery run ${runId} web search incomplete: ${webError}`);
          }
        } catch (err) {
          webError = err instanceof Error ? err.message : String(err);
          costUsd = spent > 0 ? spent : null;
          this.logger.warn(`discovery run ${runId} web pass failed: ${webError}`);
        }
      }

      // A run that invites by itself takes only STRONG member matches
      // (AUTO-MEMBER-1); the rest is recorded as `WEAK_MATCH`, not invited.
      const rows = mergeCandidates(platform, web, seenMembers, owner?.country ?? null, {
        strongMembersOnly: AUTO_TRIGGERS.includes(run.trigger),
      });
      if (rows.length === 0) {
        const ended = await this.bypass.supplierDiscoveryRun.updateMany({
          where: { id: runId, state: "RUNNING" },
          data: {
            state: webError ? "FAILED" : "DONE",
            error: webError ? webError.slice(0, 300) : null,
            finishedAt: new Date(),
            costUsd,
          },
        });
        if (ended.count === 1) await this.closingNotices(runId, { hidden: true });
        return { claimed: true, notified };
      }
      // Adaylar + maliyet DAVETTEN ÖNCE yazılır (tur RUNNING kalır): süreç
      // davet ortasında ölürse arama yeniden koşmaz, harcama kaybolmaz ve
      // `recoverStuckRuns` kalan adayları davet eder. Web yolu düştü ama üye
      // bulundu → tur yine tamamlanır; hata not düşer.
      await this.bypass.$transaction([
        this.bypass.supplierDiscoveryCandidate.createMany({ data: rows.map((r) => ({ runId, ...r })) }),
        this.bypass.supplierDiscoveryRun.update({
          where: { id: runId },
          data: { error: webError ? webError.slice(0, 300) : null, costUsd },
        }),
      ]);
    } catch (err) {
      this.logger.warn(`discovery run ${runId} failed: ${err instanceof Error ? err.message : String(err)}`);
      const failed = await fail(err instanceof Error ? err.message : String(err)).catch(() => ({ count: 0 }));
      if (failed.count === 1) await this.closingNotices(runId, { hidden: true });
      return { claimed: true, notified };
    }
    try {
      notified = await this.inviteAndFinish(runId, now);
    } catch (err) {
      // Beklenmeyen hata (DB): tur RUNNING kalır, kira dolunca sürdürülür.
      this.logger.warn(`discovery run ${runId} invite phase failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { claimed: true, notified };
  }

  /**
   * DAVET AŞAMASI + KAPANIŞ (yeni tur ve sürdürülen takılı tur aynı yoldan).
   * Otomatik turda bekleyen adaylar davet edilir, tur DONE olur, bekletilen
   * kategori duyurusu salınır (`closingNotices`) ve en az bir davet varsa
   * talebi yayınlayana SONUÇ mesajı gider (`notifiedAt` DONE ile aynı ifadede
   * damgalanır: mesaj en fazla bir kez).
   */
  private async inviteAndFinish(runId: string, now: Date): Promise<boolean> {
    const run = await this.bypass.supplierDiscoveryRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        listingId: true,
        companyId: true,
        trigger: true,
        createdAt: true,
        listing: {
          select: {
            id: true,
            companyId: true,
            title: true,
            number: true,
            type: true,
            createdById: true,
            status: true,
            visibility: true,
            aiDiscovery: true,
            targetCountries: true,
            closesAt: true,
          },
        },
      },
    });
    if (!run) return false;
    if (run.listing && AUTO_TRIGGERS.includes(run.trigger)) await this.autoInvite(run, run.listing);
    const counts = run.listing ? await this.invitedCounts(runId, run.listing, now) : { members: 0, emails: 0 };
    const tell = counts.members + counts.emails > 0;
    const done = await this.bypass.supplierDiscoveryRun.updateMany({
      where: { id: runId, state: "RUNNING" },
      data: { state: "DONE", finishedAt: new Date(), ...(tell ? { notifiedAt: now } : {}) },
    });
    if (done.count !== 1) return false;
    // Önce bekletilen duyuru (tedarikçiler beklemesin), sonra alıcıya sonuç.
    await this.closingNotices(runId, { hidden: true });
    if (!tell || !run.listing) return false;
    await this.notifyCreator(run.listing.id, run.listing, counts).catch((err) =>
      this.logger.warn(`discovery notify failed (${runId}): ${err instanceof Error ? err.message : String(err)}`),
    );
    return true;
  }

  /**
   * TURUN KAPANIŞ DUYURULARI — tur bitiş damgasını (DONE / FAILED) alan süreç
   * bir kez çağırır; hiçbir hata turu etkilemez.
   *
   *  1. BEKLETİLEN KATEGORİ DUYURUSU (gözden geçirme AI-4): herkese açık
   *     talepte anonim duyuru turun davet aşamasını bekliyordu; tur bitti →
   *     hemen salınır (`releaseHeldAnnouncement`; duyurunun TEK SEFERLİK hakkı
   *     orada, `openNotifiedAt` koşullu damgası). Bu çağrı kaybolursa (süreç
   *     öldü) dakikalık `listing.announceOpened` işi aynı duyuruyu salar.
   *  2. ALICIYA GÖSTERİLMEYEN ücretsiz/doğrulanmamış güçlü eşleşmelere
   *     doğrulama çağrısı (2026-09-28) — duyurudan SONRA ve duyurunun ulaştığı
   *     firmalar hariç: bir talep aynı firmaya iki e-posta üretmesin. Yalnız
   *     herkese açık talep (doğrulanan firma talebi görebilsin) ve güçlü
   *     eşleşme (alt kategori ya da vitrinde kalem) — segment düzeyi zaten
   *     kategori duyurusunun işi. Model çağrısı yok; sürdürülen turda da çalışır.
   */
  private async closingNotices(runId: string, opts: { hidden: boolean }): Promise<void> {
    const listings = this.listings;
    if (!listings) return;
    try {
      const run = await this.bypass.supplierDiscoveryRun.findUnique({
        where: { id: runId },
        select: {
          listingId: true,
          companyId: true,
          listing: {
            select: {
              status: true,
              visibility: true,
              categoryIds: true,
              createdById: true,
              items: { select: { name: true }, orderBy: { lineNo: "asc" }, take: 15 },
            },
          },
        },
      });
      if (!run?.listing || !run.listingId) return;
      const listingId = run.listingId;
      const announced = new Set(
        await listings.releaseHeldAnnouncement(listingId).catch((err) => {
          this.logger.warn(`held announcement release failed (${runId}): ${err instanceof Error ? err.message : String(err)}`);
          return [] as string[];
        }),
      );
      if (!opts.hidden || run.listing.visibility !== "PUBLIC" || run.listing.status !== "OPEN") return;
      const creator = await this.bypass.companyUser.findUnique({
        where: { id: run.listing.createdById },
        select: { locale: true },
      });
      const hidden = await this.discovery.discoverRegisteredFor(run.companyId, {
        categoryIds: run.listing.categoryIds,
        itemNames: run.listing.items.map((i) => i.name),
        listingId,
        locale: isLocale(creator?.locale) ? creator.locale : "tr",
        pool: "hidden",
      });
      await listings.notifyHiddenAiMatches(
        listingId,
        hidden.candidates.filter((c) => c.strongMatch && !c.alreadyInvited && !announced.has(c.companyId)).map((c) => c.companyId),
      );
    } catch (err) {
      this.logger.warn(`discovery run ${runId} closing notices failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * SONUÇ MESAJININ İKİ SAYISI (gözden geçirme AI-6) — ayrı ayrı:
   *  - `members`: turun talebe DOĞRUDAN davet ettiği Rothern üyesi;
   *  - `emails`: turun sıraya aldığı ve talep kapanmadan GİDEBİLECEK davet
   *    e-postası. Kuyruk satırı tek başına "davet edildi" demek değildir: bu
   *    hafta başka alıcıdan davet almış adresin 7 günlük freni kapanıştan
   *    sonra bitiyorsa dağıtıcı satırı `FREQUENCY` ile düşürür ve e-posta hiç
   *    gitmez; öyle adres sayılmaz (kural dağıtıcıyla AYNI fonksiyon:
   *    `queuedInviteCanLeave`). Durum listesi her adayı yine tek tek gösterir.
   */
  private async invitedCounts(
    runId: string,
    listing: { id: string; closesAt: Date | null },
    now: Date,
  ): Promise<{ members: number; emails: number }> {
    const invited = await this.bypass.supplierDiscoveryCandidate.findMany({
      where: { runId, status: "INVITED" },
      select: { email: true, memberCompanyId: true },
    });
    const members = invited.filter((c) => c.memberCompanyId).length;
    const addresses = [
      ...new Set(invited.filter((c) => !c.memberCompanyId && c.email).map((c) => c.email!.trim().toLowerCase())),
    ];
    if (addresses.length === 0) return { members, emails: 0 };
    const [rows, histories] = await Promise.all([
      this.bypass.externalListingInvite.findMany({
        where: { listingId: listing.id, email: { in: addresses } },
        select: { email: true, state: true, source: true, country: true, sendAfter: true },
      }),
      inviteAddressHistories(this.bypass, addresses, now),
    ]);
    const emails = rows.filter(
      (r) =>
        r.state === "SENT" ||
        (r.state === "QUEUED" && queuedInviteCanLeave(r, histories.get(r.email), listing.closesAt, now)),
    ).length;
    return { members, emails };
  }

  /**
   * Talebi YAYINLAYAN kişi — davetler onun adına yapılır. Talebi yalnız açan
   * kişi yönetebildiği (`listingManageDenial`) için yayınlayan = `createdById`.
   * Oturum kapısıyla (`CompanyJwtStrategy.validate`) aynı etkinlik kuralı:
   * kullanıcı pasif/silinmiş ya da firma pasif/askıdaysa KİMSE davet edilmez.
   * Paket, yönetim izni ve talep durumu davet metotlarının kendi kapılarında.
   */
  private async inviterFor(listing: { companyId: string; createdById: string }): Promise<AuthenticatedCompanyUser | null> {
    const user = await this.bypass.companyUser.findUnique({
      where: { id: listing.createdById },
      select: {
        id: true,
        companyId: true,
        email: true,
        firstName: true,
        lastName: true,
        roles: true,
        permissions: true,
        locale: true,
        isActive: true,
        deletedAt: true,
        company: { select: AUTH_COMPANY_SELECT },
      },
    });
    if (!user || !user.isActive || user.deletedAt || user.companyId !== listing.companyId) return null;
    if (!user.company.isActive || user.company.isBlocked) return null;
    return toAuthenticatedCompanyUser(user);
  }

  /**
   * Turun BEKLEYEN adaylarını davet eder (durum SUGGESTED / MEMBER) ve her
   * adaya sonucunu yazar. Yeniden çağrılabilir: işlenmiş aday bir daha
   * okunmaz.
   *
   * YARIDA KALAN ÇAĞRI (gözden geçirme AI-5): davet edilip durumu yazılamadan
   * süreç ölen aday ikinci denemede davet metodundan ALREADY_INVITED alır —
   * ama onu davet eden BU TURDU. Öyle aday (davet satırı tur başladıktan sonra
   * ve TURUN KENDİ izleriyle yazılmış) INVITED sayılır; yoksa sürdürülen tur
   * "kimse davet edilmedi" der, alıcıya sonuç mesajı gitmez ve durum listesi
   * kendi davet ettiğini "zaten davetliydi" gösterirdi. Tur başlamadan önce
   * davetli olan (alıcının elle daveti) ALREADY_INVITED kalır.
   *
   * "Turun kendi izi" (ikinci gözden geçirme A-4): adreste kaynak `AI_AUTO`
   * (pencere `AI_FORM` yazar); üyede `aiReason.auto = true`. Üyede yalnız
   * `origin: "AI"`ye bakmak yetmez — alıcının tur takılıyken "AI ile tedarikçi
   * bul" penceresinden yaptığı davet de aynı kaynağı taşır ve sürdürülen tur
   * onu kendi daveti sayıp sonuç mesajında "1 üye davet edildi" diyordu.
   *
   * Tur İŞLENDİĞİ andaki talebi okur (AI-2): kutu kapatıldıysa ya da talep
   * özele çevrildiyse kimse davet edilmez (NOT_ALLOWED); arama sürerken
   * daraltılan görünürlük ülkesinin dışında kalan adres NOT_ELIGIBLE olur.
   *
   * Davet metodunun REDDİ (HTTP hatası: paket düşmüş, izin alınmış, talep
   * kapanmış…) adaylara NOT_ALLOWED yazar; beklenmeyen hata (DB) fırlatılır —
   * tur RUNNING kalır ve sürdürülür.
   */
  private async autoInvite(
    run: { id: string; createdAt: Date },
    listing: {
      id: string;
      companyId: string;
      createdById: string;
      status: string;
      visibility: string;
      aiDiscovery: boolean;
      targetCountries: string[];
    },
  ): Promise<void> {
    const runId = run.id;
    const pending = await this.bypass.supplierDiscoveryCandidate.findMany({
      where: {
        runId,
        OR: [
          { status: "SUGGESTED", email: { not: null } },
          { status: "MEMBER", memberCompanyId: { not: null } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, country: true, status: true, memberCompanyId: true },
    });
    if (pending.length === 0) return;
    const mark = async (ids: string[], status: string) => {
      if (ids.length === 0) return;
      await this.bypass.supplierDiscoveryCandidate.updateMany({ where: { id: { in: ids } }, data: { status } });
    };
    const members = pending.filter((c) => c.status === "MEMBER" && c.memberCompanyId);
    const found = pending.filter((c) => c.status === "SUGGESTED" && c.email);
    const listings = this.listings;
    const actor =
      listing.status === "OPEN" && listing.visibility !== "PRIVATE" && listing.aiDiscovery && listings
        ? await this.inviterFor(listing)
        : null;
    if (!actor || !listings) {
      await mark(pending.map((c) => c.id), "NOT_ALLOWED");
      return;
    }
    // Ülkesi bilinen ve talebin GÜNCEL görünürlük ülkelerine uymayan adres
    // (arama sürerken daraltıldı) davet edilmez — üyede aynı kuralı
    // `inviteDiscoveredMembers` uygular.
    const outOfScope = found.filter((c) => c.country && !countryCanSee(listing.targetCountries, c.country));
    await mark(outOfScope.map((c) => c.id), "NOT_ELIGIBLE");
    const externals = found.filter((c) => !outOfScope.includes(c));
    // Davet metotları kiracı istemcisini ve istek dilini okur: yayınlayan
    // kişinin firma bağlamı + kendi dili (kayıtsız alıcının dili yine ülkeden;
    // bu yalnız son geri düşüş).
    await runWithTenantContext({ companyId: actor.companyId, realm: "company" }, () =>
      runWithLocale(actor.locale, async () => {
        if (members.length > 0) {
          try {
            const { results } = await listings.inviteDiscoveredMembers(
              actor,
              listing.id,
              members.map((c) => c.memberCompanyId!),
              { auto: true },
            );
            const st = new Map(results.map((r) => [r.companyId, r.status as string]));
            const again = [...st].filter(([, status]) => status === "ALREADY_INVITED").map(([id]) => id);
            const mine = new Set(
              again.length === 0
                ? []
                : (
                    await this.bypass.listingInvitation.findMany({
                      where: {
                        listingId: listing.id,
                        invitedCompanyId: { in: again },
                        origin: "AI",
                        // Turun KENDİ satırı (`inviteDiscoveredMembers` `auto`
                        // işareti): alıcının "AI ile tedarikçi bul" penceresinden
                        // yaptığı davet de `origin: "AI"` taşır (A-4).
                        aiReason: { path: ["auto"], equals: true },
                        createdAt: { gte: run.createdAt },
                      },
                      select: { invitedCompanyId: true },
                    })
                  ).map((i) => i.invitedCompanyId),
            );
            // Sonuçta olmayan üye = istek üst sınırına sığmadı (günlük tavan).
            const by = groupBy(members, (c) => {
              const status = st.get(c.memberCompanyId!) ?? "DAILY_LIMIT";
              return status === "ALREADY_INVITED" && mine.has(c.memberCompanyId!) ? "INVITED" : status;
            });
            for (const [status, rows] of by) await mark(rows.map((c) => c.id), status);
          } catch (err) {
            if (!(err instanceof HttpException)) throw err;
            this.logger.warn(`discovery run ${runId}: member invites refused (${err.message})`);
            await mark(members.map((c) => c.id), "NOT_ALLOWED");
          }
        }
        if (externals.length > 0) {
          try {
            const { results } = await this.connections.inviteExternalForListing(
              actor,
              listing.id,
              externals.map((c) => ({ email: c.email!, country: c.country })),
              "AI_AUTO",
            );
            const st = new Map(results.map((r) => [r.email, r.status as string]));
            const again = [...st].filter(([, status]) => status === "ALREADY_INVITED").map(([email]) => email);
            const mine = new Set(
              again.length === 0
                ? []
                : (
                    await this.bypass.externalListingInvite.findMany({
                      where: {
                        listingId: listing.id,
                        email: { in: again },
                        source: "AI_AUTO",
                        createdAt: { gte: run.createdAt },
                      },
                      select: { email: true },
                    })
                  ).map((i) => i.email),
            );
            const by = groupBy(externals, (c) => {
              const email = c.email!.trim().toLowerCase();
              const r = st.get(email) ?? "DAILY_LIMIT";
              return r === "QUEUED" || (r === "ALREADY_INVITED" && mine.has(email)) ? "INVITED" : r;
            });
            for (const [status, rows] of by) await mark(rows.map((c) => c.id), status);
          } catch (err) {
            if (!(err instanceof HttpException)) throw err;
            this.logger.warn(`discovery run ${runId}: e-mail invites refused (${err.message})`);
            await mark(externals.map((c) => c.id), "NOT_ALLOWED");
          }
        }
      }),
    );
  }

  /**
   * Süre yarılandı, teklif az → ikinci tur (daha önce bulunanlar hariç).
   * Yalnız yayında otomatik keşfi açık taleplerde; talep başına en fazla iki
   * otomatik tur.
   */
  private async scheduleSecondRounds(now: Date): Promise<number> {
    const rows = await this.bypass.listing.findMany({
      where: {
        status: "OPEN",
        aiDiscovery: true,
        visibility: { not: "PRIVATE" },
        publishedAt: { not: null },
        closesAt: { gt: new Date(now.getTime() + 24 * HOUR_MS) },
        // Uygunluk elemeleri SORGUDA (derin denetim X21/S015): eskiden sirasiz
        // `take: 200` penceresi ikinci turunu almis / yayin turu olmayan /
        // turu suren taleplerle dolup kalanlari hic degerlendirmiyordu.
        // Aramadan düşen tur (kutu kapalıydı / talep özeldi) sayılmaz
        // (`COUNTED_AUTO_RUN_WHERE`, A-3): öyle bir satır ne "yayın turu var"
        // demektir ne de talebin iki turluk hakkından yer.
        AND: [
          { discoveryRuns: { some: { ...COUNTED_AUTO_RUN_WHERE, trigger: "PUBLISH" } } },
          {
            discoveryRuns: {
              none: {
                OR: [
                  { ...COUNTED_AUTO_RUN_WHERE, trigger: "SECOND_ROUND" },
                  { state: { in: ["PENDING", "RUNNING"] } },
                ],
              },
            },
          },
          // ESKİ AKIŞTAN KALAN TALEP (2026-10-08): yayın turunun adayları
          // alıcının onayını bekliyordu ve alıcı onaylamadı (SUGGESTED/MEMBER
          // kaldı). İkinci tur artık bulduğunu KENDİSİ davet ettiği için böyle
          // bir talebe açılmaz — alıcının onaylamadığı aramanın devamı onun
          // adına davet göndermesin. Yeni tur onay bekleyen aday bırakmaz.
          {
            discoveryRuns: {
              none: { trigger: "PUBLISH", candidates: { some: { status: { in: ["SUGGESTED", "MEMBER"] } } } },
            },
          },
        ],
      },
      select: {
        id: true,
        publishedAt: true,
        closesAt: true,
        _count: { select: { bids: { where: { status: "SUBMITTED" } } } },
        discoveryRuns: { select: { trigger: true, state: true, error: true } },
      },
      // Deterministik: kapanisi en yakin (yari suresi once dolan) once.
      orderBy: [{ closesAt: "asc" }, { id: "asc" }],
      take: 200,
    });
    let n = 0;
    for (const l of rows) {
      if (!l.publishedAt || !l.closesAt) continue;
      const auto = l.discoveryRuns.filter(isCountedAutoRun);
      if (auto.length === 0 || auto.length >= MAX_AUTO_RUNS) continue;
      if (auto.some((r) => r.trigger === "SECOND_ROUND")) continue;
      if (l.discoveryRuns.some((r) => r.state === "PENDING" || r.state === "RUNNING")) continue;
      const half = l.publishedAt.getTime() + (l.closesAt.getTime() - l.publishedAt.getTime()) / 2;
      if (now.getTime() < half || l._count.bids >= SECOND_ROUND_MAX_BIDS) continue;
      if (await this.enqueueQuietly(l.id, "SECOND_ROUND")) n++;
    }
    return n;
  }

  /**
   * SONUÇ MESAJI — talebi yayınlayana bildirim + e-posta (tercih
   * `aiSuggestions`). İKİ sayı AYRI söylenir (gözden geçirme AI-6): talebe
   * davet edilen Rothern üyesi ve sıraya alınan davet e-postası; "N tedarikçi
   * davet edildi" toplamı henüz gitmemiş (ve belki hiç gitmeyecek) e-postayı
   * davet sayıyordu. Sıfır olan taraf cümleye girmez (üç ayrı anahtar — iki
   * çoğulu tek cümlede koşula bağlamak EN/RU'da tutmaz). Onaylanacak bir şey
   * yok; bağlantı (`?ai-davet=1`) talep sayfasındaki durum listesini açık
   * getirir. Metin "AI buldu" demez (tur AI kapalıyken de platform üyeleriyle
   * sonuç üretir; karar 74).
   */
  private async notifyCreator(
    listingId: string,
    listing: { title: string; number: string | null; createdById: string },
    counts: { members: number; emails: number },
  ): Promise<void> {
    const text =
      counts.members > 0 && counts.emails > 0
        ? RESULT_TEXT.both
        : counts.members > 0
          ? RESULT_TEXT.members
          : RESULT_TEXT.emails;
    const params = { title: listingTitleParam(listingId, listing.title), members: counts.members, emails: counts.emails };
    const path = `/company/ilan/${listingId}?ai-davet=1`;
    await this.notifications?.pushToUser(listing.createdById, {
      type: AI_SUGGESTIONS_NOTIFICATION,
      titleKey: "api.notifications.discovery.invitedTitle",
      bodyKey: text.body,
      ctaLabelKey: "api.notifications.discovery.invitedCta",
      params,
      ctaPath: path,
      listingId,
      // Kendi alım talebine tedarikçi önerisi → satın alma tarafı (arayüz testi
      // api1-02 yeniden doğrulama; portalsız satır Satış süzgecinde çıkıyordu).
      portal: "satinalma",
    });
    if (!this.email) return;
    const user = await this.bypass.companyUser.findUnique({
      where: { id: listing.createdById },
      select: { email: true, firstName: true, isActive: true, deletedAt: true, notificationPrefs: true, locale: true },
    });
    if (!user || !user.isActive || user.deletedAt) return;
    if (!isNotificationEnabled(user.notificationPrefs as Record<string, boolean> | null, AI_SUGGESTIONS_NOTIFICATION)) return;
    const locale: Locale = isLocale(user.locale) ? user.locale : "tr";
    const title = listing.title;
    const t = (key: Parameters<typeof tApi>[0]) =>
      tApi(key, { members: counts.members, emails: counts.emails, title, number: listing.number ?? "—" }, locale);
    const subject = t(text.subject);
    await this.email.send({
      to: { email: user.email, name: user.firstName },
      locale,
      subject,
      templateData: {
        template: "notification",
        data: {
          subject,
          heading: t("api.notifications.discovery.invitedTitle"),
          paragraphs: [
            tApi("api.notifications.common.greeting", undefined, locale),
            t("api.notifications.discovery.invitedEmailIntro"),
            ...(counts.members > 0 ? [t("api.notifications.discovery.invitedEmailMembers")] : []),
            ...(counts.emails > 0 ? [t("api.notifications.discovery.invitedEmailEmails")] : []),
            t("api.notifications.discovery.invitedEmailOutro"),
          ],
          ctaLabel: t("api.notifications.discovery.invitedCta"),
          ctaUrl: `${appRoutes.listing(resolveWebUrl(this.config), listingId, locale)}?ai-davet=1`,
          footerNote: t("api.notifications.discovery.invitedEmailFooter"),
        },
      },
      context: { type: AI_SUGGESTIONS_NOTIFICATION, id: listingId },
    });
  }

  // ------------------------------------------------------------------ alıcı uçları

  private async ownListing(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, companyId: user.companyId },
      select: {
        id: true,
        type: true,
        createdById: true,
        status: true,
        visibility: true,
        aiDiscovery: true,
        bidsOpenAt: true,
        categoryIds: true,
      },
    });
    if (!listing) throw new NotFoundException(i18nMessage("api.companyConnections.satinAlmaTalebiBulunamadi"));
    if (listingManageDenial(user, listing)) {
      throw new ForbiddenException(i18nMessage("api.companyConnections.buSatinAlmaTalebiIcinDis"));
    }
    return listing;
  }

  /**
   * Talebin keşif sonuçları (tüm turlar, en yeni önce) — yayın paneli ve talep
   * sayfası bandı. YALNIZ DURUM: her aday davet sonucunu taşır (`invite` +
   * `inviteReason` + kuyruktaysa `sendAfter`); onaylanacak bir şey yoktur.
   *
   * Sonucun kaynağı aday satırı tek başına DEĞİL (GA3): davet tabloları okunur
   * — e-posta daveti gönderildi mi, kuyrukta mı, dağıtıcı düşürdü mü
   * (`external_listing_invites.state` + `cancelReason`); üye talebe davetli mi
   * (`listing_invitations`). Pencereden/elle sonradan davet edilen aday da
   * böylece "davet edildi" görünür.
   */
  async forListing(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.ownListing(user, listingId);
    const runs = await this.prisma.supplierDiscoveryRun.findMany({
      where: { listingId, trigger: { not: "FORM" } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        trigger: true,
        state: true,
        createdAt: true,
        finishedAt: true,
        dismissedAt: true,
        candidates: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            email: true,
            website: true,
            city: true,
            country: true,
            reason: true,
            matchedItems: true,
            scope: true,
            status: true,
            recentlyInvited: true,
            memberCompanyId: true,
            matchedCategories: true,
            source: true,
          },
        },
      },
    });
    const emails = runs.flatMap((r) => r.candidates.map((c) => c.email)).filter((e): e is string => !!e);
    const memberIds = runs.flatMap((r) => r.candidates.map((c) => c.memberCompanyId)).filter((m): m is string => !!m);
    const [queueRows, invitedMembers] = await Promise.all([
      this.prisma.externalListingInvite.findMany({
        where: { listingId, email: { in: emails } },
        select: { email: true, state: true, cancelReason: true, sendAfter: true },
      }),
      this.prisma.listingInvitation.findMany({
        where: { listingId, invitedCompanyId: { in: memberIds } },
        select: { invitedCompanyId: true },
      }),
    ]);
    const queueByEmail = new Map(queueRows.map((i) => [i.email, i]));
    const invitedMember = new Set(invitedMembers.map((i) => i.invitedCompanyId));
    const shownBadges = runs.some((r) => r.candidates.some((c) => c.matchedCategories.length > 0))
      ? await this.visibleBadgeNames(listing.categoryIds)
      : new Set<string>();
    return {
      // Özel talepte otomatik arama yok (tur hiç yazılmaz) — ekran beklemesin.
      aiDiscovery: listing.aiDiscovery && listing.visibility !== "PRIVATE",
      listingStatus: listing.status,
      // Embargolu talep: otomatik tur açılışta yazılır — ekran "aranıyor" değil
      // "açılınca başlar" der ve boşuna yoklamaz (derin denetim 2026-09-29 S090).
      startsAt: listing.bidsOpenAt && listing.bidsOpenAt > new Date() ? listing.bidsOpenAt.toISOString() : null,
      runs: runs.map((r) => {
        const active = r.state === "PENDING" || r.state === "RUNNING";
        return {
          ...r,
          candidates: r.candidates.map((c) => {
            const queue = c.email ? queueByEmail.get(c.email) : undefined;
            const memberInvited = !!c.memberCompanyId && invitedMember.has(c.memberCompanyId);
            return {
              ...c,
              matchedCategories: c.matchedCategories.filter((n) => shownBadges.has(n)),
              status:
                (c.status === "MEMBER" || c.status === MEMBER_WEAK_MATCH) && memberInvited
                  ? "INVITED"
                  : c.status === "SUGGESTED" && queue
                    ? "INVITED"
                    : c.status,
              ...candidateInvite({ status: c.status, memberCompanyId: c.memberCompanyId, memberInvited, queue, active }),
            };
          }),
        };
      }),
    };
  }

  /**
   * Aday satırındaki rozet adları tur ANINDA dondurulur (`matchedCategories`
   * ad saklar, kod değil) — segment sonradan gizlendiyse eski turun satırı
   * gizli kategorinin adını taşır (2026-10-09). Rozet her zaman TALEBİN kendi
   * kategori zincirinden bir düğümdür (eşleşme = firma beyanı ∩ zincir), bu
   * yüzden okuma BEYAZ LİSTE uygular: saklanan ad yalnız talebin bugünkü
   * zincirindeki GÖRÜNÜR bir kategorinin adıysa (üç dilden biri) döner. Gizli
   * segmentin adı, katalogdan kalkmış eski ad ve talepten çıkarılmış kategori
   * düşer (kapalı tarafa düşer). Zincir en fazla birkaç birincil anahtar okuması.
   */
  private async visibleBadgeNames(categoryIds: readonly string[]): Promise<Set<string>> {
    const { segmentIds, subCandidates } = deriveCategoryMatchCandidates(visibleCategoryIds(categoryIds));
    const chain = [...segmentIds, ...subCandidates];
    if (chain.length === 0) return new Set();
    const rows = await this.prisma.category.findMany({
      where: { id: { in: chain }, ...hiddenCategoryWhere() },
      select: CATEGORY_NAME_SELECT,
    });
    return new Set(rows.flatMap((r) => [r.nameTr, r.nameEn, r.nameRu]).filter((n): n is string => !!n));
  }

  /** Formdan/pencereden seçilen üyeler (aday kaydı olmadan, firma kimliğiyle). */
  async inviteMembers(user: AuthenticatedCompanyUser, listingId: string, companyIds: string[]) {
    await this.ownListing(user, listingId);
    if (!this.listings) return { results: [] };
    return this.listings.inviteDiscoveredMembers(user, listingId, companyIds);
  }

  /** Öneri bandını kapat (bu talepteki turlar bir daha bildirilmez). */
  async dismiss(user: AuthenticatedCompanyUser, listingId: string) {
    await this.ownListing(user, listingId);
    await this.prisma.supplierDiscoveryRun.updateMany({
      where: { listingId, dismissedAt: null },
      data: { dismissedAt: new Date() },
    });
    return { ok: true };
  }
}

type CandidateRow = {
  name: string;
  email: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  reason: string | null;
  matchedItems: number[];
  scope: string | null;
  status: string;
  recentlyInvited: boolean;
  memberCompanyId: string | null;
  matchedCategories: string[];
  source: string;
};

/**
 * Platform üyeleri + web adayları TEK listede: web'de bulunup üyeyle eşleşen
 * aday platform satırına katılır (kaynak BOTH, kalemler birleşir); platformda
 * çıkmayan web üyesi kendi satırıyla üye sayılır. Önceki turlarda önerilmiş
 * üye yeniden önerilmez.
 *
 * `strongMembersOnly` (the automatic run, AUTO-MEMBER-1): a platform member
 * the matcher does not call a strong match is written `WEAK_MATCH` instead of
 * `MEMBER` - recorded, not invited (`MEMBER_WEAK_MATCH`). When the web search
 * found the same company for this request, that second source decides: it is
 * invited after all.
 */
export function mergeCandidates(
  platform: DiscoveryCandidate[],
  web: AnnotatedCandidate[],
  seenMembers: Set<string>,
  buyerCountry: string | null,
  opts: { strongMembersOnly?: boolean } = {},
): CandidateRow[] {
  const scopeOf = (country: string | null) =>
    country && buyerCountry ? (country === buyerCountry ? "LOCAL" : "ABROAD") : null;
  const rows: CandidateRow[] = platform.map((p) => ({
    name: p.name,
    email: null,
    website: null,
    city: p.city,
    country: p.country,
    reason: null,
    matchedItems: p.matchedItems,
    scope: scopeOf(p.country),
    status: p.alreadyInvited
      ? "ALREADY_INVITED"
      : opts.strongMembersOnly && !p.strongMatch
        ? MEMBER_WEAK_MATCH
        : "MEMBER",
    recentlyInvited: false,
    memberCompanyId: p.companyId,
    matchedCategories: p.matchedCategories,
    source: "PLATFORM",
  }));
  const byMember = new Map(rows.map((r) => [r.memberCompanyId!, r]));
  for (const c of web) {
    if (c.memberCompanyId) {
      const hit = byMember.get(c.memberCompanyId);
      if (hit) {
        hit.source = "BOTH";
        if (hit.status === MEMBER_WEAK_MATCH) hit.status = "MEMBER";
        hit.matchedItems = [...new Set([...hit.matchedItems, ...c.matchedItems])].sort((a, b) => a - b);
        hit.reason = hit.reason ?? c.reason;
        continue;
      }
      if (seenMembers.has(c.memberCompanyId)) continue;
    }
    const row: CandidateRow = {
      name: c.name,
      email: c.email,
      website: c.website,
      city: c.city,
      country: c.country,
      reason: c.reason,
      matchedItems: c.matchedItems,
      scope: c.scope,
      status: c.status,
      recentlyInvited: c.recentlyInvited,
      memberCompanyId: c.memberCompanyId,
      matchedCategories: [],
      source: "WEB",
    };
    rows.push(row);
    if (c.memberCompanyId) byMember.set(c.memberCompanyId, row);
  }
  return rows;
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/**
 * Kuyruk satırına yazılan iptal nedeni → ekranın nedeni. Dağıtıcı: OPTED_OUT ·
 * REGISTERED · PAUSED · FREQUENCY · SUPPRESSED · ALLOWLIST · COUNTRY_BLOCKED ·
 * LISTING_CLOSED (aynen geçer); alıcı davet bağlantısını iptal etti →
 * CANCELLED; firmanın paketi düştü → NOT_ALLOWED.
 */
function queueCancelReason(reason: string | null): string {
  // `AUTO_INVITE_OFF`: talep özele çevrildi ya da otomatik arama kapatıldı —
  // turun kuyruğa aldığı davet gönderilmeden düştü (AI-1). Kendi koduyla döner
  // (canlı doğrulama AUTO-UI-7): ekran nedenin alıcının KENDİ ayarı olduğunu ve
  // ayar geri alınınca davetin yeniden sıraya gireceğini söyler; `CANCELLED`
  // yalnız alıcının bağlantıyı elle iptal etmesidir.
  if (reason === "REFERRAL_CANCELLED") return "CANCELLED";
  if (reason === "INVITER_DOWNGRADED") return "NOT_ALLOWED";
  return reason ?? "FAILED";
}

/**
 * Adayın davet sonucu — SAF. Öncelik: tur bulduğunda zaten davetliydi →
 * üyenin talep daveti → e-posta kuyruğu satırı → aday satırına yazılan
 * "gönderilmedi" nedeni → tur sürüyorsa bekliyor.
 */
export function candidateInvite(c: {
  status: string;
  memberCompanyId: string | null;
  memberInvited: boolean;
  queue?: { state: string; cancelReason: string | null; sendAfter: Date } | undefined;
  /** Tur sürüyor (PENDING / RUNNING). */
  active: boolean;
}): { invite: CandidateInviteState; inviteReason: string | null; sendAfter: string | null } {
  const out = (invite: CandidateInviteState, inviteReason: string | null = null, sendAfter: string | null = null) => ({
    invite,
    inviteReason,
    sendAfter,
  });
  if (c.status === "ALREADY_INVITED") return out("ALREADY_INVITED");
  if (c.memberCompanyId && c.memberInvited) return out("INVITED");
  // Üye e-posta kuyruğuna girmez; adresi eşleşse de kuyruk satırı ona ait sayılmaz.
  if (!c.memberCompanyId && c.queue) {
    if (c.queue.state === "SENT") return out("INVITED");
    if (c.queue.state === "QUEUED") return out("QUEUED", null, c.queue.sendAfter.toISOString());
    return out("NOT_SENT", c.queue.state === "FAILED" ? "FAILED" : queueCancelReason(c.queue.cancelReason));
  }
  if (NOT_SENT_STATUSES.has(c.status)) return out("NOT_SENT", c.status === "SKIPPED_REGISTERED" ? "REGISTERED" : c.status);
  if ((c.status === "SUGGESTED" || c.status === "MEMBER") && c.active) return out("WAITING");
  return out("NOT_SENT");
}

