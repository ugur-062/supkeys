import { entitlementForbidden } from "../../../common/company/entitlement-required";
import { i18nMessage } from "../../../common/i18n/http-i18n";
import {
  REVIEW_SUMMARY_SELECT,
  REVIEW_SUMMARY_TAKE,
  buildReviewSummary,
} from "../../company-reviews/review-summary";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BUYING_TIER, EMAIL_MAX_LENGTH, isCategoryCode, looksLikeProse, normalizeShortCode, tierAtLeast, validateShortCode, PAID_TIER, visibleCategoryIds } from "@rothern/shared";
import { publicProductWhere } from "../../../common/company/public-profile-gate";
import { buildDirectory, directoryFacets, type DirectoryParams, type DirectoryScope } from "../../../common/company/company-directory";
import { PRODUCT_INDEX_SELECT, toProductIndexCard } from "../../public-marketplace/dto/public-product-index.projection";
import { Prisma } from "@rothern/db";
import {
  PrismaService,
  PrismaBypassService,
} from "../../../common/prisma/prisma.service";
import { CompanyViewsService } from "../../company-views/company-views.service";
import { ContentTranslationService } from "../../content-translation/content-translation.service";
import { currentLocale } from "../../../common/i18n/locale-context";
import { CATEGORY_NAME_SELECT, categoryName } from "../../../common/company/category-name";
import { runTenantTx } from "../../../common/prisma/tenant-tx";
import { AuditService } from "../../audit/audit.service";
import { CompanyBlocksService } from "../../company-blocks/company-blocks.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { EmailService } from "../../email/email.service";
import { maskEmail } from "../../email/email-unsubscribe.service";
import {
  NotificationService,
  localeOf,
} from "../../notifications/notification.service";
import { tApi, type ApiMessageKey } from "../../../common/i18n/i18n.service";
import { appRoutes } from "../../../common/company/app-routes";
import { resolveWebUrl } from "../../../common/config/web-url";
import {
  effectiveTier,
  anyPackageWhere,
} from "../../../common/company/effective-tier";
import { MARKETPLACE_STATUSES, visibleOwnerListingWhere } from "../../../common/company/listing-visibility";
import { hasValidConnection } from "../../../common/company/valid-connection";
import { visibleTaxNumber } from "../../../common/company/visible-tax-number";
import { listingManageDenial } from "../../company-listings/listing-manage-access";
import { affinityReasonTextThirdParty } from "../../company-affinity/company-affinity.service";
import {
  REFERRAL_BATCH_MAX,
  REFERRAL_DAILY_CAP,
  REFERRAL_RESEND_COOLDOWN_DAYS,
  deliverInvite,
  referralCooldownStart,
  type InviteDeliveryResult,
} from "../../../common/company/invite-delivery";
import { isLocale, recipientLocale, type Locale } from "@rothern/i18n";
import {
  AUTO_INVITE_OFF_REASON,
  COMPANY_DAILY_INVITE_CAP,
  INVITE_WINDOW_JITTER_MINUTES,
  coldInviteBlockedByCountry,
  inviteQueueSendAt,
  registrationBlockedCountry,
  utcDayStart,
  type InviteSourceKind,
  type QueuedInviteDropReason,
  type QueuedLetter,
} from "../../../common/company/external-invite-policy";
import { queuedInviteForecasts, waitingLetterTimes } from "./external-invite-dispatcher.service";
import {
  INVITE_LISTING_SELECT,
  InviteContentBuilder,
  type InviteListing,
} from "../../../common/company/external-invite-content";
import { countryFromEmailDomain } from "../../../common/time/country-time-zone";

type ConnectionOrigin = "INVITE" | "PREMIUM" | "ADMIN";

const EXTERNAL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Uzunluk ÖNCE (ReDoS — bkz. `EMAIL_MAX_LENGTH`). */
const isExternalEmail = (e: string) => e.length <= EMAIL_MAX_LENGTH && EXTERNAL_EMAIL_RE.test(e);
/** Kayıtsız önizlemede gösterilen en fazla kalem (e-postada 10). */
const PREVIEW_ITEM_LIMIT = 100;
/** Bağlantı kartı küçük resim sorgularında aynı anda en fazla bu kadar firma. */
const PREVIEW_THUMB_CONCURRENCY = 8;

/**
 * Dış talep daveti — adres başına GERÇEK sonuç (2026-09-27). Eskiden yalnız
 * SENT/SKIPPED vardı ve SENT gönderimden ÖNCE yazılıyordu.
 */
export type ExternalInviteStatus =
  | "QUEUED"
  | "SENT"
  | "FAILED"
  | "SUPPRESSED"
  | "SKIPPED_REGISTERED"
  | "ALREADY_INVITED"
  | "OPTED_OUT"
  | "DAILY_LIMIT"
  | "CONSENT_REQUIRED"
  | "COUNTRY_BLOCKED"
  | "INVALID";

/** Davetle gelen firmanın kayıt/onboarding formuna önceden doldurma. */
export interface ReferralPrefill {
  email: string | null;
  companyName: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
}

export interface ExternalInviteResult {
  email: string;
  status: ExternalInviteStatus;
  reason?: string;
  /**
   * QUEUED: the moment the e-mail can really leave (the recipient's business
   * hours; after the address's 7-day hold when it has one) - the dispatcher's
   * forecast, the same value the request page shows. Absent when the letter
   * will not leave (`notSentReason`).
   */
  sendAfter?: string;
  /**
   * QUEUED, but the letter will NOT leave before the request closes: the
   * reason code the request page shows for the same row (`FREQUENCY`, `PAUSED`,
   * `CLOSES_FIRST`). The row stays in the queue (the address is invited: it is
   * linked to the request when it registers), so `status` stays `QUEUED`.
   */
  notSentReason?: QueuedInviteDropReason;
}

/**
 * Dış davet alıcısı — ekranda satır başına dil seçilir (varsayılanı ülke/
 * uzantıdan), AI keşfi firmanın ülkesini de taşır. Hepsi isteğe bağlı: eski
 * istemci yalnız adres gönderir, dil sunucuda `recipientLocale` ile türer.
 */
export interface ExternalInviteRecipient {
  email: string;
  locale?: string | null;
  country?: string | null;
}

/** Bağlantı kartı için firma alanları (ihale daveti adımı + bağlantılar). */
const COMPANY_CARD_SELECT = {
  id: true,
  name: true,
  rothernId: true,
  tier: true,
  membershipEndAt: true, // INV-TIER-1: effectiveTier hesabı için
  // taxNumber BİLEREK YOK (derin denetim Y-06): şahıs firmasında vergi no =
  // sahibin TCKN'si; kart onu hiç kullanmıyor → karşı firmaya taşınmaz.
  city: true,
  country: true,
  industry: true,
  activities: true,
  // Davet seçicisi kalem/kategori uygunluğuna göre sıralar (2026-09-19).
  sellerCategoryIds: true,
  sellerSubCategoryIds: true,
  logoUrl: true,
  companyVerificationStatus: true,
  users: {
    where: { isActive: true, deletedAt: null },
    take: 1,
    orderBy: { createdAt: "asc" as const },
    select: { firstName: true, lastName: true, email: true },
  },
} as const;

/**
 * Bekleyen istek kartı (gelen/giden) — kimlik + karar için gereken nitelikler.
 * İletişim, vergi no ve kategori beyanı TAŞINMAZ: bağlantı kurulmadı (D-266).
 */
const PENDING_CARD_SELECT = {
  id: true,
  name: true,
  rothernId: true,
  city: true,
  country: true,
  industry: true,
  logoUrl: true,
  companyVerificationStatus: true,
} as const;

