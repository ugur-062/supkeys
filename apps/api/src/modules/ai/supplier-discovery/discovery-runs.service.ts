import { ForbiddenException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isLocale, type Locale } from "@rothern/i18n";
import type { DiscoveryTrigger } from "@rothern/db";
import { PrismaBypassService, PrismaService } from "../../../common/prisma/prisma.service";
import { i18nMessage } from "../../../common/i18n/http-i18n";
import { tApi } from "../../../common/i18n/i18n.service";
import { appRoutes } from "../../../common/company/app-routes";
import { resolveWebUrl } from "../../../common/config/web-url";
import { listingTitleParam } from "../../../common/notifications/notification-params";
import { isNotificationEnabled } from "../../../common/notifications/notification-prefs";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { CompanyConnectionsService } from "../../company-connections/services/company-connections.service";
import { listingManageDenial } from "../../company-listings/listing-manage-access";
import { EmailService } from "../../email/email.service";
import { NotificationService } from "../../notifications/notification.service";
import { AiService } from "../ai.service";
import { SupplierDiscoveryService, websiteHost, type DiscoveryAiRunner } from "./supplier-discovery.service";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** Sonuç bu kadar süre sonra (alıcı panelde işlem yapmadıysa) bildirilir. */
const NOTIFY_AFTER_MS = 10 * MINUTE_MS;
/** Takılı kalmış tur bu sürede FAILED sayılır (istek zaman aşımları ~2 dk). */
const STUCK_AFTER_MS = 15 * MINUTE_MS;
/** Bir turda işlenen en fazla tur (her biri ~1 dk: paralel iki web araması). */
const RUNS_PER_TICK = 2;
/** İkinci tur: teklif sayısı bunun altındaysa. */
const SECOND_ROUND_MAX_BIDS = 3;
/** Talep başına en fazla OTOMATİK tur (yayın + ikinci tur). */
const MAX_AUTO_RUNS = 2;
const DEFAULT_DAILY_USD = 15;

export const AI_SUGGESTIONS_NOTIFICATION = "ai_supplier_suggestions";

/**
 * YAYIN SONRASI OTOMATİK TEDARİKÇİ KEŞFİ (2026-09-27, Faz 1; kullanıcı: "talep
 * açıldıktan sonra bile şirketler bulundu, tek tıkla davet gönder diyelim;
 * uluslararası ise yurt dışı dahil").
 *
 *  - Talep açılınca (`Listing.aiDiscovery`) tur kuyruğa girer (`enqueue`);
 *    dakikalık iş (`tick`) işler. Maliyet PLATFORMUN (`callAiSystem`): alıcının
 *    edinme kanalı değil, platformun; günlük USD tavanı `AI_DISCOVERY_DAILY_USD`.
 *  - Arama kapsamı talebin görünürlük ülkesinden (boş = yurt içi + yurt dışı).
 *  - Adaylar işaretlenir (zaten davetli, üye, onay isteyen ülke) ve SEÇİLİ
 *    listelenir; alıcı istemediğini çıkarıp tek tıkla davet eder (kuyruk,
 *    `AI_AUTO`).
 *  - Alıcı 10 dk içinde ekranda işlem yapmadıysa talebi AÇAN kişiye bildirim +
 *    e-posta ("N tedarikçi bulundu"); e-postadaki düğme listeyi AÇAR, gönderim
 *    uygulama içinde (güvenlik tarayıcıları bağlantıyı açabilir).
 *  - Süre yarılandığında teklif 3'ten azsa İKİNCİ TUR (önceki adaylar hariç).
 */
@Injectable()
export class DiscoveryRunsService {
  private readonly logger = new Logger(DiscoveryRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bypass: PrismaBypassService,
    private readonly ai: AiService,
    private readonly discovery: SupplierDiscoveryService,
    private readonly connections: CompanyConnectionsService,
    private readonly config: ConfigService,
    @Optional() private readonly email?: EmailService,
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  /** Talep için tur kuyruğa al (aynı talepte bekleyen/koşan tur varsa yenisi açılmaz). */
  async enqueue(listingId: string, trigger: DiscoveryTrigger): Promise<string | null> {
    const listing = await this.bypass.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true, targetCountries: true },
    });
    if (!listing) return null;
    const active = await this.bypass.supplierDiscoveryRun.findFirst({
      where: { listingId, state: { in: ["PENDING", "RUNNING"] } },
      select: { id: true },
    });
    if (active) return active.id;
    const run = await this.bypass.supplierDiscoveryRun.create({
      data: { listingId, companyId: listing.companyId, trigger, targetCountries: listing.targetCountries },
      select: { id: true },
    });
    return run.id;
  }

  // ------------------------------------------------------------------ iş

  async tick(now: Date = new Date()): Promise<{ processed: number; notified: number; secondRounds: number }> {
    await this.bypass.supplierDiscoveryRun.updateMany({
      where: { state: "RUNNING", startedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
      data: { state: "FAILED", error: "stuck", finishedAt: now },
    });
    const secondRounds = await this.scheduleSecondRounds(now);
    const pending = await this.bypass.supplierDiscoveryRun.findMany({
      where: { state: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: RUNS_PER_TICK,
      select: { id: true },
    });
    let processed = 0;
    for (const r of pending) {
      if (await this.process(r.id, now)) processed++;
    }
    const notified = await this.notifyReady(now);
    return { processed, notified, secondRounds };
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

  private dailyBudgetUsd(): number {
    const v = Number(this.config.get<string>("AI_DISCOVERY_DAILY_USD"));
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_DAILY_USD;
  }

  /** Tek turu işler; atomik sahiplenme (iki örnek aynı turu koşmaz). */
  async process(runId: string, now: Date = new Date()): Promise<boolean> {
    const claimed = await this.bypass.supplierDiscoveryRun.updateMany({
      where: { id: runId, state: "PENDING" },
      data: { state: "RUNNING", startedAt: now },
    });
    if (claimed.count === 0) return false;
    const fail = (error: string) =>
      this.bypass.supplierDiscoveryRun.update({
        where: { id: runId },
        data: { state: "FAILED", error: error.slice(0, 300), finishedAt: new Date() },
      });

    const run = await this.bypass.supplierDiscoveryRun.findUniqueOrThrow({
      where: { id: runId },
      select: {
        listingId: true,
        companyId: true,
        targetCountries: true,
        listing: {
          select: {
            status: true,
            categoryIds: true,
            createdById: true,
            items: { select: { name: true }, orderBy: { lineNo: "asc" }, take: 15 },
          },
        },
      },
    });
    if (!run.listing || !run.listingId || run.listing.status !== "OPEN") {
      await fail("listing_not_open");
      return true;
    }
    if (!this.ai.isEnabled) {
      await fail("ai_disabled");
      return true;
    }
    if ((await this.spentTodayUsd(now)) >= this.dailyBudgetUsd()) {
      await fail("platform_daily_budget");
      return true;
    }
    try {
      const [owner, creator, previous] = await Promise.all([
        this.bypass.company.findUnique({ where: { id: run.companyId }, select: { country: true } }),
        this.bypass.companyUser.findUnique({ where: { id: run.listing.createdById }, select: { locale: true } }),
        this.bypass.supplierDiscoveryCandidate.findMany({
          where: { run: { listingId: run.listingId }, runId: { not: runId } },
          select: { email: true, website: true },
        }),
      ]);
      const locale: Locale = isLocale(creator?.locale) ? creator.locale : "tr";
      const runner: DiscoveryAiRunner = async ({ stage: _stage, ...opts }) => this.ai.callAiSystem(opts);
      const { companies, costUsd } = await this.discovery.searchWeb(
        {
          buyerCountry: owner?.country ?? null,
          targetCountries: run.targetCountries,
          categoryIds: run.listing.categoryIds,
          itemNames: run.listing.items.map((i) => i.name),
          locale,
          excludeEmails: previous.map((p) => p.email).filter((e): e is string => !!e),
          excludeHosts: previous.map((p) => websiteHost(p.website)).filter((h): h is string => !!h),
        },
        runner,
      );
      const annotated = await this.discovery.annotate(run.companyId, run.listingId, companies, now);
      if (annotated.length > 0) {
        await this.bypass.supplierDiscoveryCandidate.createMany({
          data: annotated.map((c) => ({
            runId,
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
          })),
        });
      }
      await this.bypass.supplierDiscoveryRun.update({
        where: { id: runId },
        data: { state: "DONE", finishedAt: new Date(), costUsd },
      });
    } catch (err) {
      this.logger.warn(`discovery run ${runId} failed: ${err instanceof Error ? err.message : String(err)}`);
      await fail(err instanceof Error ? err.message : String(err));
    }
    return true;
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
        publishedAt: { not: null },
        closesAt: { gt: new Date(now.getTime() + 24 * HOUR_MS) },
      },
      select: {
        id: true,
        publishedAt: true,
        closesAt: true,
        _count: { select: { bids: { where: { status: "SUBMITTED" } } } },
        discoveryRuns: { select: { trigger: true, state: true } },
      },
      take: 200,
    });
    let n = 0;
    for (const l of rows) {
      if (!l.publishedAt || !l.closesAt) continue;
      const auto = l.discoveryRuns.filter((r) => r.trigger === "PUBLISH" || r.trigger === "SECOND_ROUND");
      if (auto.length === 0 || auto.length >= MAX_AUTO_RUNS) continue;
      if (auto.some((r) => r.trigger === "SECOND_ROUND")) continue;
      if (l.discoveryRuns.some((r) => r.state === "PENDING" || r.state === "RUNNING")) continue;
      const half = l.publishedAt.getTime() + (l.closesAt.getTime() - l.publishedAt.getTime()) / 2;
      if (now.getTime() < half || l._count.bids >= SECOND_ROUND_MAX_BIDS) continue;
      if (await this.enqueue(l.id, "SECOND_ROUND")) n++;
    }
    return n;
  }

  /** Alıcı ekranda işlem yapmadıysa talebi açan kişiye bildirim + e-posta. */
  private async notifyReady(now: Date): Promise<number> {
    const runs = await this.bypass.supplierDiscoveryRun.findMany({
      where: {
        state: "DONE",
        notifiedAt: null,
        dismissedAt: null,
        trigger: { in: ["PUBLISH", "SECOND_ROUND"] },
        finishedAt: { lte: new Date(now.getTime() - NOTIFY_AFTER_MS) },
        listing: { status: "OPEN" },
      },
      select: {
        id: true,
        listingId: true,
        listing: { select: { title: true, number: true, createdById: true } },
        candidates: { select: { status: true, scope: true } },
      },
      take: 50,
    });
    let n = 0;
    for (const run of runs) {
      await this.bypass.supplierDiscoveryRun.update({ where: { id: run.id }, data: { notifiedAt: now } });
      const open = run.candidates.filter((c) => c.status === "SUGGESTED");
      if (!run.listing || !run.listingId || open.length === 0) continue;
      const abroad = open.filter((c) => c.scope === "ABROAD").length;
      await this.notifyCreator(run.listingId, run.listing, open.length, abroad).catch((err) =>
        this.logger.warn(`discovery notify failed (${run.id}): ${err instanceof Error ? err.message : String(err)}`),
      );
      n++;
    }
    return n;
  }

  private async notifyCreator(
    listingId: string,
    listing: { title: string; number: string | null; createdById: string },
    count: number,
    abroad: number,
  ): Promise<void> {
    const params = { title: listingTitleParam(listingId, listing.title), n: count, abroad };
    const path = `/company/ilan/${listingId}?ai-davet=1`;
    await this.notifications?.pushToUser(listing.createdById, {
      type: AI_SUGGESTIONS_NOTIFICATION,
      titleKey: "api.notifications.discovery.title",
      bodyKey: "api.notifications.discovery.body",
      ctaLabelKey: "api.notifications.discovery.cta",
      params,
      ctaPath: path,
      listingId,
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
      tApi(key, { n: count, abroad, title, number: listing.number ?? "—" }, locale);
    await this.email.send({
      to: { email: user.email, name: user.firstName },
      locale,
      subject: t("api.notifications.discovery.emailSubject"),
      templateData: {
        template: "notification",
        data: {
          subject: t("api.notifications.discovery.emailSubject"),
          heading: t("api.notifications.discovery.emailHeading"),
          paragraphs: [tApi("api.notifications.common.greeting", undefined, locale), t("api.notifications.discovery.emailBody")],
          ctaLabel: t("api.notifications.discovery.cta"),
          ctaUrl: `${appRoutes.listing(resolveWebUrl(this.config), listingId, locale)}?ai-davet=1`,
          footerNote: t("api.notifications.discovery.emailFooter"),
        },
      },
      context: { type: AI_SUGGESTIONS_NOTIFICATION, id: listingId },
    });
  }

  // ------------------------------------------------------------------ alıcı uçları

  private async ownListing(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, companyId: user.companyId },
      select: { id: true, type: true, createdById: true, status: true, aiDiscovery: true },
    });
    if (!listing) throw new NotFoundException(i18nMessage("api.companyConnections.satinAlmaTalebiBulunamadi"));
    if (listingManageDenial(user, listing)) {
      throw new ForbiddenException(i18nMessage("api.companyConnections.buSatinAlmaTalebiIcinDis"));
    }
    return listing;
  }

  /** Talebin keşif sonuçları (tüm turlar, en yeni önce) — bant ve yayın paneli. */
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
          },
        },
      },
    });
    // Ekrandan (pencere/form) sonradan davet edilmiş adres de "davet edildi" görünsün.
    const emails = runs.flatMap((r) => r.candidates.map((c) => c.email)).filter((e): e is string => !!e);
    const invited = new Set(
      (
        await this.prisma.externalListingInvite.findMany({
          where: { listingId, email: { in: emails } },
          select: { email: true },
        })
      ).map((i) => i.email),
    );
    return {
      aiDiscovery: listing.aiDiscovery,
      listingStatus: listing.status,
      runs: runs.map((r) => ({
        ...r,
        candidates: r.candidates.map((c) => ({
          ...c,
          status: c.status === "SUGGESTED" && c.email && invited.has(c.email) ? "INVITED" : c.status,
        })),
      })),
    };
  }

  /** Seçilen adaylara tek tıkla davet — kuyruk (`AI_AUTO`), kurallar kuyrukta. */
  async invite(user: AuthenticatedCompanyUser, listingId: string, candidateIds: string[]) {
    await this.ownListing(user, listingId);
    const cands = await this.prisma.supplierDiscoveryCandidate.findMany({
      where: {
        id: { in: candidateIds.slice(0, 60) },
        status: "SUGGESTED",
        email: { not: null },
        run: { listingId, companyId: user.companyId },
      },
      select: { id: true, email: true, country: true },
    });
    if (cands.length === 0) return { results: [] };
    const { results } = await this.connections.inviteExternalForListing(
      user,
      listingId,
      cands.map((c) => ({ email: c.email!, country: c.country })),
      "AI_AUTO",
    );
    const statusOf = new Map(results.map((r) => [r.email, r.status]));
    for (const c of cands) {
      const st = statusOf.get(c.email!);
      const next = st === "QUEUED" ? "INVITED" : st === "ALREADY_INVITED" ? "ALREADY_INVITED" : null;
      if (next) await this.prisma.supplierDiscoveryCandidate.update({ where: { id: c.id }, data: { status: next } });
    }
    return { results };
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