@Injectable()
export class CompanyConnectionsService {
  private readonly logger = new Logger(CompanyConnectionsService.name);
  /** Süreç içi referral gönderim hakları — `claimReferralSend` (FX-00 O-093). */
  private readonly referralSendsInFlight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly bypass: PrismaBypassService,
    private readonly blocks: CompanyBlocksService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    /** Ziyaret Edenler kaydı — SONDA ve isteğe bağlı (elle kurulan test rig'leri kırılmasın). */
    @Optional() private readonly views?: CompanyViewsService,
    /** i18n Faz 1e: başka firmanın profili/kartı okuyucunun dilinde — SONDA ve isteğe bağlı. */
    @Optional() private readonly translations?: ContentTranslationService,
  ) {}

  /** Kendi Rothern ID. */
  async getSelf(user: AuthenticatedCompanyUser) {
    const c = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { rothernId: true },
    });
    return { rothernId: c?.rothernId ?? null };
  }

  /**
   * Rothern ID (rothernId) ile bağlantı isteği — PLATFORM (PREMIUM) bağlantısı.
   * Sadece PAKET gönderebilir; premium bitince bu bağlantı pasifleşir.
   */
  async invite(user: AuthenticatedCompanyUser, rothernIdRaw: string) {
    if (!tierAtLeast(user.tier, "SILVER")) {
      throw entitlementForbidden(user.companyVerificationStatus, {
        key: "api.companyConnections.baglantiDavetiIcinDogrulama",
      });
    }
    const code = normalizeShortCode(rothernIdRaw);
    if (!validateShortCode(code)) {
      throw new BadRequestException(i18nMessage("api.companyConnections.gecersizRothernIdXxxxXxxx"));
    }
    const target = await this.prisma.company.findUnique({
      where: { rothernId: code },
      select: { id: true, name: true, isActive: true, isBlocked: true },
    });
    if (!target || !target.isActive || target.isBlocked) {
      throw new NotFoundException(i18nMessage("api.companyConnections.buRothernIdYeSahipFirma"));
    }
    return this.createRequest(user, target, "PREMIUM");
  }

  /**
   * E-posta ile davet. Kayıtlıysa doğrudan INVITE bağlantı isteği; değilse
   * ReferralInvite kaydı + davet e-postası. Hedef bu e-posta ile kayıt olunca
   * (signup hook) otomatik INVITE bağlantı kurulur.
   *
   * 2026-09-27 davet denetimi: gönderim BEKLENİR ve gerçek sonuç döner
   * (`delivery`); günlük firma tavanı (REFERRAL_DAILY_CAP, `/batch` ile ORTAK)
   * ve adres başına 7 günlük tekrar freni (ALREADY_INVITED). Eskiden her
   * çağrı aynı adrese yeniden e-posta atıyor ve yanıt gönderimden önce
   * "gitti" diyordu.
   */
  async inviteByEmail(user: AuthenticatedCompanyUser, emailRaw: string, locale?: string | null) {
    const release = this.claimReferralSend(user.companyId, emailRaw);
    try {
      const prepared = await this.prepareReferralInvite(user, emailRaw, locale);
      if (prepared.kind === "request") return prepared;
      const res = await this.sendReferralInvite(prepared);
      return {
        kind: "invited" as const,
        email: prepared.email,
        delivery: res.delivery,
        emailSent: res.delivery === "SENT",
        // SUPPRESSED'in alt nedeni — ekran "bu alan adına teslim edilemez" der.
        ...(res.undeliverable ? { undeliverable: true as const } : {}),
        // Yalnız staging: alıcı EMAIL_ALLOWLIST'te yok — "bu ortamda gönderilmedi".
        ...(res.allowlist ? { allowlist: true as const } : {}),
      };
    } finally {
      release();
    }
  }

  /**
   * (Davet eden × adres) için SÜREÇ İÇİ gönderim hakkı (arayüz testi FX-00
   * O-093): 7 günlük fren e-posta kaydını okur, kayıt gönderimden SONRA
   * yazılır → eşzamanlı iki "Davet gönder" ikisi de freni boş görüp kayıtsız
   * adrese 1 ms arayla iki e-posta atıyordu. Hak senkron alınır (ilk await'ten
   * önce) ve gönderim bitince bırakılır; başarısız gönderim freni tetiklemez
   * (bırakılan hakla hemen yeniden denenebilir). Tek API örneğinde tam
   * koruma; çok örnekte örnek başına.
   */
  private claimReferralSend(companyId: string, emailRaw: string): () => void {
    const key = `${companyId}:${emailRaw.trim().toLowerCase()}`;
    if (this.referralSendsInFlight.has(key)) {
      throw new ConflictException(
        i18nMessage("api.companyConnections.buAdreseDahaOnceDavetGonderilmis", undefined, "ALREADY_INVITED"),
      );
    }
    this.referralSendsInFlight.add(key);
    return () => {
      this.referralSendsInFlight.delete(key);
    };
  }

  /**
   * Referral daveti ÖN AŞAMASI — kapılar + kayıt; e-posta GÖNDERMEZ.
   * Kayıtlı adres → bağlantı isteği (gönderilecek e-posta yok). Aksi hâlde
   * gönderilecek davet döner; kayıt `updatedAt`i ilerletilir (son gönderim
   * zamanı: tavan sayımı ve 30 günlük token ömrü buradan okur).
   * Frenler anahtarlı istisna atar (`code`): ALREADY_INVITED, DAILY_LIMIT,
   * OPTED_OUT — toplu uç bunları adres başına sonuca çevirir.
   *
   * DİL (2026-09-27): alıcı kayıtlı değil → ekranda seçilen dil; yoksa
   * kayıttaki önceki davetin dili (yeniden gönderim aynı dilde); yoksa
   * `recipientLocale` (e-posta uzantısı → davet edenin dili). Kayda yazılır.
   * Eskiden davet edenin diliydi: Türk alıcının Kazak tedarikçiye davetini
   * Türkçe e-posta + Türkçe kayıt bağlantısı taşıyordu.
   */
  private async prepareReferralInvite(
    user: AuthenticatedCompanyUser,
    emailRaw: string,
    localeRaw?: string | null,
    /**
     * Aynı toplu istekte bu adresten ÖNCE gönderime ayrılmış davet sayısı.
     * Gönderimler 2. aşamada yapıldığı için e-posta kaydı henüz yok; sayılmazsa
     * gün içinde 49 davet atmış firma tek partide 50 daha atabiliyordu.
     */
    reservedInBatch = 0,
  ): Promise<
    | { kind: "request"; targetName: string }
    | { kind: "send"; email: string; inviteId: string; token: string; inviterName: string; locale: Locale }
  > {
    if (!tierAtLeast(user.tier, "SILVER")) {
      throw entitlementForbidden(user.companyVerificationStatus, {
        key: "api.companyConnections.baglantiDavetiIcinDogrulama",
      });
    }
    const email = emailRaw.trim().toLowerCase();

    // Kayıtlı mı? E-posta CompanyUser'da benzersizdir — pasif/çıkarılmış
    // kullanıcı e-postasına referral maili göndermek boşa gider (o e-postayla
    // yeniden kayıt olunamaz). Kullanıcı pasif ama FİRMA aktifse istek yine
    // firmaya gider; firma pasifse anlamlı hata verilir.
    //
    // REGISTERED = an account whose e-mail is VERIFIED (arayuz testi 2026-10
    // authsec-1; same rule as `inviteExternalForListing` and the dispatcher's
    // `addressState`). An unverified sign-up has not proven that it owns the
    // address: anyone can type a supplier's address at sign-up, and the
    // request used to go straight to that account's company - which then
    // moved to its own mailbox ("change e-mail"), verified there and accepted
    // the request. Such an address is handled like an unregistered one: the
    // invitation is stored and mailed TO THE ADDRESS, and it becomes a pending
    // request only for the account that proves that address
    // (`acceptReferralInvites`, `{ email }` branch, at e-mail verification).
    const existing = await this.prisma.companyUser.findUnique({
      where: { email },
      select: {
        emailVerifiedAt: true,
        company: {
          select: { id: true, name: true, isActive: true, isBlocked: true },
        },
      },
    });
    if (existing?.company && existing.emailVerifiedAt) {
      if (!existing.company.isActive || existing.company.isBlocked) {
        throw new BadRequestException(
          i18nMessage("api.companyConnections.buEPostaAdresininBagliOldugu"),
        );
      }
      const res = await this.createRequest(user, existing.company, "INVITE");
      return { kind: "request", targetName: res.targetName };
    }

    // Kayıtsız → davet kaydı (varsa koru) + e-posta.
    // Denetim 2026-08-23 P2 #14: opt-out (/davet-kapat) TÜM davet yollarında
    // geçerli — yalnız dış-ihale yolunda uygulanıyordu.
    const optedOut = await this.prisma.referralOptOut.findFirst({
      where: { email },
      select: { email: true },
    });
    if (optedOut) {
      throw new ConflictException(
        i18nMessage("api.companyConnections.buEPostaAdresiDavetAlmak", undefined, "OPTED_OUT"),
      );
    }

    const prior = await this.prisma.companyReferralInvite.findUnique({
      where: { inviterCompanyId_email: { inviterCompanyId: user.companyId, email } },
      select: { id: true, status: true, locale: true },
    });
    // Kabul edilmiş davet yeniden gönderilmez (adres kayıt olmadan — farklı
    // e-postayla kayıt — kabul edilmiş olabilir; token zaten kullanıldı).
    // İptal edilmiş (CANCELLED) davet AYNI satırla yeniden açılır → 7 günlük
    // fren ve günlük tavan satır kimliğine bağlı kalır.
    if (prior?.status === "ACCEPTED") {
      throw new ConflictException(
        i18nMessage("api.companyConnections.buAdreseDahaOnceDavetGonderilmis", undefined, "ALREADY_INVITED"),
      );
    }
    // 7 günlük tekrar freni: son 7 günde bu kayda (referral ya da dış talep
    // daveti) TESLİM EDİLMİŞ/yolda bir e-posta varsa yeniden gönderilmez.
    // Başarısız gönderim freni tetiklemez — kullanıcı yeniden deneyebilir.
    // Dış talep daveti e-postası `ExternalListingInvite` kimliğiyle loglanır
    // (dispatcher `context.id = first.id`; özet e-postada başka davet edenin
    // satırı bile olabilir) — referral satırının kimliğiyle DEĞİL. Eskiden
    // `contextId: prior.id` ile arandığı için dış davet freni hiç tetiklemiyordu
    // (derin denetim LU-07). Talep davetinin gidişi kendi satırından okunur:
    // `sentAt` yalnız başarılı gönderimde, `reminderSentAt` hatırlatma
    // denemesinde (başarısızsa yazılmaz) damgalanır.
    if (prior) {
      const since = referralCooldownStart();
      const [recentReferral, recentTender] = await Promise.all([
        this.prisma.emailLog.findFirst({
          where: {
            contextType: "referral_invite",
            contextId: prior.id,
            status: { not: "FAILED" },
            queuedAt: { gte: since },
          },
          select: { id: true },
        }),
        this.prisma.externalListingInvite.findFirst({
          where: {
            referralInviteId: prior.id,
            OR: [{ sentAt: { gte: since } }, { reminderSentAt: { gte: since } }],
          },
          select: { id: true },
        }),
      ]);
      const recent = recentReferral ?? recentTender;
      if (recent) {
        throw new ConflictException(
          i18nMessage(
            "api.companyConnections.buAdreseSonGunlerdeDavetGonderildi",
            { days: REFERRAL_RESEND_COOLDOWN_DAYS },
            "ALREADY_INVITED",
          ),
        );
      }
    }

    // Günlük firma tavanı (UTC günü; invite-by-email + /batch ORTAK). Sayım
    // gönderim DENEMESİ üzerinden: bugün dokunulan davet kayıtlarının bugünkü
    // referral e-posta kayıtları (suppress/başarısız da sayılır — itibar freni).
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const touchedToday = await this.prisma.companyReferralInvite.findMany({
      where: { inviterCompanyId: user.companyId, updatedAt: { gte: dayStart } },
      select: { id: true },
    });
    const sentToday =
      touchedToday.length === 0
        ? 0
        : await this.prisma.emailLog.count({
            where: {
              contextType: "referral_invite",
              contextId: { in: touchedToday.map((r) => r.id) },
              queuedAt: { gte: dayStart },
            },
          });
    if (sentToday + reservedInBatch >= REFERRAL_DAILY_CAP) {
      throw new HttpException(
        i18nMessage(
          "api.companyConnections.gunlukDavetLimitineUlasildi",
          { cap: REFERRAL_DAILY_CAP },
          "DAILY_LIMIT",
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const me = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true },
    });
    const locale: Locale = isLocale(localeRaw)
      ? localeRaw
      : isLocale(prior?.locale)
        ? prior.locale
        : recipientLocale({ email, fallback: currentLocale() });
    // `updatedAt` = son gönderim zamanı (tavan sayımı + 30 günlük token ömrü).
    const inv = await this.prisma.companyReferralInvite.upsert({
      where: {
        inviterCompanyId_email: { inviterCompanyId: user.companyId, email },
      },
      create: {
        inviterCompanyId: user.companyId,
        email,
        invitedById: user.userId,
        locale,
      },
      update: { updatedAt: new Date(), locale, status: "PENDING" },
      select: { id: true, token: true },
    });
    return {
      kind: "send",
      email,
      inviteId: inv.id,
      token: inv.token,
      inviterName: this.companyNameOr(me?.name, locale),
      locale,
    };
  }

  /** Referral davet e-postası — BEKLENİR; sonuç `delivery`. */
  private async sendReferralInvite(p: {
    email: string;
    inviteId: string;
    token: string;
    inviterName: string;
    locale: Locale;
  }): Promise<InviteDeliveryResult> {
    const baseUrl = resolveWebUrl(this.config);
    // Alıcı kayıtlı DEĞİL → davette çözülen ALICI dili (kayıtta saklı).
    const locale = p.locale;
    const res = await deliverInvite(() =>
      this.email.send({
        to: { email: p.email },
        locale,
        templateData: {
          template: "referral_invite",
          data: {
            inviterName: p.inviterName,
            email: p.email,
            registerUrl: appRoutes.signupWithRef(baseUrl, p.token, locale),
            // Tek tık çıkış — dış talep davetiyle AYNI mekanizma (/davet-kapat).
            optOutUrl: appRoutes.optOut(baseUrl, p.token, locale),
          },
        },
        context: { type: "referral_invite", id: p.inviteId },
      }),
    );
    if (res.delivery !== "SENT") {
      this.logger.error(
        `Davet e-postası gönderilemedi (${p.inviteId}): ${res.delivery}${
          res.timedOut ? " (timeout)" : ""
        }${res.error ? ` — ${res.error}` : ""}`,
      );
    }
    return res;
  }

  /**
   * Toplu e-posta daveti (eski sistem paritesi, 50'ye kadar). Her adres tek
   * tek işlenir ve SINIFLANDIRILMIŞ sonuç döner — biri patlarsa diğerleri
   * etkilenmez:
   *  - request  → kayıtlı firmaya bağlantı isteği gitti
   *  - invited  → kayıtsız, davet e-postası gitti
   *  - skipped  → gönderilmedi (zaten bağlı / zaten istekli / kendi firması /
   *               pasif firma / engelli) — reason ile
   */
  /**
   * DIŞ TALEP DAVETİ — KUYRUĞA ALIR (2026-09-27, teslim edilebilirlik Faz 0b).
   *
   * Eskiden e-posta bu istekte, adres adres BEKLENEREK gönderiliyordu ve davet
   * `CompanyReferralInvite` satırının kendisiydi (davet eden × adres benzersiz →
   * bir alıcı aynı tedarikçiyi yalnız İLK talebine davet edebiliyordu). Artık:
   *  - referral satırı (davet eden × adres) yalnız bağlantı jetonunu taşır,
   *  - her talep daveti `ExternalListingInvite` satırıdır (talep × adres),
   *  - e-postayı dakikalık `ExternalInviteDispatcher` gönderir: alıcının
   *    ülkesinde mesai saatinde, platform geneli tavanla, adrese 7 günde bir
   *    (bekleyenler tek e-postada), talep YAYINDAYKEN.
   *  - Elle yazılan adres (MANUAL) beklemeden gider — alıcı o firmayı tanıyor.
   *
   * Frenler: firma başına günlük `COMPANY_DAILY_INVITE_CAP` talep daveti;
   * opt-out ve kayıtlı adres atlanır (kayıtlı firma dizinden/platform içi
   * davet edilir); aynı talebe aynı adres bir kez.
   *
   * ALICININ DİLİ: `recipientLocale` (ekranda seçilen → AI keşfinin bulduğu
   * ülke → e-posta uzantısı → davet edenin dili); kayda yazılır, e-posta ve
   * kayıt bağlantısı o dilde. İÇERİK kuralları `InviteContentBuilder`da.
   */
  async inviteExternalForListing(
    user: AuthenticatedCompanyUser,
    listingId: string,
    recipientsRaw: ReadonlyArray<string | ExternalInviteRecipient>,
    source: InviteSourceKind = "MANUAL",
  ) {
    // Talebe yeni tedarikçi çağırmak satınalma işi: iç davetle (addInvitations
    // → `assertPaidForNewListingWork`) AYNI kapı, BUYING_TIER (GOLD). SILVER
    // satış paketi — GOLD'dan düşürülen firma iç davet atamayıp dış adreslere
    // talep daveti kuyruğa alabiliyordu (derin denetim LU-07).
    if (!tierAtLeast(user.tier, BUYING_TIER)) {
      throw entitlementForbidden(user.companyVerificationStatus, {
        key: "api.companyListings.icinFirmaDogrulamasiGerekir",
        params: { action: tApi("api.companyListings.actionInviteSupplier") },
      });
    }
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, companyId: user.companyId },
      select: { id: true, status: true, type: true, createdById: true, closesAt: true },
    });
    if (!listing) throw new NotFoundException(i18nMessage("api.companyConnections.satinAlmaTalebiBulunamadi"));
    // INV-AZ-1 (denetim 2026-08-23 P2 #7): dış davet = ilan-yönetim eylemi —
    // iç davet (addInvitations) ile AYNI kapı (tek kaynak listingManageDenial).
    const denial = listingManageDenial(user, listing);
    if (denial) {
      void this.audit.log({
        action: "company.listing.manage_denied",
        actorType: "company",
        actorId: user.userId,
        actorEmail: user.email,
        tenantId: user.companyId,
        entityType: "listing",
        entityId: listing.id,
        critical: false,
        metadata: { needed: denial.needed, listingType: listing.type, reason: denial.reason, via: "external_invite" },
      });
      throw new ForbiddenException(
        i18nMessage("api.companyConnections.buSatinAlmaTalebiIcinDis"),
      );
    }
    if (listing.status !== "DRAFT" && listing.status !== "OPEN") {
      throw new BadRequestException(i18nMessage("api.companyConnections.yalnizTaslakAcikSatinAlmaTalebi"));
    }

    // Adres başına tekilleştirme (ilk geçen kazanır). Biçimi geçersiz adres
    // SESSİZCE düşmez — sonuçta INVALID olarak görünür.
    const byEmail = new Map<string, ExternalInviteRecipient>();
    for (const raw of recipientsRaw ?? []) {
      const r = typeof raw === "string" ? { email: raw } : (raw ?? { email: "" });
      const email = (r.email ?? "").trim().toLowerCase();
      if (email && !byEmail.has(email)) byEmail.set(email, { ...r, email });
    }
    const normalized = [...byEmail.values()];
    const invalid = normalized.filter((r) => !isExternalEmail(r.email)).map((r) => r.email);
    const recipients = normalized.filter((r) => isExternalEmail(r.email)).slice(0, COMPANY_DAILY_INVITE_CAP);
    const emails = recipients.map((r) => r.email);
    if (emails.length === 0 && invalid.length === 0) {
      throw new BadRequestException(i18nMessage("api.companyConnections.gecerliEPostaAdresiVerilmedi"));
    }

    const now = new Date();
    const [externalToday, memberToday, optOuts, registered, alreadyForListing, referrals, waiting] = await Promise.all([
      this.prisma.externalListingInvite.count({
        where: { inviterCompanyId: user.companyId, createdAt: { gte: utcDayStart(now) } },
      }),
      // Tavan AI'ın önerdiği üyeye doğrudan davetle ORTAK (iki yönde de —
      // `inviteDiscoveredMembers` da dış davetleri sayar; tek yönlüyken önce
      // 60 üye sonra 60 e-posta daveti = günde 120 geçiyordu).
      this.bypass.listingInvitation.count({
        where: { origin: "AI", listing: { companyId: user.companyId }, createdAt: { gte: utcDayStart(now) } },
      }),
      this.prisma.referralOptOut.findMany({ where: { email: { in: emails } }, select: { email: true } }),
      // Kayıtlı kullanıcı başka firmanın kiracısı → bypass (RLS açıkken ana
      // istemci göremez ve adres "kayıtsız" sanılırdı). Yalnız e-postası
      // DOĞRULANMIŞ hesap kayıtlı sayılır (dağıtıcının `addressState`iyle aynı
      // kural): doğrulanmamış kayıt adresin sahibini kanıtlamaz — başkasının
      // adresiyle açılmış bir kayıt o adrese davet gitmesini engelliyordu
      // (arayüz testi 2026-10 code-auth-1 devamı).
      this.bypass.companyUser.findMany({
        where: { email: { in: emails }, deletedAt: null, emailVerifiedAt: { not: null } },
        select: { email: true },
      }),
      this.prisma.externalListingInvite.findMany({
        where: { listingId: listing.id, email: { in: emails } },
        select: { id: true, email: true, state: true, cancelReason: true },
      }),
      this.prisma.companyReferralInvite.findMany({
        where: { inviterCompanyId: user.companyId, email: { in: emails } },
        select: { email: true, status: true, locale: true },
      }),
      // LETTERS ALREADY WAITING FOR THESE ADDRESSES (DISC-N1) - on any request
      // of any buyer, so bypass; one read for the whole call. An address the
      // buyer typed does not wait and joins nothing: not read. A read that
      // fails changes nothing: the rows are spread as before.
      source === "MANUAL"
        ? new Map<string, Date[]>()
        : waitingLetterTimes(this.bypass, emails, now).catch((err: unknown) => {
            this.logger.warn(`waiting invite read failed (${listing.id}): ${err instanceof Error ? err.message : String(err)}`);
            return new Map<string, Date[]>();
          }),
    ]);
    const optOutSet = new Set(optOuts.map((o) => o.email));
    const registeredSet = new Set(registered.map((r) => r.email.toLowerCase()));
    // GÖNDERİLMEDEN DÜŞEN OTOMATİK DAVET (gözden geçirme AI-1): yayın sonrası
    // keşif turunun kuyruğa aldığı adres, alıcı talebi özele çevirdiği / kutuyu
    // kapattığı için e-posta gitmeden iptal edildi (`AUTO_INVITE_OFF`). Alıcı o
    // adresi şimdi KENDİSİ davet ediyorsa (elle ya da pencereden seçerek) bu
    // "zaten davetli" DEĞİLDİR — satır alıcının daveti olarak yeniden kuyruğa
    // girer. Otomatik tur (AI_AUTO) düşen satırı canlandırmaz.
    const revivable = new Map(
      source === "AI_AUTO"
        ? []
        : alreadyForListing
            .filter((e) => e.state === "CANCELLED" && e.cancelReason === AUTO_INVITE_OFF_REASON)
            .map((e) => [e.email, e.id] as const),
    );
    const alreadySet = new Set(alreadyForListing.filter((e) => !revivable.has(e.email)).map((e) => e.email));
    const referralBy = new Map(referrals.map((r) => [r.email, r]));
    const inviterLocale = currentLocale();

    const results: ExternalInviteResult[] = invalid.map((email) => ({
      email,
      status: "INVALID",
      reason: tApi("api.companyConnections.gecersizEPostaAdresi"),
    }));
    let budget = COMPANY_DAILY_INVITE_CAP - externalToday - memberToday;
    let queued = 0;
    /** The rows this call put into the queue, as the dispatcher's forecast reads them. */
    const queuedRows: Array<QueuedLetter & { email: string }> = [];
    for (const r of recipients) {
      const email = r.email;
      if (budget <= 0) {
        results.push({
          email,
          status: "DAILY_LIMIT",
          reason: tApi("api.companyConnections.gunlukDisDavetLimitineUlasildi", { cap: COMPANY_DAILY_INVITE_CAP }),
        });
        continue;
      }
      if (optOutSet.has(email)) {
        results.push({ email, status: "OPTED_OUT", reason: tApi("api.companyConnections.buAdresDavetAlmakIstemiyor") });
        continue;
      }
      const prior = referralBy.get(email);
      // Farklı e-postayla kayıt olmuş (referral kabul edilmiş) firma da kayıtlı sayılır.
      if (registeredSet.has(email) || prior?.status === "ACCEPTED") {
        results.push({
          email,
          status: "SKIPPED_REGISTERED",
          reason: tApi("api.companyConnections.buAdresZatenRothernDeKayitliDizinden"),
        });
        continue;
      }
      if (alreadySet.has(email)) {
        results.push({
          email,
          status: "ALREADY_INVITED",
          reason: tApi("api.companyConnections.buAdreseDahaOnceDavetGonderilmis"),
        });
        continue;
      }
      const country = r.country?.trim().toUpperCase() || countryFromEmailDomain(email);
      // Kayda kapalı ülke (ABD + toprakları, yaptırım ülkeleri) — HİÇBİR
      // kaynaktan davet gitmez (elle yazılan dahil): davetli kayıt olamaz ve
      // e-posta altyapısının koşulları bu gönderimi kapsar (derin denetim X24).
      if (registrationBlockedCountry(r.country, countryFromEmailDomain(email))) {
        results.push({
          email,
          status: "COUNTRY_BLOCKED",
          reason: tApi("api.companyConnections.kayitKapaliUlke"),
        });
        continue;
      }
      if (coldInviteBlockedByCountry(source, r.country, countryFromEmailDomain(email))) {
        results.push({
          email,
          status: "CONSENT_REQUIRED",
          reason: tApi("api.companyConnections.onayGerekenUlke"),
        });
        continue;
      }
      const locale = recipientLocale({
        explicit: r.locale,
        country: r.country,
        email,
        fallback: isLocale(prior?.locale) ? prior.locale : inviterLocale,
      });
      // Bağlantı jetonu (davet eden × adres) — varsa korunur; talep bağlamı
      // eski okuyucular için İLK talepte yazılır.
      // Eşzamanlı ikinci istek aynı (davet eden × adres) satırını önce yazdıysa
      // upsert'ün oluşturma dalı P2002 atar → mevcut satır okunur (arayüz testi
      // FX-00 O-082: eskiden ham 500 "Unique constraint failed" dönüyordu).
      const referralWhere = {
        inviterCompanyId_email: { inviterCompanyId: user.companyId, email },
      };
      const referral = await this.prisma.companyReferralInvite
        .upsert({
          where: referralWhere,
          create: { inviterCompanyId: user.companyId, email, invitedById: user.userId, listingId: listing.id, locale },
          update: {},
          select: { id: true, status: true },
        })
        .catch(async (e: unknown) => {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            return this.prisma.companyReferralInvite.findUniqueOrThrow({
              where: referralWhere,
              select: { id: true, status: true },
            });
          }
          throw e;
        });
      // Daha önce iptal edilmiş bağlantı jetonu yeni davetle canlanır (kayıtta
      // eşleşme yalnız PENDING okur).
      if (referral.status === "CANCELLED") {
        await this.prisma.companyReferralInvite.update({ where: { id: referral.id }, data: { status: "PENDING" } });
      }
      // Elle yazılan adres hemen; AI'ın bulduğu adres alıcının mesai saatinde
      // (aynı ana yığılmasın diye 0-45 dk dağıtılır). The address already has a
      // letter waiting in that window (another request, any buyer): this row
      // takes exactly its time, so both leave as ONE e-mail instead of the
      // second being held 7 days (DISC-N1; single rule `inviteQueueSendAt`).
      const sendAfter = inviteQueueSendAt({
        source,
        country,
        at: now,
        jitterMinutes: Math.floor(Math.random() * INVITE_WINDOW_JITTER_MINUTES),
        waiting: waiting.get(email),
      });
      try {
        const revived = revivable.get(email);
        if (revived) {
          // Koşullu: eşzamanlı ikinci istek satırı önce canlandırdıysa dokunulmaz.
          await this.prisma.externalListingInvite.updateMany({
            where: { id: revived, state: "CANCELLED", cancelReason: AUTO_INVITE_OFF_REASON },
            data: {
              referralInviteId: referral.id,
              state: "QUEUED",
              cancelReason: null,
              source,
              locale,
              country,
              sendAfter,
              attempts: 0,
            },
          });
        } else {
          await this.prisma.externalListingInvite.create({
            data: {
              listingId: listing.id,
              inviterCompanyId: user.companyId,
              referralInviteId: referral.id,
              email,
              locale,
              country,
              source,
              sendAfter,
            },
          });
        }
      } catch (e) {
        // Eşzamanlı ikinci istek aynı (talep, adres) satırını yazdıysa.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          results.push({
            email,
            status: "ALREADY_INVITED",
            reason: tApi("api.companyConnections.buAdreseDahaOnceDavetGonderilmis"),
          });
          continue;
        }
        throw e;
      }
      budget--;
      queued++;
      queuedRows.push({ email, source, country, sendAfter });
      results.push({ email, status: "QUEUED", sendAfter: sendAfter.toISOString() });
    }

    // THE ANSWER SAYS WHAT THE REQUEST PAGE SAYS (review of AUTO-COUNT-1). The
    // "find suppliers" window shows this answer; the "invited by e-mail"
    // section of the same page reads the queue row with the dispatcher's
    // forecast. Answering from the row alone, the window said "queued, planned
    // for Monday 09:13" for an address the section showed as "not sent - it
    // received another invitation this week". Same read, same rule: the time
    // is the moment the letter can really leave, and a letter that will not
    // leave before the request closes carries the reason instead of a time.
    // A read that fails changes nothing: the rows are written, the stored
    // times stand.
    if (queuedRows.length > 0) {
      const forecasts = await queuedInviteForecasts(this.bypass, queuedRows, listing, now).catch((err: unknown) => {
        this.logger.warn(`queued invite forecast failed (${listing.id}): ${err instanceof Error ? err.message : String(err)}`);
        return null;
      });
      for (const result of results) {
        const forecast = result.status === "QUEUED" ? forecasts?.get(result.email) : undefined;
        if (!forecast) continue;
        if (forecast.leavesAt) result.sendAfter = forecast.leavesAt.toISOString();
        else {
          delete result.sendAfter;
          result.notSentReason = forecast.dropReason;
        }
      }
    }

    void this.audit.log({
      action: "connection.external_tender_invite",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "listing",
      entityId: listing.id,
      metadata: { queued, skipped: results.length - queued, source },
    });
    return { results };
  }

  /**
   * Davet bağlantısı açıldı — ilgi damgası + ÖNCEDEN DOLDURMA (2026-09-27,
   * Faz 3; bkz. ReferralVisitController). Dönen bilgiler davetin gittiği
   * adresin KENDİ firmasıdır (AI keşfinin web'de bulduğu ad, site, ülke, şehir):
   * jeton yalnız o adrese gitti. Geçersiz jetonda alanlar boş döner (jetonun
   * geçerliliği sızdırılmaz).
   */
  async markReferralVisited(token: string): Promise<ReferralPrefill> {
    const empty: ReferralPrefill = { email: null, companyName: null, website: null, country: null, city: null };
    // Uç kimliksiz, satır başka firmanın kiracısında → bypass.
    const inv = await this.bypass.companyReferralInvite
      .findFirst({ where: { token, status: "PENDING" }, select: { id: true, email: true } })
      .catch(() => null);
    if (!inv) return empty;
    await this.bypass.companyReferralInvite
      .update({ where: { id: inv.id }, data: { lastClickedAt: new Date() } })
      .catch(() => undefined);
    const [cand, listingInvite] = await Promise.all([
      this.bypass.supplierDiscoveryCandidate.findFirst({
        where: { email: inv.email },
        orderBy: { createdAt: "desc" },
        select: { name: true, website: true, country: true, city: true },
      }),
      this.bypass.externalListingInvite.findFirst({
        where: { referralInviteId: inv.id },
        orderBy: { createdAt: "desc" },
        select: { country: true },
      }),
    ]);
    return {
      email: inv.email,
      companyName: cand?.name ?? null,
      website: cand?.website ?? null,
      country: cand?.country ?? listingInvite?.country ?? null,
      city: cand?.city ?? null,
    };
  }

  /**
   * KAYITSIZ TALEP ÖNİZLEMESİ (2026-09-27, Faz 3; kullanıcı onaylı plan:
   * "davet edilen firma kayıt olmadan talebi görebilecek"). Davet jetonu ile
   * açılır; içerik davet e-postasıyla AYNI beyaz liste (`InviteContentBuilder`)
   * ama kalemlerin TAMAMI. Hedef fiyat, şartname, belge, ticari şart, tam adres,
   * teklif sayısı ve diğer davetliler yine yok. Yalnız bu jetonla davet edilmiş
   * ve YAYINDAKİ talep; kapanmışsa `closed`.
   */
  async invitePreview(token: string, listingId?: string) {
    const inv = await this.bypass.companyReferralInvite.findFirst({
      where: { token },
      select: { id: true, status: true },
    });
    const pick = inv && inv.status !== "CANCELLED"
      ? await this.bypass.externalListingInvite.findFirst({
          where: {
            referralInviteId: inv.id,
            ...(listingId ? { listingId } : {}),
            // Yalnız bu adrese GERÇEKTEN gitmiş davet (jeton davet eden × adres
            // için ortaktır; kuyruktaki davetin talebi e-postadan önce
            // okunamasın) ve vitrinde gösterilebilir, embargosu geçmiş talep —
            // taslak/onay bekleyen/iptal/moderasyonla kapatılmış (CLOSED)
            // talebin içeriği dönmez (yayın denetimi 2026-09-28). Sahibi
            // askıdaki/pasif firmanın talebi de dönmez — dispatcher onun
            // davetini göndermiyor, vitrin de göstermiyor (derin denetim LU-07).
            state: "SENT",
            listing: {
              status: { in: [...MARKETPLACE_STATUSES] },
              OR: [{ bidsOpenAt: null }, { bidsOpenAt: { lte: new Date() } }],
              company: { isActive: true, isBlocked: false },
            },
          },
          orderBy: { createdAt: "desc" },
          select: { listingId: true },
        })
      : null;
    if (!inv || !pick) throw new NotFoundException(i18nMessage("api.companyConnections.gecersizBaglanti"));
    const listing = await this.bypass.listing.findUniqueOrThrow({
      where: { id: pick.listingId },
      select: {
        ...INVITE_LISTING_SELECT,
        items: { ...INVITE_LISTING_SELECT.items, take: PREVIEW_ITEM_LIMIT },
      },
    });
    const builder = new InviteContentBuilder(this.bypass, resolveWebUrl(this.config), this.translations);
    const { showName: _showName, ...content } = await builder.content(listing as InviteListing, currentLocale());
    return {
      listingId: listing.id,
      closed: listing.status !== "OPEN",
      // Kayıt olmuş (bağlantı kabul edilmiş) adres doğrudan panele gider.
      accepted: inv.status !== "PENDING",
      ...content,
    };
  }

  /**
   * Opt-out sayfası açılışı (public, SALT OKUR — derin denetim MU-17): jeton
   * geçerli mi, maskeli adres ve adres zaten çıkmış mı. Kurumsal e-posta
   * güvenlik tarayıcıları bağlantıyı JS'li tarayıcıda açar; açılışta yazılsaydı
   * adres kimse istemeden TÜM davetlerden kalıcı düşerdi — yazma düğmeyle
   * (`markReferralOptOut`, POST). Geçersiz jeton 404.
   */
  async describeReferralOptOut(token: string) {
    // BYPASS: public uç, tenant bağlamı yok (bkz. `markReferralOptOut`).
    const inv = await this.bypass.companyReferralInvite.findUnique({
      where: { token },
      select: { email: true },
    });
    if (!inv) throw new NotFoundException(i18nMessage("api.companyConnections.gecersizBaglanti"));
    const optedOut = await this.prisma.referralOptOut.findUnique({
      where: { email: inv.email },
      select: { email: true },
    });
    return { email: maskEmail(inv.email), optedOut: optedOut != null };
  }

  /** Opt-out (public, POST — düğmeyle): davet token'ındaki adrese bir daha davet gönderilmez. */
  async markReferralOptOut(token: string) {
    // RLS aktivasyon hazırlığı (denetim 2026-08-28 Parça 12 #5): BYPASS client.
    // Bu uç PUBLIC ve guard'sız (e-postadaki tek-tık "davet almak istemiyorum"
    // linki) → tenant bağlamı YOK. `company_referral_invites` policy'li:
    // RLS açıldığında ana client'la satır bulunamaz, uç her tıklamada 404
    // döner ve opt-out kaydı HİÇ yazılmaz (ETK/İYS yükümlülüğü).
    // Cross-tenant okuma güvenli: erişim cuid token'la kapılı, dönen tek alan
    // e-posta ve o da doğrudan geri verilmiyor.
    const inv = await this.bypass.companyReferralInvite.findUnique({
      where: { token },
      select: { email: true },
    });
    if (!inv) throw new NotFoundException(i18nMessage("api.companyConnections.gecersizBaglanti"));
    await this.prisma.referralOptOut.upsert({
      where: { email: inv.email },
      create: { email: inv.email },
      update: {},
    });
    return { ok: true };
  }

  async inviteByEmailBatch(
    user: AuthenticatedCompanyUser,
    entries: ReadonlyArray<string | { email: string; locale?: string | null }>,
  ) {
    if (!tierAtLeast(user.tier, "SILVER")) {
      throw entitlementForbidden(user.companyVerificationStatus, {
        key: "api.companyConnections.baglantiDavetiIcinDogrulama",
      });
    }
    // Normalize + sıra korumalı dedupe; adres başına dil (yeni istemci).
    const seen = new Set<string>();
    const unique: string[] = [];
    const localeFor = new Map<string, string | null | undefined>();
    for (const raw of entries) {
      const entry = typeof raw === "string" ? { email: raw } : raw;
      const e = (entry.email ?? "").trim().toLowerCase();
      if (e && !seen.has(e)) {
        seen.add(e);
        unique.push(e);
        localeFor.set(e, entry.locale);
      }
    }
    if (unique.length === 0) {
      throw new BadRequestException(i18nMessage("api.companyConnections.gecerliEPostaAdresiVerilmedi"));
    }
    // DTO'dan BAĞIMSIZ parti tavanı (yayın denetimi 2026-09-28 Bölüm 5): DTO
    // doğrulaması bir kez atlatılabildi ve tek istek on binlerce adrese
    // e-posta attırabiliyordu. Tavan burada da durur.
    if (unique.length > REFERRAL_BATCH_MAX) {
      throw new BadRequestException(
        i18nMessage("api.dto.inviteByEmail.tekSeferdeEnFazla50EPosta"),
      );
    }

    type BatchRow = {
      email: string;
      status: "request" | "invited" | "skipped" | "failed";
      /** Makine kodu — ekran ayrımı için (SENT/FAILED/SUPPRESSED/ALREADY_INVITED/DAILY_LIMIT/OPTED_OUT…). */
      code?: string;
      targetName?: string;
      reason?: string;
    };
    const results: BatchRow[] = new Array(unique.length);
    const sends: Array<{ index: number; p: Parameters<CompanyConnectionsService["sendReferralInvite"]>[0] }> = [];

    // Gönderim hakları (FX-00 O-093) parti bitene dek tutulur.
    const releases: Array<() => void> = [];
    try {
      // 1) Kapılar + kayıtlar SIRAYLA (tavan sayımı doğru kalsın).
      for (const [index, email] of unique.entries()) {
        try {
          releases.push(this.claimReferralSend(user.companyId, email));
          const prep = await this.prepareReferralInvite(user, email, localeFor.get(email), sends.length);
          if (prep.kind === "request") {
            results[index] = { email, status: "request", code: "REQUEST", targetName: prep.targetName };
          } else {
            sends.push({ index, p: prep });
          }
        } catch (e) {
          results[index] = { email, status: "skipped", ...this.batchSkipReason(e) };
        }
      }

      // 2) E-postalar sınırlı eşzamanlılıkla BEKLENİR (50 adres × tek tek
      //    beklemek isteği yarım dakikaya uzatırdı); sonuç adres başına gerçek.
      const CONCURRENCY = 5;
      for (let i = 0; i < sends.length; i += CONCURRENCY) {
        const chunk = sends.slice(i, i + CONCURRENCY);
        const outs = await Promise.all(chunk.map((s) => this.sendReferralInvite(s.p)));
        chunk.forEach((s, k) => {
          const out = outs[k]!;
          results[s.index] =
            out.delivery === "SENT"
              ? { email: s.p.email, status: "invited", code: "SENT" }
              : {
                  email: s.p.email,
                  status: "failed",
                  code: out.delivery,
                  reason:
                    out.delivery !== "SUPPRESSED"
                      ? tApi("api.companyConnections.gonderilemedi")
                      : out.undeliverable
                        ? tApi("api.companyConnections.buAlanAdinaEPostaTeslimEdilemez")
                        : out.allowlist
                          ? tApi("api.companyConnections.buOrtamdaEPostaGonderilmedi")
                          : tApi("api.companyConnections.buAdresEPostaAlamiyor"),
                };
        });
      }
    } finally {
      for (const release of releases) release();
    }

    return {
      results,
      summary: {
        request: results.filter((r) => r.status === "request").length,
        invited: results.filter((r) => r.status === "invited").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        failed: results.filter((r) => r.status === "failed").length,
      },
    };
  }

  /** Toplu davette atlanan adresin gerekçesi — anahtarlı istisnadan kod + metin. */
  private batchSkipReason(e: unknown): { code?: string; reason: string } {
    if (e instanceof HttpException) {
      const body = e.getResponse() as { message?: string; code?: string } | string;
      if (typeof body === "object" && body) {
        return { code: body.code, reason: body.message ?? e.message };
      }
      return { reason: typeof body === "string" ? body : e.message };
    }
    return { reason: tApi("api.companyConnections.gonderilemedi") };
  }

  /** Gönderdiğim bekleyen e-posta davetleri. */
  async listReferralInvites(companyId: string) {
    const rows = await this.prisma.companyReferralInvite.findMany({
      where: { inviterCompanyId: companyId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, createdAt: true },
    });
    return rows;
  }

  /** Ortak istek oluşturma — self/blok/mevcut kontrolleri + kayıt. */
  private async createRequest(
    user: AuthenticatedCompanyUser,
    target: { id: string; name: string; isActive: boolean },
    origin: ConnectionOrigin,
  ) {
    if (target.id === user.companyId) {
      throw new BadRequestException(i18nMessage("api.companyConnections.kendinizeIstekGonderemezsiniz"));
    }
    const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
    if (blockedIds.includes(target.id)) {
      throw new NotFoundException(i18nMessage("api.companyConnections.firmaBulunamadi"));
    }
    const existing = await this.prisma.companyConnection.findFirst({
      where: {
        OR: [
          { inviterCompanyId: user.companyId, inviteeCompanyId: target.id },
          { inviterCompanyId: target.id, inviteeCompanyId: user.companyId },
        ],
      },
      select: { status: true, inviteeCompanyId: true },
    });
    if (existing) {
      if (existing.status === "ACTIVE") {
        throw new ConflictException(i18nMessage("api.companyConnections.buFirmaylaZatenBaglisiniz"));
      }
      if (existing.inviteeCompanyId === user.companyId) {
        throw new ConflictException(
          i18nMessage("api.companyConnections.buFirmaSizeZatenIstekGondermis"),
        );
      }
      throw new ConflictException(i18nMessage("api.companyConnections.buFirmayaZatenIstekGonderdiniz"));
    }

    let conn;
    try {
      conn = await this.prisma.companyConnection.create({
        data: {
          inviterCompanyId: user.companyId,
          inviteeCompanyId: target.id,
          invitedById: user.userId,
          status: "PENDING",
          origin,
        },
      });
    } catch (e) {
      // Yarış: findFirst ile create arasında aynı yönde kayıt oluştu.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException(i18nMessage("api.companyConnections.buFirmayaZatenIstekGonderdiniz"));
      }
      throw e;
    }
    // INV-AUDIT-1 (dalga 3): bağlantı isteği = ilişki olayı, uyuşmazlıkta delil.
    // Commit sonrası, bildirimden önce. Para/yetki değil → non-critical.
    await this.audit.log({
      action: "company.connection.requested",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_connection",
      entityId: conn.id,
      metadata: {
        inviterCompanyId: user.companyId,
        inviteeCompanyId: target.id,
        origin,
      },
    });
    // Hedef firmaya in-app haber ver (tercihe tabi değil — bilinmeyen tip açık).
    const me = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true },
    });
    void this.notifications
      .pushToCompany(target.id, {
        type: "connection_request",
        // Yetki tablosu: bağlantı işi "Bağlantılar" tikine (onaylayıcı-only almaz).
        audience: ["connections:manage"],
        titleKey: "api.notifications.companyConnections.request.title",
        bodyKey: "api.notifications.companyConnections.request.body",
        params: { company: this.companyNameOr(me?.name) },
      })
      .catch((err) =>
        this.logger.warn(
          `Bağlantı isteği bildirimi gönderilemedi: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    // E-posta kanalı (in-app'e paralel) — hedef firma uygulamada değilse kaçırmasın.
    void this.emailCompany(
      target.id,
      "api.notifications.companyConnections.request.title",
      [
        "api.notifications.companyConnections.greeting",
        "api.notifications.companyConnections.request.emailBody",
      ],
      { company: this.companyNameOr(me?.name) },
      "connection_request",
      conn.id,
      // Düğme genel panele değil Bağlantılar › Gelen istekler'e (arayüz testi D-114).
      { labelKey: "api.notifications.companyConnections.request.emailCta", view: "incoming" },
    );
    return { id: conn.id, status: conn.status, targetName: target.name };
  }

  /**
   * Firma adı — yoksa katalogdaki "Bir firma". Ad her zaman dolu olduğu için
   * yedek pratikte kullanılmaz; kullanılırsa İSTEK dilinde üretilir (tek
   * `params` sözlüğü N alıcıya dağıldığı için alıcı başına ayrışamaz).
   */
  private companyNameOr(name?: string | null, locale: Locale = currentLocale()): string {
    return name ?? tApi("api.notifications.companyConnections.someCompany", undefined, locale);
  }

  /** Firmanın bildirim e-postasına (billingEmail → ilk aktif kullanıcı) bildirim
   *  şablonuyla e-posta. Best-effort. Metin ALICININ dilinde üretilir. */
  private async emailCompany(
    companyId: string,
    subjectKey: ApiMessageKey,
    paragraphKeys: readonly ApiMessageKey[],
    params: Record<string, string | number>,
    type: string,
    contextId: string,
    /** CTA: Bağlantılar sayfası (isteğe bağlı görünümle) — varsayılan etiket "Rothern'e Git". */
    cta: { labelKey?: ApiMessageKey; view?: "incoming" } = {},
  ) {
    try {
      const c = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          name: true,
          billingEmail: true,
          tier: true,
          membershipEndAt: true,
          companyVerificationStatus: true, // ücretsiz dönem: efektif kademe girdisi
          users: {
            where: { isActive: true, deletedAt: null },
            select: {
              email: true,
              firstName: true,
              lastName: true,
              locale: true,
            },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      });
      const email = c?.billingEmail || c?.users[0]?.email;
      if (!c || !email) return;
      const name = c.users[0]
        ? `${c.users[0].firstName} ${c.users[0].lastName}`.trim() || c.name
        : c.name;
      // billingEmail dalında da kullanıcı satırı zaten çekiliyor → dil ondan;
      // hiç kullanıcı yoksa varsayılan.
      const locale = localeOf(c.users[0]?.locale);
      const subject = tApi(subjectKey, params, locale);
      const baseUrl =
        resolveWebUrl(this.config);
      await this.email.send({
        to: { email, name },
        subject,
        locale,
        templateData: {
          template: "notification",
          data: {
            subject,
            heading: subject,
            paragraphs: paragraphKeys.map((k) => tApi(k, params, locale)),
            ctaLabel: tApi(
              cta.labelKey ?? "api.notifications.companyConnections.emailCta",
              undefined,
              locale,
            ),
            // Bağlantılar her iki portalda; satınalma portalı yalnız Gold'da
            // açık → alıcının EFEKTİF paketine göre (ret ekranına düşmesin).
            ctaUrl: appRoutes.connections(
              baseUrl,
              tierAtLeast(effectiveTier(c.tier, c.membershipEndAt, c.companyVerificationStatus), BUYING_TIER) ? "satinalma" : "satis",
              locale,
              cta.view,
            ),
          },
        },
        context: { type, id: contextId },
      });
    } catch (err) {
      this.logger.warn(
        `Bağlantı e-postası gönderilemedi (${companyId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }


  /** Gönderdiğim bekleyen bağlantı istekleri (iptal edilebilir). */
  async listOutgoing(companyId: string) {
    const rows = await this.prisma.companyConnection.findMany({
      where: { inviterCompanyId: companyId, status: "PENDING" },
      include: { invitee: { select: PENDING_CARD_SELECT } },
      orderBy: { createdAt: "desc" },
    });
    return this.pendingRows(rows.map((r) => ({ id: r.id, createdAt: r.createdAt, company: r.invitee })));
  }

  /**
   * Bekleyen istek satırları — kart alanları (şehir, sektör, logo, Doğrulanmış)
   * bağlantı listesiyle AYNI biçimde; sektör okuyucunun dilinde. Eskiden yalnız
   * ad + Rothern ID dönüyordu, gelen istekte karar için gereken şehir/sektör "—"
   * görünüyordu (arayüz testi D-266).
   */
  private async pendingRows(
    rows: { id: string; createdAt: Date; company: Prisma.CompanyGetPayload<{ select: typeof PENDING_CARD_SELECT }> }[],
  ) {
    const mapped = rows.map((r) => ({
      connectionId: r.id,
      company: {
        id: r.company.id,
        name: r.company.name,
        rothernId: r.company.rothernId,
        city: r.company.city,
        country: r.company.country,
        industry: r.company.industry,
        logoUrl: r.company.logoUrl,
        verified: r.company.companyVerificationStatus === "VERIFIED",
      },
      createdAt: r.createdAt,
    }));
    if (!this.translations || mapped.length === 0) return mapped;
    const companies = await this.translations.localizeIndustry(
      mapped.map((m) => m.company),
      mapped.map((m) => m.company.id),
      currentLocale(),
    );
    return mapped.map((m, n) => ({ ...m, company: companies[n]! }));
  }

  /**
   * Bekleyen e-posta davetini iptal et (kayıt olunca bağ kurulmaz). Satır
   * SİLİNMEZ, CANCELLED olur (yayın denetimi 2026-09-28 Bölüm 5): silme günlük
   * tavanı, 7 günlük freni ve — cascade ile — gönderilmiş dış talep davetlerini
   * sıfırlıyordu; sil-yeniden-gönder döngüsü sınırsız davet e-postası demekti.
   * Kuyruktaki (henüz gitmemiş) talep davetleri de iptal edilir.
   */
  async cancelReferralInvite(user: AuthenticatedCompanyUser, id: string) {
    const res = await this.prisma.companyReferralInvite.updateMany({
      where: { id, inviterCompanyId: user.companyId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    if (res.count === 0) throw new NotFoundException(i18nMessage("api.companyConnections.davetBulunamadi"));
    await this.prisma.externalListingInvite.updateMany({
      where: { referralInviteId: id, inviterCompanyId: user.companyId, state: "QUEUED" },
      data: { state: "CANCELLED", cancelReason: "REFERRAL_CANCELLED" },
    });
    return { ok: true };
  }

  /** Bana gelen bekleyen davetler. */
  async listIncoming(companyId: string) {
    const rows = await this.prisma.companyConnection.findMany({
      where: { inviteeCompanyId: companyId, status: "PENDING" },
      include: { inviter: { select: PENDING_CARD_SELECT } },
      orderBy: { createdAt: "desc" },
    });
    return this.pendingRows(rows.map((r) => ({ id: r.id, createdAt: r.createdAt, company: r.inviter })));
  }

  /**
   * Aktif bağlantılarım (her iki yön — karşı firmayı döner).
   * Bağlantı, onu KURAN (davet eden) taraf PAKET kaldığı sürece aktif sayılır —
   * PREMIUM ve INVITE için (premium bitince pasifleşir, silinmez). ADMIN hariç
   * (platform kararı, hep açık). Böylece bir kez premium olup bol davet atarak
   * kalıcı bedava bağlantı ağı tutulamaz.
   */
  async list(companyId: string) {
    const rows = await this.prisma.companyConnection.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { inviterCompanyId: companyId },
          { inviteeCompanyId: companyId },
        ],
      },
      include: {
        inviter: { select: COMPANY_CARD_SELECT },
        invitee: { select: COMPANY_CARD_SELECT },
      },
      orderBy: { decidedAt: "desc" },
    });
    // Kart zenginleştirme (v2 6f): yayındaki ürünlerden ilk 3 küçük resim +
    // toplam. Kapı vitrinle aynı (`publicProductWhere`): profilde görünmeyen
    // ürün kartta da yok. Toplam DB'de sayılır, küçük resim firma başına en
    // fazla 3 satır — eskiden bağlantıların TÜM yayındaki ürünleri görsel
    // dizileriyle çekilip bellekte kırpılıyordu (derin denetim LU-07).
    const otherIds = rows.map((r) =>
      r.inviterCompanyId === companyId ? r.inviteeCompanyId : r.inviterCompanyId,
    );
    // Karşı firmaların ürünleri → BYPASS (RLS: kısıtlı istemci başka firmanın
    // `company_items`ını göremez, önizleme hep boştu). Kapı sorguda.
    const preview = new Map<string, { thumbnails: string[]; total: number }>();
    if (otherIds.length > 0) {
      const counts = await this.bypass.companyItem.groupBy({
        by: ["companyId"],
        where: { ...publicProductWhere(), companyId: { in: otherIds } },
        _count: { _all: true },
      });
      const withProducts = counts.filter((c) => c._count._all > 0);
      // Havuzu tek istekte doldurmamak için küçük gruplar hâlinde.
      for (let i = 0; i < withProducts.length; i += PREVIEW_THUMB_CONCURRENCY) {
        const chunk = withProducts.slice(i, i + PREVIEW_THUMB_CONCURRENCY);
        const thumbs = await Promise.all(
          chunk.map((c) =>
            this.bypass.companyItem.findMany({
              where: { ...publicProductWhere(), companyId: c.companyId, images: { isEmpty: false } },
              select: { images: true },
              orderBy: [{ completionScore: "desc" }, { publishedAt: "desc" }],
              take: 3,
            }),
          ),
        );
        chunk.forEach((c, n) =>
          preview.set(c.companyId, {
            total: c._count._all,
            thumbnails: thumbs[n]!.map((p) => p.images[0]).filter((u): u is string => !!u),
          }),
        );
      }
    }
    const listed = rows
      .filter(
        // Bağlantı, onu KURAN (davet eden) taraf PAKET kaldığı sürece aktif —
        // hem PREMIUM hem INVITE için (ADMIN hariç: platform kararı, hep açık).
        // Ödemeyi bırakınca kendi başlattığın ağı kaybedersin; açık kalan tek
        // pencere hâlâ ödeyen birinin seni davet ettiği bağlantılardır.
        // INV-TIER-1: EFEKTİF tier (CL:connectedCompanyIds ile BİREBİR) — süresi
        // dolmuş inviter'ın bağlantısı bayat PAKET ile aktif görünmesin.
        (r) =>
          r.origin === "ADMIN" ||
          tierAtLeast(
            effectiveTier(r.inviter.tier, r.inviter.membershipEndAt, r.inviter.companyVerificationStatus),
            "SILVER",
          ),
      )
      .map((r) => {
        const other = r.inviterCompanyId === companyId ? r.invitee : r.inviter;
        const contact = other.users[0] ?? null;
        return {
          connectionId: r.id,
          origin: r.origin,
          company: {
            id: other.id,
            name: other.name,
            rothernId: other.rothernId,
            // INV-TIER-1: gösterilen tier rozeti efektif (süresi-dolmuş PAKET
            // paketli göstermesin).
            tier: effectiveTier(other.tier, other.membershipEndAt, other.companyVerificationStatus),
            city: other.city,
            country: other.country,
            industry: other.industry,
            contactName: contact
              ? `${contact.firstName} ${contact.lastName}`.trim()
              : null,
            contactEmail: contact?.email ?? null,
            logoUrl: other.logoUrl,
            verified: other.companyVerificationStatus === "VERIFIED",
            activities: other.activities,
            categoryIds: [...other.sellerCategoryIds, ...other.sellerSubCategoryIds],
            productPreview: preview.get(other.id) ?? null,
          },
          decidedAt: r.decidedAt,
        };
      });
    // Karşı firmanın sektörü okuyucunun dilinde (çapraz-firma okuma = localize*).
    if (!this.translations) return listed;
    const companies = await this.translations.localizeIndustry(
      listed.map((l) => l.company),
      listed.map((l) => l.company.id),
      currentLocale(),
    );
    return listed.map((l, n) => ({ ...l, company: companies[n]! }));
  }

  /**
   * Keşfet — bağlanılacak firmaları kategori-eşleşmesine göre sıralı listeler.
   * Görmek ücretsiz (2026-09-06): ücretsiz üye de önerileri görür — davet
   * GÖNDERMEK paketli (`invite`). Adaylar: paketli ya da profilini yayınlamış firmalar.
   * Skor: (ben alırım ∩ o satar) + (ben satarım ∩ o alır). Bağlı/davetli hariç.
   */
  async discover(user: AuthenticatedCompanyUser) {
    const me = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { buyerCategoryIds: true, sellerCategoryIds: true },
    });
    const myBuyer = new Set(me?.buyerCategoryIds ?? []);
    const mySeller = new Set(me?.sellerCategoryIds ?? []);

    // Mevcut bağlantı/davet olan firmaları çıkar.
    const conns = await this.prisma.companyConnection.findMany({
      where: {
        OR: [
          { inviterCompanyId: user.companyId },
          { inviteeCompanyId: user.companyId },
        ],
      },
      select: { inviterCompanyId: true, inviteeCompanyId: true },
    });
    const exclude = new Set<string>([user.companyId]);
    for (const c of conns) {
      exclude.add(c.inviterCompanyId);
      exclude.add(c.inviteeCompanyId);
    }
    // Engellenenler (iki yön) keşifte görünmez.
    for (const id of await this.blocks.blockedCompanyIds(user.companyId)) {
      exclude.add(id);
    }

    const companies = await this.prisma.company.findMany({
      where: {
        // Aday: efektif PAKETLİ firma (INV-TIER-1) VEYA profilini yayınlamış
        // ücretsiz firma (2026-09-06: Standart dizinde görünür; paketli üyenin
        // ona davet atması ücretsiz üyenin tek bağlantı yolu).
        OR: [anyPackageWhere(), { publicEnabled: true }],
        isActive: true,
        isBlocked: false,
        id: { notIn: [...exclude] },
      },
      select: {
        id: true,
        name: true,
        rothernId: true,
        industry: true,
        activities: true,
        createdAt: true,
        buyerCategoryIds: true,
        sellerCategoryIds: true,
      },
      take: 100,
    });

    // İLGİ SKORU (ilgi motoru Faz 3).
    //
    // Eski skor BEYAN kesişiminin ham sayısıydı: "kaç segmentimiz ortak".
    // 38 kova için bu neredeyse gürültü — hem çok kutu işaretleyen firmayı
    // ödüllendiriyordu (genişlik cezası yok), hem de firmanın o alanda
    // gerçekten iş yapıp yapmadığına bakmıyordu.
    const myBuyCats = [...myBuyer];
    const mySellCats = [...mySeller];
    const affRows =
      myBuyCats.length + mySellCats.length > 0
        ? await this.prisma.companyAffinity.findMany({
            where: {
              companyId: { in: companies.map((c) => c.id) },
              categoryId: { in: [...new Set([...myBuyCats, ...mySellCats])] },
            },
            select: {
              companyId: true,
              categoryId: true,
              sellScore: true,
              buyScore: true,
              reasons: true,
            },
          })
        : [];

    const buySet = new Set(myBuyCats);
    const sellSet = new Set(mySellCats);
    const best = new Map<string, { score: number; reasons: unknown }>();
    for (const r of affRows) {
      // "Bana ne satabilir" + "benden ne alabilir" — iki yön toplanır.
      const v =
        (buySet.has(r.categoryId) ? r.sellScore : 0) +
        (sellSet.has(r.categoryId) ? r.buyScore : 0);
      const cur = best.get(r.companyId);
      if (!cur || v > cur.score) best.set(r.companyId, { score: v, reasons: r.reasons });
    }

    // GERİ DÜŞÜŞ: ilgi profili hiç hesaplanmamışsa (ilk dağıtım, gece cron'u
    // henüz koşmamış, tablo yeni sıfırlanmış) skorların HEPSİ 0 olur ve
    // sıralama tamamen ölür. Böyle bir durumda eski BEYAN kesişimine düşülür —
    // zayıf bir sinyal ama sıfırdan iyi. Listeler tarafındaki @Optional
    // davranışının karşılığı: istatistik katmanı yoksa akış eski hâline döner.
    const affinityReady = best.size > 0;

    const enriched = companies.map((c) => {
      const hit = best.get(c.id);
      const declaredOverlap =
        c.sellerCategoryIds.filter((x) => buySet.has(x)).length +
        c.buyerCategoryIds.filter((x) => sellSet.has(x)).length;
      return {
        id: c.id,
        name: c.name,
        rothernId: c.rothernId,
        industry: c.industry,
        activities: c.activities,
        createdAt: c.createdAt,
        matchScore: affinityReady
          ? Number((hit?.score ?? 0).toFixed(2))
          : declaredOverlap,
        matchReason: affinityReady
          ? affinityReasonTextThirdParty((hit?.reasons ?? null) as never)
          : declaredOverlap > 0
            ? tApi("api.companyAffinity.reason.thirdParty.declared")
            : null,
      };
    });

    const ranked = [...enriched].sort((a, b) => b.matchScore - a.matchScore);

    // %20 KEŞİF KOTASI — "zengin daha zengin" freni.
    //
    // Salt skorla sıralarsan ilk kazanan hep önerilir, hep kazanır ve yeni
    // tedarikçi ASLA görünmez; pazar yeri kapalı bir kulübe döner ve alıcı da
    // kaybeder (rekabet azalır). Sonuçların beşte biri, skoru düşük ama YENİ
    // firmalara ayrılır — soğuk başlangıcı yapısal olarak taşır.
    const QUOTA = 0.2;
    const keep = Math.max(1, Math.ceil(ranked.length * (1 - QUOTA)));
    const head = ranked.slice(0, keep);
    const headIds = new Set(head.map((c) => c.id));
    const discovery = enriched
      .filter((c) => !headIds.has(c.id))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, Math.max(0, ranked.length - keep))
      .map((c) => ({ ...c, discovery: true as const }));

    const scored = [...head.map((c) => ({ ...c, discovery: false as const })), ...discovery].map(
      // createdAt yalnız kota hesabı içindi — dışarı sızmasın.
      ({ createdAt, ...rest }) => rest,
    );

    const localized = this.translations
      ? await this.translations.localizeIndustry(scored, scored.map((c) => c.id), currentLocale())
      : scored;
    return { locked: false as const, companies: localized };
  }

  /** Firma id'leri için bağlantı durumu haritası (kart/profil için). */
  private async connectionStatusMap(
    companyId: string,
    otherIds: string[],
  ): Promise<Map<string, "active" | "pending" | "incoming">> {
    const m = new Map<string, "active" | "pending" | "incoming">();
    if (otherIds.length === 0) return m;
    const conns = await this.prisma.companyConnection.findMany({
      where: {
        OR: [
          { inviterCompanyId: companyId, inviteeCompanyId: { in: otherIds } },
          { inviterCompanyId: { in: otherIds }, inviteeCompanyId: companyId },
        ],
      },
      select: {
        inviterCompanyId: true,
        inviteeCompanyId: true,
        status: true,
      },
    });
    for (const c of conns) {
      const other =
        c.inviterCompanyId === companyId
          ? c.inviteeCompanyId
          : c.inviterCompanyId;
      m.set(
        other,
        c.status === "ACTIVE"
          ? "active"
          : c.inviteeCompanyId === companyId
            ? "incoming"
            : "pending",
      );
    }
    return m;
  }

  /**
   * PANEL FİRMA DİZİNİ — herkese açık `/firmalar` ile AYNI kaynak
   * (`common/company/company-directory.ts`): aynı listelenme koşulu, aynı
   * kart, aynı süzgeçler. Üyeye ek: Rothern ID, bağlantı durumu ve
   * `connection` süzgeci. Kendisi ve engelledikleri hariç.
   *
   * Görüntülemek ÜCRETSİZ (2026-09-04): ücretli olan LİSTELENMEK
   * (publicEnabled + PAKET sırası), görmek değil.
   */
  async searchCompanies(
    user: AuthenticatedCompanyUser,
    qRaw?: string,
    q: Omit<DirectoryParams, "q"> = {},
    connection?: "connected" | "new",
  ) {
    const scope = await this.directoryScope(user.companyId, connection);
    // RLS: dizin BAŞKA firmaların ürün sayısını sayar (`_count.items`) —
    // kısıtlı client'ta o sayılar 0 gelir ve kart "Portföyü görüntüle"yi çizmez
    // (2026-09-16 staging e2e'de yakalandı). Çapraz okuma → bypass client.
    const locale = currentLocale();
    const res = await buildDirectory(this.bypass, { ...q, q: (qRaw ?? "").trim() || undefined }, {
      ...scope,
      localizeProducts: this.translations ? (items, ids) => this.translations!.localizeProducts(items, ids, locale) : undefined,
    });
    const statusMap = await this.connectionStatusMap(user.companyId, res.items.map((r) => r.id));
    // i18n Faz 1e: dizin kartı (tanıtım özeti, sektör) okuyucunun dilinde.
    const items = this.translations
      ? await this.translations.localizeCompanies(res.items, res.items.map((r) => r.id), currentLocale())
      : res.items;
    return {
      ...res,
      items: items.map(({ id, ...card }) => ({
        ...card,
        connectionStatus: statusMap.get(id) ?? ("none" as const),
      })),
    };
  }

  /**
   * Dizin süzgeç sayaçları (panel) — public ile aynı küme VE aynı bağlamsallık.
   * Eskiden hiç parametre almıyordu: sayaçlar aramadan ve diğer seçimlerden
   * bağımsız çıkıyor, "İstanbul (7)" tıklandığında liste boşalabiliyordu.
   */
  async searchFacets(
    user: AuthenticatedCompanyUser,
    q: DirectoryParams = {},
    connection?: "connected" | "new",
  ) {
    const scope = await this.directoryScope(user.companyId, connection);
    return directoryFacets(this.bypass, scope, q);
  }

  /**
   * Dizin küme daraltması: her zaman kendisi + engelledikleri hariç; ayrıca
   * `connected` → yalnız ACTIVE bağlantılı firmalar, `new` → onlar hariç.
   * BEKLEYEN istek "bağlı" sayılmaz — istek gönderilmiş firma hâlâ keşif
   * kümesindedir, aksi hâlde tek tıkla listeden kaybolurdu.
   */
  private async directoryScope(
    companyId: string,
    connection?: "connected" | "new",
  ): Promise<DirectoryScope> {
    const blockedIds = await this.blocks.blockedCompanyIds(companyId);
    const excludeIds = [companyId, ...blockedIds];
    // Rothern ID ile arama YALNIZ panelde (üye): public dizinde kimlik→firma
    // kâhini olurdu (derin denetim LU-01).
    const matchRothernId = true;
    if (!connection) return { excludeIds, matchRothernId };
    const connected = await this.prisma.companyConnection.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ inviterCompanyId: companyId }, { inviteeCompanyId: companyId }],
      },
      select: { inviterCompanyId: true, inviteeCompanyId: true },
    });
    const ids = connected.map((c) => (c.inviterCompanyId === companyId ? c.inviteeCompanyId : c.inviterCompanyId));
    return connection === "connected"
      ? { excludeIds, restrictIds: ids, matchRothernId }
      : { excludeIds: [...excludeIds, ...ids], matchRothernId };
  }

  /**
   * Herkese açık firma profili + bağlantı durumu + AÇIK ihaleleri.
   * Görünürlük getOne ile birebir: PUBLIC herkese; CONNECTIONS yalnız bağlıya;
   * PRIVATE yalnız o ilana DAVETLİYE (bağlı olmak davetli olmak değildir).
   */
  async getProfile(user: AuthenticatedCompanyUser, rothernIdRaw: string) {
    // Adres ya rothernId (`K7X9-3M2P`) ya da public profil slug'ıdır. İkisi
    // biçim olarak ayrık (kısa kod kalıbı vs kebab-case) → belirsizlik yok.
    // Slug kabul etmek ŞART: panel içi ürün sayfası ürünü slug'la çözüyor ve
    // "firmayla iletişime geç" bağlantısı panelden çıkmamalı; slug'ı burada
    // reddetseydik o bağlantı yine herkese açık sayfaya kaçardı.
    const code = normalizeShortCode(rothernIdRaw);
    const slug = rothernIdRaw.trim().toLowerCase();
    // Biçim yalnız SIRAYI belirler, tek denemeyi değil: kısa kod kalıbına
    // uyan bir slug ("star-4x4z") ya da tersi, tek dallı bir çözümde sessizce
    // 404 verirdi. İkinci sorgu YALNIZ ıskalayınca koşar — o dal zaten 404'e
    // gidiyordu, maliyeti yok.
    const select = {
      id: true,
      rothernId: true,
      slug: true,
      name: true,
      industry: true,
      city: true,
      country: true,
      logoUrl: true,
      coverImageUrl: true,
      aboutText: true,
      services: true,
      certifications: true,
      photos: true,
      certificateImages: true,
      foundedYear: true,
      employeeCount: true,
      website: true,
      linkedinUrl: true,
      instagramUrl: true,
      publicEnabled: true,
      isActive: true,
      isBlocked: true,
      tier: true,
      activities: true,
      sellerCategoryIds: true,
      buyerCategoryIds: true,
      companyVerificationStatus: true,
      membershipEndAt: true, // INV-TIER-1: effectiveTier hesabı için
      // Ticari sicil bilgileri. Tüzel kişide kamuya açık; ŞAHIS firmasında
      // taxNumber = sahibin TCKN'si (kişisel veri) → yanıtta `visibleTaxNumber`
      // ile gizlenir (derin denetim Y-06). IBAN / yetkili TCKN / fatura
      // iletişimi ASLA buraya girmez.
      legalName: true,
      companyType: true,
      taxNumber: true,
      taxOffice: true,
      mersisNo: true,
      tradeRegistryNo: true,
      kepAddress: true,
    } as const;
    const looksLikeCode = validateShortCode(code);
    const c =
      (await this.prisma.company.findFirst({
        where: looksLikeCode ? { rothernId: code } : { slug },
        select,
      })) ??
      (await this.prisma.company.findFirst({
        where: looksLikeCode ? { slug } : { rothernId: code },
        select,
      }));
    // Admin-bloklu firma dizin/doğrudan-id yolundan da görünmez (arama zaten
    // filtreliyor; doğrudan rothernId erişimi bu filtreyi atlıyordu).
    if (!c || !c.isActive || c.isBlocked) {
      throw new NotFoundException(i18nMessage("api.companyConnections.firmaProfiliBulunamadi"));
    }
    const isSelf = c.id === user.companyId;
    if (!isSelf) {
      const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
      if (blockedIds.includes(c.id)) {
        throw new NotFoundException(i18nMessage("api.companyConnections.firmaProfiliBulunamadi"));
      }
    }
    const conn = isSelf
      ? null
      : await this.prisma.companyConnection.findFirst({
          where: {
            OR: [
              { inviterCompanyId: user.companyId, inviteeCompanyId: c.id },
              { inviterCompanyId: c.id, inviteeCompanyId: user.companyId },
            ],
          },
          select: { id: true, status: true, inviteeCompanyId: true },
        });
    const connectionStatus = isSelf
      ? ("self" as const)
      : !conn
        ? ("none" as const)
        : conn.status === "ACTIVE"
          ? ("active" as const)
          : conn.inviteeCompanyId === user.companyId
            ? ("incoming" as const)
            : ("pending" as const);
    const connectionId = conn?.id ?? null;
    const connected = connectionStatus === "active" || isSelf;
    // Talep LİSTESİ için "bağlı" = GEÇERLİ bağlantı (tek kaynak `hasValidConnection`:
    // kuran taraf efektif SILVER+ kalmalı) — getOne/sellerTenders ile birebir.
    // `connectionStatus` UI rozeti olarak ham ACTIVE'i göstermeye devam eder;
    // aksi hâlde paketi biten davetçinin bağlantısı profilde talep sızdırırdı
    // (denetim 2026-09-06 #2).
    const connectedForListings =
      isSelf || (connected && (await hasValidConnection(this.prisma as never, user.companyId, c.id)));
    // Ziyaret Edenler: üye başkasının profilini açtı — kimlikli görüntülenme
    // (erişim denetimlerinden SONRA; fire-and-forget, okumayı düşürmez).
    if (!isSelf) void this.views?.recordPanelView(user, { companyId: c.id });

    // Görünürlük kuralı:
    // - İlişkili (kendisi / bağlı / bekleyen / gelen istek) → her zaman görür.
    // - Aksi halde "herkese açık" profil: `hasPublicProfile` — /firma/<slug>
    //   ile AYNI kapı. İzleyenin paketi ARANMAZ (2026-09-04): anonim ziyaretçi
    //   profili görüyorken ücretsiz üyeye 404 vermek tutarsızdı. Hedefin paketi
    //   de aranmaz (2026-09-06): ücretsiz firma da profilini yayınlar.
    const related = isSelf || connectionStatus !== "none";
    // `hasPublicProfile` eksi slug şartı: panel rothernId ile de açar, slug
    // yalnız herkese açık URL için gerekir.
    const publiclyListed = c.publicEnabled;
    if (!related && !publiclyListed) {
      throw new NotFoundException(i18nMessage("api.companyConnections.firmaProfiliBulunamadi"));
    }

    // Embargo + görünürlük ülkesi — izleyen başka firmaysa (getOne/sellerTenders ile aynı).
    const viewerListingGates: Prisma.ListingWhereInput[] =
      c.id === user.companyId
        ? []
        : [
            {
              OR: [
                { bidsOpenAt: null },
                { bidsOpenAt: { lte: new Date() } },
                { bids: { some: { bidderCompanyId: user.companyId } } },
              ],
            },
            {
              OR: [
                // Görünürlük ülkesi (2026-09-21): boş = herkes; dolu = izleyen listede.
                { targetCountries: { isEmpty: true } },
                { targetCountries: { has: user.country } },
                { invitations: { some: { invitedCompanyId: user.companyId } } },
              ],
            },
          ];
    const viewerPaid = tierAtLeast(user.tier, PAID_TIER);
    // Ücretsiz bağsız izleyenden paket kuralıyla gizlenen açık PUBLIC talepler
    // (arayüz testi D-329): gizleme kasıtlı, ama sayfa "açık talep yok" demek
    // yerine kilit kartında GERÇEK sayıyı gösterir. Yalnız sayı — başlık/kalem
    // sızmaz: firma profilinde talep satırı, maskeli olsa bile ALICIYI ele verir
    // (Açık Talepler'deki maskeli satırlar firmadan kopuk — 2026-10-03).
    // Davetli olduğu ya da teklif verdiği talepler zaten listede, sayıya girmez.
    const lockedListingCountQuery =
      !isSelf && !connectedForListings && !viewerPaid
        ? this.prisma.listing.count({
            where: {
              companyId: c.id,
              status: "OPEN",
              visibility: "PUBLIC",
              AND: [
                ...viewerListingGates,
                { NOT: { invitations: { some: { invitedCompanyId: user.companyId } } } },
                { NOT: { bids: { some: { bidderCompanyId: user.companyId } } } },
              ],
            },
          })
        : Promise.resolve(0);

    // HIDDEN SEGMENTS (owner rule 2026-10-09): the declared categories a
    // member sees on the profile are the VISIBLE ones only - a legacy
    // declaration under a hidden segment stays in the record (matching still
    // reads it) but is never drawn as a chip. Filtered BEFORE the cap of 12,
    // so hidden codes do not use up the visible slots.
    const shownCategoryIds = [
      ...new Set(visibleCategoryIds([...c.sellerCategoryIds, ...c.buyerCategoryIds]).filter(isCategoryCode)),
    ].slice(0, 12);
    const [listings, reviewRows, products, productCount, catRows, lockedListingCount] = await Promise.all([
      this.prisma.listing.findMany({
        where: {
          companyId: c.id,
          status: "OPEN",
          // F-CONN-1: görünürlük TEK KAYNAK (getOne ile birebir) — PUBLIC +
          // bağlıysa CONNECTIONS + DAVETLİYSE PRIVATE. Eski `connected ? {}`
          // bağlı firmaya davet-only PRIVATE ihaleleri sızdırıyordu.
          // Denetim 2026-08-23 P2 #9: açılış embargosu (bidsOpenAt gelecekte →
          // yalnız teklifi olan görür; NOT(gt) NULL tuzağı yok) + ülke kapsamı
          // (getOne/sellerTenders ile aynı). Kendi profili hariç.
          AND: [
            // Ücretsiz izleyen (2026-09-06): bağlı değilse PUBLIC talepler profilde de yok.
            visibleOwnerListingWhere(user.companyId, connectedForListings, viewerPaid),
            ...viewerListingGates,
          ],
        },
        select: {
          id: true,
          number: true,
          type: true,
          format: true,
          title: true,
          status: true,
          createdAt: true,
          closesAt: true,
          // 2026-09-17: profil satırı `ListingCard row` — kategori tonu,
          // kapsam ve kalem sayısı (kimlik/fiyat taşımaz).
          categoryIds: true,
          isInternational: true,
          targetCountries: true,
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      // 2026-08-22: firma bazında gruplu özet — platform içi: ad yalnız
      // değerlendirenin opt-in'iyle (showName), aksi "Doğrulanmış alıcı/tedarikçi".
      // BAŞKA firmanın verisi → BYPASS (yayın denetimi 2026-09-28, RLS):
      // özet seçimindeki zorunlu `order` ilişkisi (`company_orders`, kısıtlı)
      // izleyene görünmez → Prisma null değil İSTİSNA atar ve profil sayfası
      // 500 döner; ürünler (`company_items`, kısıtlı) boş dönerdi. Süzgeçler
      // (`targetCompanyId`, `publicProductWhere`) kapsamı zaten daraltıyor.
      this.bypass.companyReview.findMany({
        where: { targetCompanyId: c.id },
        select: REVIEW_SUMMARY_SELECT,
        orderBy: { createdAt: "desc" },
        take: REVIEW_SUMMARY_TAKE,
      }),
      // ÜRÜNLER — herkese açık profildeki ızgarayla AYNI kapı ve sıra
      // (`publicProductWhere`); üye katmanı fiyatı da görür.
      this.bypass.companyItem.findMany({
        where: { ...publicProductWhere(), companyId: c.id },
        select: PRODUCT_INDEX_SELECT,
        orderBy: [{ completionScore: "desc" }, { publishedAt: "desc" }],
        take: 24,
      }),
      this.bypass.companyItem.count({ where: { ...publicProductWhere(), companyId: c.id } }),
      this.prisma.category.findMany({
        where: { id: { in: shownCategoryIds } },
        select: { id: true, ...CATEGORY_NAME_SELECT },
      }),
      lockedListingCountQuery,
    ]);
    const reviewSummary = buildReviewSummary(reviewRows, { revealNames: true });
    const catName = new Map(catRows.map((r) => [r.id, categoryName(r)]));
    const categories = shownCategoryIds
      .filter((id) => catName.has(id))
      .map((id) => ({ id, name: catName.get(id) as string }));

    const profile = {
        rothernId: c.rothernId,
        slug: c.slug,
        name: c.name,
        // Faz T: "Gold Üye" rozeti (adlandırma bilinçli — güven iddiası taşımaz).
        goldMember:
          effectiveTier(c.tier, c.membershipEndAt, c.companyVerificationStatus) === "GOLD",
        verified: c.companyVerificationStatus === "VERIFIED",
        industry: c.industry,
        activities: c.activities,
        categories,
        city: c.city,
        country: c.country,
        logoUrl: c.logoUrl,
        coverImageUrl: c.coverImageUrl,
        // Başka firmanın test verisi (anlamsız dizi) üyeye de gösterilmez —
        // public ile aynı düzyazı sezgisi; kendi profilinde ham kalır (düzeltsin).
        aboutText: isSelf || looksLikeProse(c.aboutText) ? c.aboutText : null,
        services: c.services,
        certifications: c.certifications,
        photos: c.photos,
        certificateImages: c.certificateImages,
        foundedYear: c.foundedYear,
        employeeCount: c.employeeCount,
        website: c.website,
        linkedinUrl: c.linkedinUrl,
        instagramUrl: c.instagramUrl,
        rating: { avg: reviewSummary.avg, count: reviewSummary.orders },
        reviewSummary,
        trade: {
          legalName: c.legalName,
          // Kendi profilini gören üye de panelde TCKN'yi görmez; tam değer
          // yalnız Ayarlar > Firma Bilgileri'nde (company:manage) — tek kural.
          taxNumber: visibleTaxNumber(c),
          taxOffice: c.taxOffice,
          mersisNo: c.mersisNo,
          tradeRegistryNo: c.tradeRegistryNo,
          kepAddress: c.kepAddress,
        },
    };
    // i18n Faz 1e: BAŞKASININ profili okuyucunun dilinde (tanıtım, hizmetler, sektör);
    // kendi profili ham kalır — sahibi düzenler.
    // Ürün adları/özetleri ve talep başlıkları da aynı kural (derin denetim
    // 2026-09-29 S025): herkese açık profil ızgarası ürünleri çeviriyordu, üye
    // panelde Türkçe görüyordu — üye, ziyaretçinin gördüğü her şeyi görür.
    // `categoryIds` on the request row is display-only (category tone of the
    // card): codes under a hidden segment are not sent.
    const listingRows = listings.map(({ _count, ...l }) => ({
      ...l,
      categoryIds: visibleCategoryIds(l.categoryIds),
      itemCount: _count.items,
    }));
    const productCards = products.map(toProductIndexCard);
    const locale = currentLocale();
    const translate = this.translations && !isSelf ? this.translations : null;
    const [[localizedProfile], localizedListings, localizedProducts] = translate
      ? await Promise.all([
          translate.localizeCompanies([profile], [c.id], locale),
          translate.localizeListings(listingRows, listings.map((l) => l.id), locale),
          translate.localizeProducts(productCards, products.map((p) => p.id), locale),
        ])
      : [[profile], listingRows, productCards];
    return {
      profile: localizedProfile,
      connectionStatus,
      connectionId,
      connected,
      listings: localizedListings,
      products: localizedProducts,
      productCount,
      lockedListingCount,
    };
  }

  /** Gelen daveti kabul et. */
  async accept(user: AuthenticatedCompanyUser, connectionId: string) {
    const conn = await this.requireIncoming(user.companyId, connectionId);
    // Atomik: ters-yön sarkan PENDING'i ÖNCE sil, SONRA ACTIVE yap — tek tx'te.
    // Sıra önemli: yön-bağımsız partial unique index (PENDING+ACTIVE) A→B ACTIVE
    // olurken B→A PENDING ile çakışırdı; önce silmek çakışmayı önler. Geçiş
    // koşullu (status=PENDING) kalır → reject/disconnect yarışında count=0.
    const updatedCount = await runTenantTx(this.prisma, async (tx) => {
      // Çapraz yarış temizliği: iki firma AYNI ANDA birbirine istek attıysa
      // ters yönde ikinci bir PENDING kayıt oluşmuş olabilir.
      await tx.companyConnection.deleteMany({
        where: {
          inviterCompanyId: user.companyId,
          inviteeCompanyId: conn.inviterCompanyId,
          status: "PENDING",
        },
      });
      const updated = await tx.companyConnection.updateMany({
        where: {
          id: conn.id,
          inviteeCompanyId: user.companyId,
          status: "PENDING",
        },
        data: { status: "ACTIVE", decidedAt: new Date() },
      });
      return updated.count;
    });
    if (updatedCount === 0) {
      throw new ConflictException(i18nMessage("api.companyConnections.davetZatenYanitlanmis"));
    }
    // INV-AUDIT-1 (dalga 3): kabul = ilişki kuruldu, uyuşmazlıkta delil.
    await this.audit.log({
      action: "company.connection.accepted",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_connection",
      entityId: conn.id,
      metadata: {
        inviterCompanyId: conn.inviterCompanyId,
        inviteeCompanyId: user.companyId,
      },
    });
    // Davet eden firmaya haber ver.
    const me = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true },
    });
    void this.notifications
      .pushToCompany(conn.inviterCompanyId, {
        type: "connection_accepted",
        audience: ["connections:manage"],
        titleKey: "api.notifications.companyConnections.accepted.title",
        bodyKey: "api.notifications.companyConnections.accepted.body",
        params: { company: this.companyNameOr(me?.name) },
      })
      .catch((err) =>
        this.logger.warn(
          `Bağlantı kabul bildirimi gönderilemedi: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    void this.emailCompany(
      conn.inviterCompanyId,
      "api.notifications.companyConnections.accepted.title",
      [
        "api.notifications.companyConnections.greeting",
        "api.notifications.companyConnections.accepted.body",
      ],
      { company: this.companyNameOr(me?.name) },
      "connection_accepted",
      conn.id,
    );
    return { ok: true };
  }

  /** Gelen daveti reddet (kaydı sil) — durum guard'lı atomik silme. */
  async reject(user: AuthenticatedCompanyUser, connectionId: string) {
    // requireIncoming dönüşünü tut → audit için karşı taraf (inviter) id'si.
    const conn = await this.requireIncoming(user.companyId, connectionId);
    const res = await this.prisma.companyConnection.deleteMany({
      where: {
        id: connectionId,
        inviteeCompanyId: user.companyId,
        status: "PENDING",
      },
    });
    if (res.count === 0) {
      throw new ConflictException(i18nMessage("api.companyConnections.davetZatenYanitlanmis"));
    }
    // INV-AUDIT-1 (dalga 3): ret = ilişki reddi, uyuşmazlıkta delil.
    await this.audit.log({
      action: "company.connection.rejected",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_connection",
      entityId: connectionId,
      metadata: {
        inviterCompanyId: conn.inviterCompanyId,
        inviteeCompanyId: user.companyId,
      },
    });
    return { ok: true };
  }

  /** Bağlantıyı kopar — taraflardan biri ilişkiyi siler (kaydı kaldırır). */
  async disconnect(user: AuthenticatedCompanyUser, connectionId: string) {
    // Audit için karşı taraf id'sini deleteMany öncesi yakala (deleteMany satır
    // döndürmez). Yalnız loglama amaçlı — silme kararı hâlâ atomik count'a bağlı.
    const before = await this.prisma.companyConnection.findUnique({
      where: { id: connectionId },
      select: { inviterCompanyId: true, inviteeCompanyId: true },
    });
    // Atomik deleteMany (sahiplik koşullu): çift-disconnect yarışında ikinci
    // çağrı count=0 alır — findUnique+delete'in P2025 (yakalanmamış 500) yerine.
    const res = await this.prisma.companyConnection.deleteMany({
      where: {
        id: connectionId,
        OR: [
          { inviterCompanyId: user.companyId },
          { inviteeCompanyId: user.companyId },
        ],
      },
    });
    if (res.count === 0) {
      throw new NotFoundException(i18nMessage("api.companyConnections.baglantiBulunamadi"));
    }
    // INV-AUDIT-1 (dalga 3): bağlantı koparma, uyuşmazlıkta delil. Karşı taraf =
    // aktörün firması hangi tarafsa diğeri (before yarışta null olabilir).
    const counterparty =
      before && before.inviterCompanyId === user.companyId
        ? before.inviteeCompanyId
        : before?.inviterCompanyId ?? null;
    await this.audit.log({
      action: "company.connection.disconnected",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_connection",
      entityId: connectionId,
      metadata: {
        actorCompanyId: user.companyId,
        counterpartyCompanyId: counterparty,
      },
    });
    return { ok: true };
  }

  private async requireIncoming(companyId: string, connectionId: string) {
    const conn = await this.prisma.companyConnection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        inviterCompanyId: true,
        inviteeCompanyId: true,
        status: true,
      },
    });
    if (!conn || conn.inviteeCompanyId !== companyId) {
      throw new NotFoundException(i18nMessage("api.companyConnections.davetBulunamadi"));
    }
    if (conn.status !== "PENDING") {
      throw new ConflictException(i18nMessage("api.companyConnections.davetZatenYanitlanmis"));
    }
    return conn;
  }
}
