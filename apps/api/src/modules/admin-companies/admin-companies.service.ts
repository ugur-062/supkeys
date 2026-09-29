import { i18nMessage } from "../../common/i18n/http-i18n";
import { ALL_SEAT_PERMISSIONS } from "@rothern/shared";
import { resolveCityId } from "../../common/geo/geo-index";
import {
  EU_VAT_COUNTRIES,
  PAID_TIERS,
  PRODUCT_LIMITS,
  bankDetailsErrors,
  countryUsesIban,
  formatVerificationReason,
  isRegistrationOpen,
  isValidAccountNumber,
  isValidCountryCode,
  isValidIbanAny,
  isValidSwiftBic,
  isVerificationReasonCode,
  maskIban,
  maskNationalId,
  normalizeSwift,
  type VerificationReasonCode,
} from "@rothern/shared";
import { assertBankDetails } from "../../common/company/bank-details";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CompanyVerificationStatus,
  ComplaintStatus,
  KycDocStatus,
  Prisma,
  type ListingStatus,
} from "@rothern/db";
import { StorageService } from "../storage/storage.service";
import {
  DOC_META,
  requiredKinds,
  type DocKind,
} from "../company-docs/company-docs.service";
import { isNotificationEnabled } from "../../common/notifications/notification-prefs";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { enforceProductLimit } from "../../common/company/product-limit";
import { ensureOwnerBuySeat } from "../../common/company/owner-buy-seat";
import { AuditService } from "../audit/audit.service";
import { SeoIndexService } from "../seo-index/seo-index.service";
import { EmailService } from "../email/email.service";
import { EmailSuppressionService } from "../email/email-suppression.service";
import {
  NotificationService,
  localeOf,
} from "../notifications/notification.service";
import { tApi, type ApiMessageKey } from "../../common/i18n/i18n.service";
import {
  formatNotificationParams,
  type NotificationParams,
} from "../../common/notifications/notification-params";
import {
  DEFAULT_LOCALE,
  translateRoutePath,
  type Locale,
} from "@rothern/i18n";
import { resolveWebUrl } from "../../common/config/web-url";
import { cancelOutgoingReferralInvites } from "../../common/company/downgrade-invites";

/**
 * Tek duyuruda ulaşılacak azami firma (Dalga B). Aşılırsa gönderim yapılır ama
 * yanıt `truncated` ile bunu SÖYLER — sessiz kesme, "hepsine gitti" yanılgısı
 * üretiyordu.
 */
const ANNOUNCE_MAX_TARGETS = 5000;

/** CTA etiketi verilmeyen bildirimlerin varsayılan düğmesi. */
const DEFAULT_CTA_KEY = "api.notifications.common.gitRothern" as ApiMessageKey;
/** Her bildirim e-postasının ilk paragrafı. */
const GREETING_KEY = "api.notifications.common.greeting" as ApiMessageKey;

/** Çok paragraflı gövdede in-app satırının kaynağı (tek paragraf → o paragraf). */
function inAppBodyKey(msg: {
  bodyKey?: ApiMessageKey;
  subjectKey?: ApiMessageKey;
  paragraphKeys?: readonly (ApiMessageKey | null | false | undefined)[];
}): ApiMessageKey | undefined {
  if (msg.bodyKey) return msg.bodyKey;
  const only = (msg.paragraphKeys ?? []).filter(
    (k): k is ApiMessageKey => !!k,
  );
  return only.length === 1 ? only[0] : msg.subjectKey;
}

/**
 * İÇ (Türkçe, ön eksiz) yol → alıcının dilindeki TAM adres.
 * `common/company/app-routes.ts` içindeki `localize` ile AYNI kural (o dosya
 * yardımcıyı dışa aktardığında burası ona bağlanmalı — iki kopya ayrışmasın).
 */
function localizeUrl(base: string, path: string, locale: Locale): string {
  const outer = translateRoutePath(path, locale);
  if (locale === DEFAULT_LOCALE) return `${base}${outer}`;
  return `${base}${outer === "/" ? `/${locale}` : `/${locale}${outer}`}`;
}

/**
 * Admin bildiriminin METNİ (i18n Faz 3) — metin ALICININ dilinde üretilir, bu
 * yüzden çağıran düz metin değil KATALOG ANAHTARI verir. Düz alanlar
 * (`subject`/`body`/`paragraphs`/`cta.label`) yalnız admin'in KENDİ yazdığı
 * serbest metin içindir (segment duyurusu, "aradı bilgi verdik" mesajı) —
 * o metin çevrilmez, yazıldığı gibi gider.
 *
 * `bodyKey` = in-app bildirim gövdesi (TEK satır); `paragraphKeys` = e-posta
 * paragrafları (ilki selamlama). Tek paragraflı bildirimde `bodyKey` o
 * paragrafın anahtarının AYNISIDIR; çok paragraflıda in-app satırı paragraf
 * tanımadığı için birleşmiş metni taşıyan ayrı bir anahtar kullanılır
 * (e-posta paragraf düzenini korur).
 */
export interface AdminNotifyMessage {
  /** Bildirim tipi (kullanıcı tercihi + audit anahtarı). */
  type: string;
  /** Başlık: in-app title + e-posta konusu/başlığı. */
  subjectKey?: ApiMessageKey;
  subject?: string;
  /**
   * In-app gövde. Verilmezse TEK içerik paragrafı varsa o, yoksa başlık
   * kullanılır — çok paragraflı bildirim birleşmiş metnin anahtarını
   * AÇIKÇA vermelidir.
   */
  bodyKey?: ApiMessageKey;
  body?: string;
  /**
   * E-posta İÇERİK paragrafları (selamlama OTOMATİK eklenir).
   * `null`/`false` girdiler (koşullu paragraf) atlanır.
   */
  paragraphKeys?: readonly (ApiMessageKey | null | false | undefined)[];
  /** Düz metin İÇERİK paragrafları (selamlama OTOMATİK eklenir). */
  paragraphs?: string[];
  /**
   * Başlık + gövde + CTA anahtarlarının ORTAK ICU sözlüğü. Tarih/tutar TİPLİ
   * (`notification-params.ts`) — alıcının dilinde biçimlenir.
   */
  params?: NotificationParams;
  /** Eylem düğmesi — `path` İÇ (Türkçe) yoldur, alıcının diline çevrilir. */
  cta?: { labelKey?: ApiMessageKey; label?: string; path: string };
}

/**
 * KODLU RED GEREKÇESİ (2026-09-27) — saklanan dize `formatVerificationReason`
 * ile "[KOD] not". Eskiden admin'in Türkçe serbest metni olduğu gibi yazılıp
 * firmanın Doğrulama sayfasında basılıyordu (yabancı firma okuyamıyordu); kod
 * artık firmanın dilinde katalogdan çevrilir, not olduğu gibi gösterilir.
 *
 * Kural: red için kod VEYA ≥3 karakterlik not. İkisi de yoksa `null` döner —
 * çağıran kendi (belge/revizyon/firma) hata mesajını atar. Bilinmeyen kod 400:
 * belge kararları serbest biçimli nesne olarak geldiği için DTO yakalamaz.
 */
function composeRejectReason(
  reason: string | null | undefined,
  reasonCode: unknown,
): string | null {
  const code = reasonCode == null || reasonCode === "" ? null : reasonCode;
  if (code !== null && !isVerificationReasonCode(code)) {
    throw new BadRequestException(
      i18nMessage("api.adminCompanies.gecersizRedGerekcesiKodu"),
    );
  }
  const note = reason?.trim() ?? "";
  if (!code && note.length < 3) return null;
  return formatVerificationReason(code as VerificationReasonCode | null, note);
}

@Injectable()
export class AdminCompaniesService {
  private readonly logger = new Logger(AdminCompaniesService.name);

  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly storage: StorageService,
    private readonly email: EmailService,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly suppression: EmailSuppressionService,
    /** Askı/açma herkese açık profili kaldırır/geri getirir. SONDA, isteğe bağlı. */
    @Optional() private readonly seo?: SeoIndexService,
  ) {}

  /**
   * Firmaya (in-app + e-posta) bildirim — admin aksiyonları için. Best-effort.
   * Public: AdminInspectionService (ilan kapatma/sipariş iptali) da kullanır.
   */
  async notifyCompany(companyId: string, msg: AdminNotifyMessage) {
    const baseUrl =
      resolveWebUrl(this.config);
    // In-app (portal-nötr → her iki panelde görünür). Metin ANAHTAR olarak
    // geçer; her alıcı için kendi diliyle `renderPayload` üretir.
    await this.notifications
      .pushToCompany(companyId, {
        type: msg.type,
        titleKey: msg.subjectKey,
        title: msg.subject,
        bodyKey: inAppBodyKey(msg),
        body: msg.body ?? msg.subject,
        params: msg.params,
        ctaLabelKey:
          msg.cta?.labelKey ?? (msg.cta?.label ? undefined : DEFAULT_CTA_KEY),
        ctaLabel: msg.cta?.label,
        ctaPath: `${baseUrl}${msg.cta?.path ?? "/company"}`,
      })
      .catch((err) =>
        this.logger.warn(
          `Admin bildirimi yazılamadı (${companyId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    // E-posta — fail-safe: bu metot `void this.notifyCompany(...)` ile 8 yerden
    // çağrılıyor; findUnique reddi (DB flake) UNHANDLED rejection'a düşmesin
    // (push zaten .catch'li; kardeş notify helper'larıyla iç-guard simetrisi).
    try {
      const c = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          billingEmail: true,
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
      if (!c) return;
      void this.notifyCompanyEmail(c, msg);
    } catch (err) {
      this.logger.warn(
        `Admin bildirimi e-posta hazırlanamadı (${companyId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * notifyCompany'nin E-POSTA yarısı — alıcı satırı ÖNCEDEN çekilmiş olarak alır
   * (announce toplu gönderiminde per-firma findUnique N+1'ini önlemek için).
   * Push (in-app) çağıranda; bu yalnız e-posta gönderir.
   *
   * Hata FIRLATMAZ (reddi kendisi yutar/loglar); sonucu döner — toplu duyuru
   * gönderilen/başarısız sayısını buradan toplar (derin denetim Y-08/X18).
   * `priority: "bulk"` duyuru kuyruğunun diğer e-postaları bekletmemesi için.
   */
  private notifyCompanyEmail(
    company: {
      id: string;
      name: string;
      billingEmail: string | null;
      users: {
        email: string;
        firstName: string;
        lastName: string;
        locale?: string | null;
      }[];
    },
    msg: AdminNotifyMessage,
    opts?: { priority?: "bulk" },
  ): Promise<"sent" | "skipped" | "failed"> {
    const email = company.billingEmail || company.users[0]?.email;
    if (!email) return Promise.resolve("skipped");
    const name = company.users[0]
      ? `${company.users[0].firstName} ${company.users[0].lastName}`.trim() ||
        company.name
      : company.name;
    // E-POSTA DİLİ: firmanın EN ESKİ aktif üyesinin (pratikte kurucu) dili.
    // Yalnız `billingEmail` taşıyan, aktif üyesi çözülmemiş firmada varsayılan.
    const locale = localeOf(company.users[0]?.locale);
    const params = formatNotificationParams(msg.params, locale);
    const t = (key: ApiMessageKey) => tApi(key, params, locale);
    const subject = msg.subjectKey ? t(msg.subjectKey) : (msg.subject ?? "");
    // Selamlama HER İKİ yolda da alıcının dilinde ve otomatik: düz metin yolu
    // (admin duyurusu) yalnız kendi yazdığı gövdeyi verir.
    const paragraphs = [
      t(GREETING_KEY),
      ...(msg.paragraphKeys
        ? msg.paragraphKeys.filter((k): k is ApiMessageKey => !!k).map(t)
        : (msg.paragraphs ?? [])),
    ];
    const ctaLabel = msg.cta?.labelKey
      ? t(msg.cta.labelKey)
      : (msg.cta?.label ?? t(DEFAULT_CTA_KEY));
    const ctaUrl = localizeUrl(
      resolveWebUrl(this.config),
      msg.cta?.path ?? "/company",
      locale,
    );
    return this.email
      .send({
        to: { email, name },
        subject,
        locale,
        templateData: {
          template: "notification",
          data: { subject, heading: subject, paragraphs, ctaLabel, ctaUrl },
        },
        context: { type: msg.type, id: company.id },
        ...(opts?.priority ? { priority: opts.priority } : {}),
      })
      .then((r): "sent" | "skipped" => (r.sent ? "sent" : "skipped"))
      .catch((err: unknown): "failed" => {
        this.logger.warn(
          `Admin e-postası gönderilemedi (${company.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return "failed";
      });
  }

  /**
   * Sayfalı firma listesi — eski 200-kayıt tavanı kalktı (destek ekibi tavan
   * ötesindeki firmalara UI'dan erişemiyordu). Arama kullanıcı e-postasını da
   * kapsar ("mailim şu" diye arayan müşteri adıyla değil e-postasıyla bulunur).
   */
  async list(query: {
    status?: string;
    blocked?: string;
    q?: string;
    country?: string;
    tier?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
    /** "kyc" → başvuru kuyruğu: PENDING firmalar + bekleyen belge-revizyonlular. */
    queue?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (query.queue === "kyc") {
      // Faz Y: başvuru kuyruğu = ilk-doğrulama PENDING'leri VE VERIFIED kalıp
      // belge-güncelleme revizyonu bekleyenler (A-modeli — firma statüsü
      // PENDING'e düşmediği için status filtresi onları tek başına göremezdi).
      // AND'e sarılı: aşağıdaki arama (q) kendi top-level OR'unu kullanıyor.
      where.AND = [
        {
          OR: [
            { companyVerificationStatus: "PENDING" },
            { kycRevisions: { some: { status: "PENDING" } } },
          ],
        },
      ];
    } else if (query.status) {
      where.companyVerificationStatus = query.status as CompanyVerificationStatus;
    }
    if (query.blocked === "true") where.isBlocked = true;
    if (query.country) where.country = query.country.trim().toUpperCase();
    if (query.tier) {
      // DTO @IsIn ile 4 kademeye doğrulanmış.
      where.tier = query.tier as "STANDART" | "SILVER" | "GOLD";
    }
    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { legalName: { contains: q, mode: "insensitive" } },
        { rothernId: { contains: q.toUpperCase() } },
        { taxNumber: { contains: q } },
        {
          users: {
            some: {
              email: { contains: q, mode: "insensitive" },
              deletedAt: null,
            },
          },
        },
      ];
    }
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        select: {
          id: true,
          rothernId: true,
          name: true,
          taxNumber: true,
          country: true,
          stateRegion: true,
          city: true,
          tier: true,
          membershipEndAt: true,
          companyVerificationStatus: true,
          isBlocked: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              complaintsReceived: true,
              // Dalga B: arama `deletedAt:null` süzerken sayaç süzmüyordu →
              // ekranda silinmiş kullanıcılar da sayılıyordu.
              users: { where: { deletedAt: null } },
              // Faz Y: listede "Belge Güncellemesi" rozeti için.
              kycRevisions: { where: { status: "PENDING" } },
            },
          },
        },
        // "oldest": KYC kuyruğu için en-eski-önce (updatedAt ≈ belgelerin
        // yüklendiği/PENDING'e geçtiği an) — SLA'ya göre işlem sırası.
        // Dalga B: tek alanlı sıralama eşit damgalarda sayfalar arası kayma
        // üretiyordu (aynı satır iki sayfada / hiç görünmüyor) → id ile
        // deterministik tie-break.
        orderBy:
          query.sort === "oldest"
            ? [{ updatedAt: "asc" }, { id: "asc" }]
            : [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map((c) => ({
        id: c.id,
        rothernId: c.rothernId,
        name: c.name,
        taxNumber: c.taxNumber,
        country: c.country,
        stateRegion: c.stateRegion,
        city: c.city,
        tier: c.tier,
        membershipEndAt: c.membershipEndAt,
        verification: c.companyVerificationStatus,
        isBlocked: c.isBlocked,
        complaintCount: c._count.complaintsReceived,
        userCount: c._count.users,
        pendingRevisionCount: c._count.kycRevisions,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Dashboard KPI'ları — SERVER-SIDE agregat (count/groupBy). Eskiden dashboard
   * 200-limitli listeden `.length`/`.filter` ile sayıyordu → 200 firma sonrası
   * yanlış/eksik sayılıyordu.
   */
  async stats() {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 86_400_000);
    const in30 = new Date(now.getTime() + 30 * 86_400_000);
    const [
      total,
      byVerification,
      byTier,
      byCountry,
      openComplaints,
      new30Companies,
      new30Listings,
      new30Orders,
      expiring,
      oldestPending,
      onboarded,
      listingsByStatus,
      listingsByVisibility,
      listingsByType,
      totalBids,
      pendingRevisionCompanies,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.company.groupBy({
        by: ["companyVerificationStatus"],
        _count: true,
      }),
      this.prisma.company.groupBy({ by: ["tier"], _count: true }),
      this.prisma.company.groupBy({
        by: ["country"],
        _count: true,
        orderBy: { _count: { country: "desc" } },
        take: 10,
      }),
      this.prisma.companyComplaint.count({ where: { status: "OPEN" } }),
      this.prisma.company.count({ where: { createdAt: { gte: d30 } } }),
      this.prisma.listing.count({ where: { createdAt: { gte: d30 } } }),
      this.prisma.companyOrder.count({ where: { createdAt: { gte: d30 } } }),
      // 30 gün içinde bitecek PAKET üyelikler — yenileme satışı için arama listesi.
      this.prisma.company.findMany({
        where: {
          tier: { in: [...PAID_TIERS] },
          membershipEndAt: { not: null, gte: now, lte: in30 },
        },
        select: {
          id: true,
          name: true,
          rothernId: true,
          membershipEndAt: true,
        },
        orderBy: { membershipEndAt: "asc" },
        take: 10,
      }),
      // KYC kuyruk yaşı: en eski PENDING başvuru — SLA takibi.
      // Dalga B: `updatedAt` YANLIŞ kaynaktı — firmanın herhangi bir profil
      // güncellemesi SLA yaşını sıfırlıyordu. Kuyruğa GİRİŞ anı, başvurunun
      // gönderildiği audit satırıdır (`company.docs.submitted`); yoksa
      // (legacy kayıt) `updatedAt`'e düşülür.
      this.prisma.company.findMany({
        where: { companyVerificationStatus: "PENDING" },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: "asc" },
        take: 500,
      }),
      // Kayıt hunisi 2. adımı: onboarding wizard'ını bitirenler.
      this.prisma.company.count({
        where: { onboardingCompletedAt: { not: null } },
      }),
      // İlan/ihale panosu — durum, görünürlük ve tip kırılımları.
      this.prisma.listing.groupBy({ by: ["status"], _count: true }),
      // Görünürlük YALNIZ yayınlanmışlar üzerinden: taslak bir ilan "herkese
      // açık" sayılmaz (henüz kimse göremiyor).
      this.prisma.listing.groupBy({
        by: ["visibility"],
        _count: true,
        where: { status: { not: "DRAFT" } },
      }),
      this.prisma.listing.groupBy({
        by: ["type"],
        _count: true,
        where: { status: { not: "DRAFT" } },
      }),
      this.prisma.listingBid.count({ where: { status: "SUBMITTED" } }),
      // #13: kuyruk sayacının ikinci yarısı — VERIFIED kalıp belge revizyonu
      // bekleyen firmalar (Faz Y A-modeli). `list(queue:"kyc")` ile simetrik.
      this.prisma.company.count({
        where: {
          companyVerificationStatus: { not: "PENDING" },
          kycRevisions: { some: { status: "PENDING" } },
        },
      }),
    ]);
    // Kuyruğa giriş anı: PENDING firmaların `company.docs.submitted` izlerinin
    // EN ESKİSİ (bkz. yukarıdaki not). Hiç iz yoksa en eski `updatedAt`.
    let oldestPendingSince: Date | null = null;
    if (oldestPending.length > 0) {
      const submitted = await this.prisma.auditLog.findFirst({
        where: {
          action: "company.docs.submitted",
          entityId: { in: oldestPending.map((c) => c.id) },
        },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      oldestPendingSince = submitted?.createdAt ?? oldestPending[0]!.updatedAt;
    }
    const vmap = new Map(
      byVerification.map((g) => [g.companyVerificationStatus, g._count]),
    );
    const tmap = new Map(byTier.map((g) => [g.tier, g._count]));
    return {
      totalCompanies: total,
      verified: vmap.get("VERIFIED") ?? 0,
      pendingKyc: (vmap.get("PENDING") ?? 0) + (vmap.get("UNVERIFIED") ?? 0),
      /**
       * İnceleme bekleyen GERÇEK kuyruk — `list(queue:"kyc")` ile AYNI evren
       * olmalı (#13): ilk-doğrulama PENDING'leri + VERIFIED kalıp belge
       * revizyonu bekleyenler. Eskiden yalnız PENDING sayılıyordu; rozet "3"
       * derken kuyrukta 5 satır çıkıyordu.
       */
      pendingReview: (vmap.get("PENDING") ?? 0) + pendingRevisionCompanies,
      rejected: vmap.get("REJECTED") ?? 0,
      openComplaints,
      tierBreakdown: {
        STANDART: tmap.get("STANDART") ?? 0,
        SILVER: tmap.get("SILVER") ?? 0,
        GOLD: tmap.get("GOLD") ?? 0,
      },
      countryBreakdown: byCountry.map((g) => ({
        country: g.country,
        count: g._count,
      })),
      last30Days: {
        newCompanies: new30Companies,
        newListings: new30Listings,
        newOrders: new30Orders,
      },
      expiringMemberships: expiring,
      oldestPendingSince: oldestPendingSince,
      /** Kayıt hunisi: kayıt → onboarding → KYC belgeleri → doğrulandı. */
      funnel: {
        signedUp: total,
        onboarded,
        kycSubmitted:
          (vmap.get("PENDING") ?? 0) +
          (vmap.get("VERIFIED") ?? 0) +
          (vmap.get("REJECTED") ?? 0),
        verified: vmap.get("VERIFIED") ?? 0,
      },
      listings: (() => {
        const smap = new Map(listingsByStatus.map((g) => [g.status, g._count]));
        const vismap = new Map(
          listingsByVisibility.map((g) => [g.visibility, g._count]),
        );
        const tymap = new Map(listingsByType.map((g) => [g.type, g._count]));
        const st = (k: ListingStatus) => smap.get(k) ?? 0;
        const total = listingsByStatus.reduce((n, g) => n + g._count, 0);
        const draft = st("DRAFT");
        return {
          /** Sistemde açılmış TÜM ilanlar (taslaklar dahil). */
          total,
          /** Yayına çıkmış ilanlar — görünürlük/tip kırılımlarının paydası. */
          published: total - draft,
          draft,
          /** Şu an teklif toplayan. */
          open: st("OPEN"),
          /** Süre doldu, alıcı karar veriyor (onay bekleyen dahil). */
          inAward: st("IN_AWARD") + st("IN_AWARD_APPROVAL"),
          /** Kazandırıldı — sipariş(ler) oluştu. */
          awarded: st("AWARDED"),
          /** Kazanansız kapanan + iptal — sonuçsuz biten. */
          closedNoAward: st("CLOSED_NO_AWARD") + st("CANCELLED"),
          /**
           * #12 (denetim 2026-08-26 Parça 9): `CLOSED` (admin moderasyonu) ve
           * `IN_APPROVAL` (yayın onayı) hiçbir kovada yoktu; `published` ise
           * onları sayıyordu → ekrandaki "yayınlanmış" toplamı kovaların
           * toplamını tutmuyor, ilanlar buharlaşıyordu. Kovalar artık MECE.
           */
          inApproval: st("IN_APPROVAL"),
          moderationClosed: st("CLOSED"),
          byVisibility: {
            PUBLIC: vismap.get("PUBLIC") ?? 0,
            CONNECTIONS: vismap.get("CONNECTIONS") ?? 0,
            PRIVATE: vismap.get("PRIVATE") ?? 0,
          },
          byType: {
            ALIM: tymap.get("ALIM") ?? 0,
          },
          /** Gönderilmiş teklif sayısı — platform canlılığı göstergesi. */
          totalBids,
        };
      })(),
    };
  }

  async detail(id: string) {
    const c = await this.prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        rothernId: true,
        name: true,
        legalName: true,
        taxNumber: true,
        taxOffice: true,
        country: true,
        stateRegion: true,
        city: true,
        // Adresin kalanı + hukuki yapı + yetkili kimliği (2026-09-27): admin
        // belge incelerken bunları görmüyordu (yabancı firmanın GmbH/LLC'si,
        // posta kodu, TR ilçe/mahalle).
        district: true,
        neighborhood: true,
        postalCode: true,
        companyType: true,
        authorizedTckn: true,
        addressLine: true,
        billingEmail: true,
        tier: true,
        membershipEndAt: true,
        industry: true,
        website: true,
        companyVerificationStatus: true,
        companyVerifiedAt: true,
        companyRejectionReason: true,
        // KYC kimlik bilgileri — admin onaydan önce inceler.
        mersisNo: true,
        tradeRegistryNo: true,
        iban: true,
        ibanHolder: true,
        bankSwiftBic: true,
        bankName: true,
        legalFormLocal: true,
        // Belgeler: url/key + belge bazlı inceleme durumu + red gerekçesi.
        docTaxPlateUrl: true,
        docTaxPlateStatus: true,
        docTaxPlateReason: true,
        docTradeRegistryUrl: true,
        docTradeRegistryStatus: true,
        docTradeRegistryReason: true,
        docSignatureCircularUrl: true,
        docSignatureCircularStatus: true,
        docSignatureCircularReason: true,
        docActivityCertUrl: true,
        docActivityCertStatus: true,
        docActivityCertReason: true,
        docIdFrontUrl: true,
        docIdFrontStatus: true,
        docIdFrontReason: true,
        docIdBackUrl: true,
        docIdBackStatus: true,
        docIdBackReason: true,
        isBlocked: true,
        blockedReason: true,
        blockedAt: true,
        createdAt: true,
        // Suppression rozeti: kullanıcı login adresleri + billingEmail'in
        // e-posta ALIP ALAMADIĞINI göster ("giriş yapamıyorum" destek çağrısı).
        users: { select: { email: true } },
        _count: {
          select: {
            users: { where: { deletedAt: null } },
            listings: true,
            complaintsReceived: true,
          },
        },
      },
    });
    if (!c) throw new NotFoundException(i18nMessage("api.adminCompanies.firmaBulunamadi"));
    const openComplaints = await this.prisma.companyComplaint.count({
      where: { againstCompanyId: id, status: "OPEN" },
    });
    // Firmaya bağlı adreslerin suppression durumu (hard-bounce/şikayet →
    // adres e-posta alamıyor). Tek-kaynak türetme (clear-marker sonrası).
    const suppressionMap = await this.suppression.getSuppressionStatus([
      ...c.users.map((u) => u.email),
      ...(c.billingEmail ? [c.billingEmail] : []),
    ]);
    const suppressions = [...suppressionMap.values()];
    // Hassas KYC belgeleri kalıcı public URL değil, kısa ömürlü presigned GET.
    const [
      docTaxPlateUrl,
      docTradeRegistryUrl,
      docSignatureCircularUrl,
      docActivityCertUrl,
      docIdFrontUrl,
      docIdBackUrl,
    ] = await Promise.all([
      // #7: KYC incelemesi SATIR-İÇİ önizlenebilmeli (yanıt içerik tipi
      // sunucuda beyaz listeden sabitlenir → XSS kapalı kalır, belge admin
      // diskine inmek zorunda kalmaz).
      this.storage.presignInlinePreview("private", c.docTaxPlateUrl),
      this.storage.presignInlinePreview("private", c.docTradeRegistryUrl),
      this.storage.presignInlinePreview("private", c.docSignatureCircularUrl),
      this.storage.presignInlinePreview("private", c.docActivityCertUrl),
      this.storage.presignInlinePreview("private", c.docIdFrontUrl),
      this.storage.presignInlinePreview("private", c.docIdBackUrl),
    ]);
    // Faz Y: bekleyen belge-güncelleme revizyonları (A-modeli) — admin tekil
    // onaylar/reddeder; presigned GET ile önizlenir.
    const pendingRevs = await this.prisma.companyKycRevision.findMany({
      where: { companyId: id, status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    const pendingRevisions = await Promise.all(
      pendingRevs.map(async (r) => ({
        id: r.id,
        kind: r.kind,
        createdAt: r.createdAt,
        url: await this.storage.presignInlinePreview("private", r.key),
      })),
    );
    // VIES (AB KDV) sonucu — şema değişikliği olmadan audit kaydından
    // (2026-09-27): firma tarafı her sorguyu `company.vies_checked` olarak
    // yazar (onboarding düğmesi + kayıt tamamlanınca arka plan); admin en
    // sonuncuyu görür. Kayıt yoksa `null`.
    const viesLog = await this.prisma.auditLog.findFirst({
      where: { action: "company.vies_checked", entityType: "company", entityId: id },
      orderBy: { createdAt: "desc" },
      select: { metadata: true, createdAt: true },
    });
    const viesMeta = (viesLog?.metadata ?? null) as Record<string, unknown> | null;
    const vies = viesLog && viesMeta
      ? {
          valid: viesMeta.valid === true,
          unavailable: viesMeta.unavailable === true,
          name: typeof viesMeta.name === "string" ? viesMeta.name : null,
          address: typeof viesMeta.address === "string" ? viesMeta.address : null,
          vatNumber: typeof viesMeta.vatNumber === "string" ? viesMeta.vatNumber : null,
          countryCode: typeof viesMeta.countryCode === "string" ? viesMeta.countryCode : null,
          source: typeof viesMeta.source === "string" ? viesMeta.source : null,
          checkedAt: viesLog.createdAt,
        }
      : null;
    // `users` yalnız suppression hesabı için çekildi — detay contract'ına ham
    // liste sızdırma (ayrı users endpoint'i var); yalnız suppressions dön.
    const { users: _users, authorizedTckn, ...company } = c;
    return {
      ...company,
      // Yetkili kimlik no MASKELİ (KVKK veri-minimizasyonu; firma tarafıyla
      // aynı `maskNationalId`) — tanımaya yeter, kopyalamaya yetmez.
      authorizedTckn: authorizedTckn ? maskNationalId(authorizedTckn) : null,
      vies,
      // AB üyesi mi (VIES sorgulanabilir) — admin "sorgulanmadı" satırını
      // yalnız bu ülkelerde çizer; kuralın kopyası admin'de tutulmaz.
      viesSupported: EU_VAT_COUNTRIES.has((c.country ?? "").toUpperCase()),
      // Ülkenin zorunlu belge seti — admin ekranı kendi kopyasını TUTMAZ
      // (2026-09-27: eskiden "TR 6 / yabancı 3" ikili kuralı KKTC/Çin/BAE'de yanlıştı).
      requiredDocs: requiredKinds(c.country),
      // IBAN'sız ülkede `iban` kolonu hesap numarasıdır — admin etiketi buradan
      // (admin uygulaması @rothern/shared'e bağlı değil; kural kopyalanmaz).
      usesIban: countryUsesIban(c.country),
      docTaxPlateUrl,
      docTradeRegistryUrl,
      docSignatureCircularUrl,
      docActivityCertUrl,
      docIdFrontUrl,
      docIdBackUrl,
      // #3 sürüm sabitlemesi: presigned URL kısa ömürlü ve nesneyi tanımlamaz.
      // İncelenen nesnenin ANAHTARI ayrıca dönülür; ön yüz kararı gönderirken
      // bunu geri yollar → arada belge değiştiyse karar 409 ile reddedilir.
      docKeys: {
        taxPlate: c.docTaxPlateUrl,
        tradeRegistry: c.docTradeRegistryUrl,
        signatureCircular: c.docSignatureCircularUrl,
        activityCert: c.docActivityCertUrl,
        idFront: c.docIdFrontUrl,
        idBack: c.docIdBackUrl,
      },
      openComplaints,
      suppressions,
      pendingRevisions,
    };
  }

  /**
   * Firma kimlik bilgisi düzeltme — "yanlış yazdım" destek çağrıları için.
   * Yalnız gönderilen alanlar değişir; öncesi/sonrası audit'e yazılır.
   * Vergi no/ülke gibi alanların değişimi KYC kararını OTOMATİK bozmaz —
   * gerekiyorsa admin belgeleri yeniden inceler (bilinçli ayrım).
   */
  async updateProfile(
    id: string,
    input: Partial<
      Record<
        | "name"
        | "legalName"
        | "taxNumber"
        | "taxOffice"
        | "mersisNo"
        | "tradeRegistryNo"
        | "country"
        | "companyType"
        | "legalFormLocal"
        | "stateRegion"
        | "city"
        | "addressLine"
        | "billingEmail"
        | "website"
        | "industry"
        | "iban"
        | "ibanHolder"
        | "bankSwiftBic"
        | "bankName",
        string | null
      >
    >,
    adminId: string,
  ) {
    const before = await this.prisma.company.findUnique({
      where: { id },
      select: {
        name: true,
        legalName: true,
        taxNumber: true,
        taxOffice: true,
        mersisNo: true,
        tradeRegistryNo: true,
        country: true,
        companyType: true,
        legalFormLocal: true,
        stateRegion: true,
        city: true,
        addressLine: true,
        billingEmail: true,
        website: true,
        industry: true,
        iban: true,
        ibanHolder: true,
        bankSwiftBic: true,
        bankName: true,
      },
    });
    if (!before) throw new NotFoundException(i18nMessage("api.adminCompanies.firmaBulunamadi"));

    // Yalnız gerçekten değişen alanları uygula ("" → null normalize).
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const data: Record<string, string | null> = {};
    for (const [key, raw] of Object.entries(input)) {
      if (raw === undefined) continue;
      const value = typeof raw === "string" ? raw.trim() || null : raw;
      const prev = (before as Record<string, unknown>)[key] ?? null;
      if (value === prev) continue;
      // Ad boş bırakılamaz; ülke 2 harfli koda normalize edilir.
      if (key === "name" && !value) {
        throw new BadRequestException(i18nMessage("api.adminCompanies.firmaAdiBosOlamaz"));
      }
      data[key] =
        key === "country" && value
          ? value.toUpperCase()
          : key === "bankSwiftBic" && value
            ? normalizeSwift(value)
            : key === "billingEmail" && value
              ? value.toLowerCase()
              : value;
      // Ülke tam listeden (2026-09-27): eskiden her 2 harf ("ZZ") yazılıyordu.
      if (key === "country" && data[key] && !isValidCountryCode(data[key]!)) {
        throw new BadRequestException(i18nMessage("api.adminCompanies.gecersizUlkeKodu"));
      }
      // Kayda KAPALI ülkeye (ABD + toprakları, kapsamlı yaptırım ülkeleri —
      // `REGISTRATION_BLOCKED`) admin yolundan da taşınamaz: firma tarafı bu
      // ülkeleri hiç seçtirmiyor, admin düzeltmesi kapıyı arkadan açıyordu.
      // Yalnız DEĞİŞİMDE (aynı değer yukarıda atlandı) — zaten kapalı ülkedeki
      // eski kayıt başka alan düzenlenirken reddedilmez.
      if (key === "country" && data[key] && !isRegistrationOpen(data[key]!)) {
        throw new BadRequestException(
          i18nMessage("api.adminCompanies.buUlkeKaydaKapali"),
        );
      }
      // #11 (denetim 2026-08-26 Parça 9): IBAN audit'e DÜZ yazılıyordu —
      // firma tarafı aynı veriyi bilinçli olarak `maskIban` ile yazıyor
      // (company-docs). Alan adının değiştiği bilgisi iz için yeterli.
      changes[key] =
        key === "iban"
          ? {
              from: typeof prev === "string" ? maskIban(prev) : prev,
              to: typeof data[key] === "string" ? maskIban(data[key]!) : null,
            }
          : { from: prev, to: data[key] };
    }
    // #11: kimlik alanlarının FORMATI yalnız firma `submit()`'inde
    // doğrulanıyordu; admin yolu yazım hatasını sessizce kabul ediyordu.
    // Ülkeye duyarlı kural: TR firmada IBAN TR + 24 rakam olmalı.
    const effectiveCountry = (
      (data.country as string | undefined) ??
      before.country ??
      "TR"
    ).toUpperCase();
    // HUKUKİ YAPI (2026-09-27) — onboarding kuralının aynısı: "Diğer" (OTHER)
    // iken yerel ad (GmbH, LLC, ООО…) ZORUNLU; OTHER değilse yerel ad tutulmaz.
    if ("companyType" in data || "legalFormLocal" in data) {
      const type = ("companyType" in data ? data.companyType : before.companyType) ?? null;
      if (type === "OTHER") {
        const local = ("legalFormLocal" in data ? data.legalFormLocal : before.legalFormLocal) ?? "";
        if (local.trim().length < 2) {
          throw new BadRequestException(
            i18nMessage("api.adminCompanies.yerelHukukiYapiZorunlu"),
          );
        }
      } else if (before.legalFormLocal || "legalFormLocal" in data) {
        if (before.legalFormLocal) {
          changes.legalFormLocal = { from: before.legalFormLocal, to: null };
          data.legalFormLocal = null;
        } else {
          delete data.legalFormLocal;
          delete changes.legalFormLocal;
        }
      }
    }
    // Ülkeye göre (2026-09-27): IBAN ülkesinde IBAN (TR katı, diğerleri mod-97),
    // IBAN kullanmayan ülkede hesap numarası — firma tarafıyla aynı kural.
    if (typeof data.iban === "string" && data.iban.trim()) {
      if (countryUsesIban(effectiveCountry)) {
        const iban = data.iban.replace(/\s+/g, "").toUpperCase();
        if (!isValidIbanAny(iban)) {
          throw new BadRequestException(
            effectiveCountry === "TR"
              ? i18nMessage("api.adminCompanies.gecerliBirIbanGerekliTr24")
              : i18nMessage("api.bankDetails.ibanInvalid"),
          );
        }
        data.iban = iban;
      } else if (!isValidAccountNumber(data.iban)) {
        throw new BadRequestException(i18nMessage("api.bankDetails.accountNumberInvalid"));
      }
      changes.iban = { from: changes.iban?.from ?? null, to: maskIban(data.iban as string) };
    }
    // Banka bilgisi değiştiyse birleşik hâl ortak kapıdan (firma tarafıyla aynı
    // kural): IBAN'sız ülkede hesap no + SWIFT + banka adı; IBAN ülkesinde SWIFT
    // biçimi. Hesap/IBAN boşaltılıyorsa (bilgi siliniyor) yalnız SWIFT biçimi.
    if ("iban" in data || "bankSwiftBic" in data || "bankName" in data) {
      const pick = (k: "iban" | "bankSwiftBic" | "bankName") => (k in data ? data[k] : before[k]) ?? null;
      const account = pick("iban");
      if (account) {
        const usesIban = countryUsesIban(effectiveCountry);
        assertBankDetails({
          country: effectiveCountry,
          iban: usesIban || isValidIbanAny(account) ? account : null,
          accountNumber: usesIban ? null : account,
          swiftBic: pick("bankSwiftBic"),
          bankName: pick("bankName"),
        });
      } else if (data.bankSwiftBic && !isValidSwiftBic(data.bankSwiftBic)) {
        throw new BadRequestException(i18nMessage("api.bankDetails.swiftInvalid", undefined, "BANK_DETAILS_INVALID"));
      }
    }
    if (Object.keys(data).length === 0) {
      return { ok: true, changed: [] };
    }
    // Şehir ya da ülke değiştiyse dünya şehir listesi kaydı yeniden eşlenir (2026-09-27).
    const writeData: Record<string, string | number | null> = { ...data };
    if ("city" in data || "country" in data) {
      writeData.cityId = resolveCityId(
        (data.country as string | null | undefined) ?? before.country,
        "city" in data ? (data.city as string | null) : before.city,
      );
    }
    // Vergi no platform genelinde tekil (`companies_taxNumber_key`): başka
    // firmadaki numaraya düzeltme 500 yerine anlaşılır 409 döner (derin denetim
    // 2026-09-29 MU-16).
    try {
      await this.prisma.company.update({ where: { id }, data: writeData });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002" &&
        String(Array.isArray(e.meta?.target) ? e.meta.target.join(",") : e.meta?.target ?? "").includes("taxNumber")
      ) {
        throw new ConflictException(i18nMessage("api.adminCompanies.buVergiNumarasiBaskaFirmada"));
      }
      throw e;
    }
    // Dalga B: ülke değişimi ZORUNLU BELGE SETİNİ değiştirir (TR 6 / yabancı 3).
    // DE→TR çevrilen VERIFIED bir firmada imza sirküleri/faaliyet belgesi/kimlik
    // arkası hiç yüklenmemiş olabilir; eski davranışta durum VERIFIED kalıyor ve
    // `queue=kyc` bu firmayı GÖSTERMİYORDU → eksik KYC sessizce kalıcı oluyordu.
    // Artık yeni zorunlulardan eksik varsa firma yeniden incelemeye düşer.
    if (data.country !== undefined) {
      const after = await this.prisma.company.findUnique({
        where: { id },
        select: {
          country: true,
          companyVerificationStatus: true,
          docTaxPlateUrl: true,
          docTradeRegistryUrl: true,
          docSignatureCircularUrl: true,
          docActivityCertUrl: true,
          docIdFrontUrl: true,
          docIdBackUrl: true,
        },
      });
      if (after && after.companyVerificationStatus === "VERIFIED") {
        const missing = requiredKinds(after.country).filter(
          (k) => !(after as Record<string, unknown>)[DOC_META[k].url],
        );
        if (missing.length > 0) {
          await this.prisma.company.update({
            where: { id },
            data: {
              companyVerificationStatus: "UNVERIFIED",
              companyVerifiedAt: null,
              // Kodlu gerekçe (2026-09-27): firmanın dilinde katalogdan
              // çevrilir — eskiden sabit Türkçe cümle yabancı firmaya basılıyordu.
              companyRejectionReason: formatVerificationReason("COUNTRY_CHANGED"),
            },
          });
          void this.notifyCompany(id, {
            type: "company_verification",
            subjectKey: "api.notifications.adminCompanies.ulkeDegistiBaslik",
            paragraphKeys: [
              "api.notifications.adminCompanies.ulkeDegistiGovde",
            ],
            cta: {
              labelKey: "api.notifications.common.belgeleriTamamla",
              path: "/company/ayarlar/dogrulama",
            },
          });
        }
      }
    }
    await this.audit.log({
      action: "admin.company.profile_updated",
      actorType: "admin",
      actorId: adminId ?? null,
      entityType: "company",
      entityId: id,
      metadata: { changes },
    });
    return { ok: true, changed: Object.keys(data) };
  }

  /**
   * VERIFIED kararının ön koşulu: ülkeye göre ZORUNLU kimlik alanları dolu mu?
   * (Dalga B) Bu kural firma tarafında yalnız `submit()`'te uygulanıyordu;
   * admin onay yolu (verify/review) atlayabiliyordu → MERSİS/sicil/IBAN'ı boş
   * bir firma VERIFIED olup para taahhüdü doğuran akışlara girebiliyordu.
   */
  private assertKycIdentityComplete(c: {
    country: string | null;
    mersisNo: string | null;
    tradeRegistryNo: string | null;
    iban: string | null;
    ibanHolder: string | null;
    bankSwiftBic: string | null;
    bankName: string | null;
  }): void {
    // ÜLKEDEN BAĞIMSIZ (2026-09-27): eskiden TR dışı firma için erken dönüyordu
    // → admin yabancı firmayı sicil/banka bilgisi BOŞKEN onaylayabiliyordu,
    // oysa firma tarafı `submit()` hepsini istiyordu. Kural aynı: sicil + banka
    // (IBAN ya da hesap no) + hesap sahibi + SWIFT her ülkede; MERSİS yalnız TR;
    // banka adı IBAN kullanmayan ülkede.
    const country = (c.country ?? "TR").toUpperCase();
    const usesIban = countryUsesIban(country);
    const missing: string[] = [];
    if (country === "TR" && !c.mersisNo?.trim()) missing.push("MERSİS numarası");
    if (!c.tradeRegistryNo?.trim()) missing.push("ticari sicil numarası");
    // Banka alanlari TEK KAYNAKTAN (`bankDetailsErrors`, firma `submit()` ile
    // ayni cagri): IBAN'siz ulkede gecerli IBAN verilmisse banka adi ISTENMEZ.
    // Eskiden burada elle yazilmis `!usesIban && !bankName` kurali vardi —
    // firma kapisindan PENDING'e gecen basvuru admin onayinda 400 aliyordu
    // (derin denetim MU-02). Yalniz EKSIKLIK kapisi: bicim hatasi (eski kayit)
    // onayi burada kilitlemez, davranis oncekiyle ayni.
    const bankErrors = bankDetailsErrors(
      {
        country,
        ...(usesIban ? { iban: c.iban } : { accountNumber: c.iban }),
        swiftBic: c.bankSwiftBic,
        bankName: c.bankName,
      },
      { requireSwift: true },
    );
    // Yaptirim ulkesi (IBAN oneki / SWIFT ulkesi) onayda da kapali: firma
    // kapisi `assertBankDetails` ile ayni hata. `bankDetailsErrors` bu durumda
    // erken doner (eksik alan kodlari gelmez) — kontrol edilmezse bu fixten
    // once PENDING'e gecmis IR IBAN'li eski kayit onaydan gecerdi (derin
    // denetim MU-17, gozden gecirme).
    if (bankErrors.includes("ibanCountryBlocked") || bankErrors.includes("swiftCountryBlocked")) {
      throw new BadRequestException(
        i18nMessage("api.bankDetails.bankCountryBlocked", undefined, "BANK_COUNTRY_BLOCKED"),
      );
    }
    if (bankErrors.includes("ibanRequired")) missing.push("IBAN");
    if (bankErrors.includes("accountNumberRequired")) missing.push("banka hesap numarası");
    if (!c.ibanHolder?.trim()) missing.push("hesap sahibi");
    if (bankErrors.includes("swiftRequired")) missing.push("SWIFT/BIC");
    if (bankErrors.includes("bankNameRequired")) missing.push("banka adı");
    if (missing.length > 0) {
      throw new BadRequestException(
        i18nMessage("api.adminCompanies.dogrulamaIcinEksikKimlikBilgisiFirma", { join: missing.join(", ") }),
      );
    }
  }

  async setVerification(
    id: string,
    status: "VERIFIED" | "REJECTED",
    adminId: string,
    reason?: string,
    reasonCode?: VerificationReasonCode | null,
  ) {
    // Denetim 2026-08-26 Parça 9 #1: bu uç eskiden kaynak duruma ve belgelere
    // HİÇ bakmadan karar yazıyor, üstelik `DOC_META`'nın TÜM anahtarlarını
    // (ülkede zorunlu olmayanlar + hiç yüklenmemiş olanlar dahil) damgalıyordu.
    // İki yönlü hasar veriyordu: (a) sıfır belgeli firma VERIFIED olup
    // `assertVerified` kapısını geçiyordu; (b) boş kolon APPROVED damgası
    // yiyince company-docs'un "onaylanan belge değiştirilemez" kilidi devreye
    // giriyor ve o kilit VERIFIED→revizyon dalından ÖNCE olduğu için firma o
    // belgeyi BİR DAHA ASLA yükleyemiyordu. Artık kardeş uç `reviewDocuments`
    // ile aynı kapılar geçerli ve yalnız ZORUNLU belgeler damgalanır.
    const c = await this.prisma.company.findUnique({
      where: { id },
      select: {
        country: true,
        companyVerificationStatus: true,
        mersisNo: true,
        tradeRegistryNo: true,
        iban: true,
        ibanHolder: true,
        bankSwiftBic: true,
        bankName: true,
        docTaxPlateUrl: true,
        docTradeRegistryUrl: true,
        docSignatureCircularUrl: true,
        docActivityCertUrl: true,
        docIdFrontUrl: true,
        docIdBackUrl: true,
      },
    });
    if (!c) throw new NotFoundException(i18nMessage("api.adminCompanies.firmaBulunamadi"));
    const required = requiredKinds(c.country);
    // Kodlu gerekçe (2026-09-27): red için kod VEYA ≥3 karakterlik not.
    const rejectReason =
      status === "REJECTED" ? composeRejectReason(reason, reasonCode) : null;
    if (status === "REJECTED" && !rejectReason) {
      throw new BadRequestException(
        i18nMessage("api.dto.adminCompanies.redGerekcesiEnAz3KarakterOlmali"),
      );
    }
    if (status === "VERIFIED") {
      for (const k of required) {
        if (!(c as Record<string, unknown>)[DOC_META[k].url]) {
          throw new BadRequestException(
            i18nMessage("api.adminCompanies.eksikBelgeVarKararVerilemez", { k: k }),
          );
        }
      }
      this.assertKycIdentityComplete(c);
    }
    const docStatus: KycDocStatus = status === "VERIFIED" ? "APPROVED" : "REJECTED";
    const docReason = rejectReason;
    // Yalnız ülkeye göre ZORUNLU belgeler damgalanır — yüklenmemiş/opsiyonel
    // kolonlara dokunulmaz (kalıcı kilit üretmesin).
    const docData = Object.fromEntries(
      required.flatMap((k) => [
        [DOC_META[k].status, docStatus],
        [DOC_META[k].reason, docReason],
      ]),
    );
    const wasSame = c.companyVerificationStatus === status;
    // #4 CAS: okuduğumuz durumdan başkası yazdıysa reddet (iki admin çelişkili
    // karar verirse "son yazan kazansın" yerine ikincisi 409 alır).
    const done = await this.prisma.company.updateMany({
      where: { id, companyVerificationStatus: c.companyVerificationStatus },
      data: {
        companyVerificationStatus: status as CompanyVerificationStatus,
        // Doğrulama tarihi YALNIZ gerçek geçişte yazılır — zaten VERIFIED bir
        // firmada kararın tekrarı geçmişi silmesin.
        companyVerifiedAt:
          status === "VERIFIED" ? (wasSame ? undefined : new Date()) : null,
        // Red gerekçesi firmaya gösterilir; onayda temizlenir.
        companyRejectionReason: rejectReason,
        ...docData,
      },
    });
    if (done.count !== 1) {
      throw new ConflictException(
        i18nMessage("api.adminCompanies.firmaDogrulamaDurumuAzOnceDegisti"),
      );
    }
    await this.audit.log({
      action: "admin.company.verification_set",
      actorType: "admin",
      actorId: adminId ?? null,
      entityType: "company",
      entityId: id,
      metadata: { status, from: c.companyVerificationStatus },
      // #10: KYC kapısını açan/kapatan karar — audit yazımı düşerse alarm.
      critical: true,
    });
    // Bildirim yalnız gerçek geçişte (kararın tekrarı ikinci e-posta atmasın).
    if (wasSame) return { ok: true, unchanged: true };
    // Firmaya sonucu bildir (in-app + e-posta) — onboarding için kritik.
    if (status === "VERIFIED") {
      void this.notifyCompany(id, {
        type: "company_verification",
        subjectKey: "api.notifications.adminCompanies.dogrulamaOnaylandiBaslik",
        paragraphKeys: [
          "api.notifications.adminCompanies.dogrulamaOnaylandiGovde",
        ],
        cta: {
          labelKey: "api.notifications.common.hesabim",
          path: "/company/ayarlar/dogrulama",
        },
      });
    } else {
      void this.notifyCompany(id, {
        type: "company_verification",
        subjectKey: "api.notifications.adminCompanies.dogrulamaReddedildiBaslik",
        paragraphKeys: [
          "api.notifications.adminCompanies.dogrulamaReddedildiGovde",
        ],
        cta: {
          labelKey: "api.notifications.common.belgeleriGuncelle",
          path: "/company/ayarlar/dogrulama",
        },
      });
    }
    return { ok: true };
  }

  /**
   * Belge bazlı inceleme: admin her belgeyi ayrı onaylar/reddeder. Reddedilen
   * belge(ler) varsa firma yalnız onları yeniden yükler; onaylananlar kilitli
   * kalır. Tüm zorunlu belgeler APPROVED ise firma VERIFIED; en az biri
   * REJECTED ise firma REJECTED.
   */
  async reviewDocuments(
    id: string,
    decisions: Partial<
      Record<
        DocKind,
        {
          status: "APPROVED" | "REJECTED";
          reason?: string;
          reasonCode?: VerificationReasonCode | null;
          key?: string;
        }
      >
    >,
    adminId: string,
  ) {
    const c = await this.prisma.company.findUnique({
      where: { id },
      select: {
        country: true,
        companyVerificationStatus: true,
        mersisNo: true,
        tradeRegistryNo: true,
        iban: true,
        ibanHolder: true,
        bankSwiftBic: true,
        bankName: true,
        docTaxPlateUrl: true,
        docTradeRegistryUrl: true,
        docSignatureCircularUrl: true,
        docActivityCertUrl: true,
        docIdFrontUrl: true,
        docIdBackUrl: true,
      },
    });
    if (!c) throw new NotFoundException(i18nMessage("api.adminCompanies.firmaBulunamadi"));
    const required = requiredKinds(c.country);
    // #3 sürüm sabitlemesi: istemci İNCELEDİĞİ nesnenin anahtarını gönderirse
    // ona, göndermezse şu an okuduğumuz değere sabitleriz. Böylece "ekranda
    // gördüğüm belge" ile "onayladığım belge" aynı nesne olmak zorunda.
    const reviewedKeys = Object.fromEntries(
      required.map((k) => [
        DOC_META[k].url,
        decisions[k]?.key ?? (c as Record<string, unknown>)[DOC_META[k].url],
      ]),
    );
    const data: Record<string, unknown> = {};
    let anyRejected = false;
    for (const k of required) {
      const uploaded = !!(c as Record<string, unknown>)[DOC_META[k].url];
      if (!uploaded) {
        throw new BadRequestException(i18nMessage("api.adminCompanies.eksikBelgeVarKararVerilemez", { k: k }));
      }
      const d = decisions[k];
      if (!d || (d.status !== "APPROVED" && d.status !== "REJECTED")) {
        throw new BadRequestException(i18nMessage("api.adminCompanies.herZorunluBelgeIcinKararGerekli", { k: k }));
      }
      if (d.status === "REJECTED") {
        // Kodlu gerekçe (2026-09-27): kod VEYA ≥3 karakterlik not.
        const reason = composeRejectReason(d.reason, d.reasonCode);
        if (!reason) {
          throw new BadRequestException(
            i18nMessage("api.adminCompanies.reddedilenBelgeyeGerekceGerekli", { k: k }),
          );
        }
        anyRejected = true;
        data[DOC_META[k].status] = "REJECTED" as KycDocStatus;
        data[DOC_META[k].reason] = reason;
      } else {
        data[DOC_META[k].status] = "APPROVED" as KycDocStatus;
        data[DOC_META[k].reason] = null;
      }
    }
    const status: CompanyVerificationStatus = anyRejected
      ? "REJECTED"
      : "VERIFIED";
    // Dalga B: belge kararları geçse bile kimlik alanları eksikse VERIFIED olmaz.
    if (status === "VERIFIED") this.assertKycIdentityComplete(c);
    const wasSame = c.companyVerificationStatus === status;
    // #3 + #4 (denetim 2026-08-26 Parça 9): CAS. `where` hem okuduğumuz genel
    // durumu hem de İNCELENEN BELGE ANAHTARLARINI sabitler — admin ekranı
    // açıkken firma belgeyi değiştirirse (REJECTED durumda yeniden yükleme
    // serbest) karar artık sessizce BAŞKA bir nesneyi onaylamaz, 409 döner.
    const done = await this.prisma.company.updateMany({
      where: {
        id,
        companyVerificationStatus: c.companyVerificationStatus,
        ...reviewedKeys,
      },
      data: {
        ...data,
        companyVerificationStatus: status,
        // Doğrulama tarihi yalnız gerçek geçişte yazılır (kararın tekrarı
        // geçmişi silmesin) — bkz. setVerification'daki kardeş kural.
        companyVerifiedAt:
          status === "VERIFIED" ? (wasSame ? undefined : new Date()) : null,
        // Belge bazlı gerekçe ayrı tutulur; genel özet alanı temizlenir.
        companyRejectionReason: null,
      },
    });
    if (done.count !== 1) {
      throw new ConflictException(
        i18nMessage("api.adminCompanies.belgelerVeyaDogrulamaDurumuAzOnce"),
      );
    }
    await this.audit.log({
      action: "admin.company.docs_reviewed",
      actorType: "admin",
      actorId: adminId ?? null,
      entityType: "company",
      entityId: id,
      // Hangi NESNENİN onaylandığı iz bırakır (sonradan ispatlanabilsin).
      metadata: {
        status,
        rejected: anyRejected,
        from: c.companyVerificationStatus,
        decisions: Object.fromEntries(
          required.map((k) => [k, decisions[k]?.status ?? null]),
        ),
        keys: Object.fromEntries(
          required.map((k) => [k, (c as Record<string, unknown>)[DOC_META[k].url] ?? null]),
        ),
      },
      // #10: KYC kapısını açan karar.
      critical: true,
    });
    if (wasSame && !anyRejected) return { ok: true, unchanged: true };
    if (status === "VERIFIED") {
      void this.notifyCompany(id, {
        type: "company_verification",
        subjectKey: "api.notifications.adminCompanies.dogrulamaOnaylandiBaslik",
        paragraphKeys: [
          "api.notifications.adminCompanies.dogrulamaOnaylandiGovde",
        ],
        cta: {
          labelKey: "api.notifications.common.hesabim",
          path: "/company/ayarlar/dogrulama",
        },
      });
    } else {
      void this.notifyCompany(id, {
        type: "company_verification",
        subjectKey: "api.notifications.adminCompanies.baziBelgelerReddedildiBaslik",
        paragraphKeys: [
          "api.notifications.adminCompanies.baziBelgelerReddedildiGovde",
        ],
        cta: {
          labelKey: "api.notifications.common.belgeleriGuncelle",
          path: "/company/ayarlar/dogrulama",
        },
      });
    }
    return { ok: true, status };
  }

  /**
   * Faz Y A-modeli — VERIFIED firmanın belge-güncelleme revizyonunu incele.
   * APPROVE: yeni key Company doc kolonuna kopyalanır (belge APPROVED kalır);
   * REJECT: revizyon gerekçeyle kapanır, ESKİ belge dokunulmadan geçerli kalır.
   * Her iki durumda firma statüsü DEĞİŞMEZ (VERIFIED kalır).
   */
  async reviewDocRevision(
    companyId: string,
    revisionId: string,
    decision: {
      status: "APPROVED" | "REJECTED";
      reason?: string;
      reasonCode?: VerificationReasonCode | null;
    },
    adminId: string,
  ) {
    if (decision.status !== "APPROVED" && decision.status !== "REJECTED") {
      throw new BadRequestException(i18nMessage("api.adminCompanies.gecersizKarar"));
    }
    const rev = await this.prisma.companyKycRevision.findUnique({
      where: { id: revisionId },
    });
    if (!rev || rev.companyId !== companyId) {
      throw new NotFoundException(i18nMessage("api.adminCompanies.revizyonBulunamadi"));
    }
    if (rev.status !== "PENDING") {
      throw new BadRequestException(i18nMessage("api.adminCompanies.yalnizcaBekleyenRevizyonIncelenebilir"));
    }
    if (!(rev.kind in DOC_META)) {
      throw new BadRequestException(i18nMessage("api.adminCompanies.gecersizBelgeTuru"));
    }
    const k = rev.kind as DocKind;
    // Kodlu gerekçe (2026-09-27): kod VEYA ≥3 karakterlik not.
    const reason =
      decision.status === "REJECTED"
        ? composeRejectReason(decision.reason, decision.reasonCode)
        : null;
    if (decision.status === "REJECTED" && !reason) {
      throw new BadRequestException(i18nMessage("api.adminCompanies.reddedilenRevizyonaGerekceGerekli"));
    }
    // #8 (denetim 2026-08-26 Parça 9): onayda kolon YENİ anahtarla eziliyor,
    // eski nesne hiçbir yerde saklanmıyor ve silinmiyordu → v1/v2 taramaları
    // (vergi no, imza, kimlik) private bucket'ta süresiz kalıyor ve KVKK
    // purge'ü yalnız GÜNCEL anahtarları topladığı için imhadan kurtuluyordu.
    // Eziyorsak eski anahtarı yakalayıp best-effort siliyoruz.
    let supersededKey: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      // CAS: eşzamanlı iki admin kararı — yalnız hâlâ PENDING olan güncellenir.
      const updated = await tx.companyKycRevision.updateMany({
        where: { id: revisionId, status: "PENDING" },
        data: {
          status: decision.status,
          reason: decision.status === "REJECTED" ? reason : null,
          reviewedByAdminId: adminId,
          reviewedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new BadRequestException(i18nMessage("api.adminCompanies.revizyonAzOnceKararaBaglandi"));
      }
      if (decision.status === "APPROVED") {
        // Gozden gecirme (MU-19): firma, bizim ilk okumamizla CAS arasinda
        // bekleyen revizyonun dosyasini degistirmis olabilir (eski nesne o
        // yolda silinir). CAS satiri kilitledigi icin burada okunan key
        // kesinlesmis olandir; bayat rev.key kolona yazilmaz.
        const fresh = await tx.companyKycRevision.findUniqueOrThrow({
          where: { id: revisionId },
          select: { key: true },
        });
        const prev = await tx.company.findUnique({
          where: { id: companyId },
          select: { [DOC_META[k].url]: true } as Record<string, true>,
        });
        const prevKey = (prev as Record<string, unknown> | null)?.[
          DOC_META[k].url
        ];
        if (typeof prevKey === "string" && prevKey && prevKey !== fresh.key) {
          supersededKey = prevKey;
        }
        await tx.company.update({
          where: { id: companyId },
          data: {
            [DOC_META[k].url]: fresh.key,
            [DOC_META[k].status]: "APPROVED" as KycDocStatus,
            [DOC_META[k].reason]: null,
          },
        });
      }
    });
    if (supersededKey) {
      await this.storage
        .deleteObject("private", supersededKey)
        .catch((err: unknown) =>
          this.logger.warn(
            `Eski KYC belgesi silinemedi (${companyId}/${k}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
    }
    await this.audit.log({
      action: "admin.company.doc_revision_reviewed",
      actorType: "admin",
      actorId: adminId ?? null,
      entityType: "company",
      entityId: companyId,
      metadata: { kind: k, status: decision.status },
    });
    if (decision.status === "APPROVED") {
      void this.notifyCompany(companyId, {
        type: "company_verification",
        subjectKey: "api.notifications.adminCompanies.belgeGuncellemesiOnaylandiBaslik",
        paragraphKeys: [
          "api.notifications.adminCompanies.belgeGuncellemesiOnaylandiGovde",
        ],
        cta: {
          labelKey: "api.notifications.common.belgelerim",
          path: "/company/ayarlar/dogrulama",
        },
      });
    } else {
      void this.notifyCompany(companyId, {
        type: "company_verification",
        subjectKey: "api.notifications.adminCompanies.belgeGuncellemesiReddedildiBaslik",
        paragraphKeys: [
          "api.notifications.adminCompanies.belgeGuncellemesiReddedildiGovde",
        ],
        cta: {
          labelKey: "api.notifications.common.belgelerim",
          path: "/company/ayarlar/dogrulama",
        },
      });
    }
    return { ok: true, status: decision.status };
  }

  /** PAKET ver / al. PAKET → membershipEndAt = now + months (varsayılan 12). */
  async setTier(
    id: string,
    tier: "STANDART" | "SILVER" | "GOLD",
    months?: number,
    adminId?: string,
    reason?: string,
  ) {
    const before = await this.prisma.company.findUnique({
      where: { id },
      select: { membershipEndAt: true, tier: true },
    });
    if (!before) throw new NotFoundException(i18nMessage("api.adminCompanies.firmaBulunamadi"));
    let membershipEndAt: Date | null = null;
    if (tier !== "STANDART") {
      // Takvim ayı (setMonth) — 30-gün çarpımı yılda ~5 gün drift ediyordu.
      const end = new Date();
      end.setMonth(end.getMonth() + (months ?? 12));
      membershipEndAt = end;
    }
    // #5 (denetim 2026-08-26 Parça 9): paket yazımı + geçmiş kaydı TEK
    // transaction'da ve okuduğumuz değere CAS'li — eşzamanlı iki admin
    // aksiyonunda biri sessizce kaybolmasın, olay tablosu ile kolon
    // birbirini tutsun (rapor "satılan ay" toplamı buradan besleniyor).
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.company.updateMany({
        where: {
          id,
          tier: before.tier,
          membershipEndAt: before.membershipEndAt,
        },
        data: { tier, membershipEndAt },
      });
      if (done.count !== 1) {
        throw new ConflictException(
          i18nMessage("api.adminCompanies.firmaninUyeligiAzOnceDegistiSayfayi"),
        );
      }
      // Üyelik geçmişi (append-only) — rapor + destek "premium'um nereye gitti".
      await tx.companyMembershipEvent.create({
        data: {
          companyId: id,
          action: tier !== "STANDART" ? "GRANT" : "REVOKE",
          months: tier !== "STANDART" ? (months ?? 12) : null,
          endBefore: before.membershipEndAt,
          endAfter: membershipEndAt,
          reason: reason?.trim() || null,
          adminId: adminId ?? null,
        },
      });
    });
    // Kademe GOLD'a çıktıysa kurucunun SATINALMA koltuğunu aç. Kayıtta
    // verilmiyor (STANDART'ta işe yaramıyor, ücretsiz paketin 2 koltuğundan
    // birini boşuna yakıyordu); tam da kullanılabilir olduğu anda açılıyor.
    // Transaction DIŞINDA ve fail-safe: paket yazımı bu yüzden geri alınmasın.
    await ensureOwnerBuySeat(this.prisma, id).catch((err) =>
      this.logger.warn(
        `Kurucu satınalma koltuğu açılamadı (${id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
    await this.audit.log({
      action: "admin.company.tier_set",
      actorType: "admin",
      actorId: adminId ?? null,
      entityType: "company",
      entityId: id,
      metadata: { tier, from: before.tier, months: months ?? 12 },
      // #10: para/yetki aksiyonu — audit yazımı düşerse alarm.
      critical: true,
    });
    // #6: elle REVOKE, otomatik süre-dolma yolunun (membership.scheduler)
    // temizliğini yapmıyordu. STANDART davet gönderemez; firmanın GÖNDERDİĞİ
    // bekleyen davetler kalırsa karşı taraf kabul ettiğinde `isConnectionValid`
    // bağlantıyı geçersiz sayar ("kabul ettim ama bağlantı yok" hayaleti).
    if (tier === "STANDART" && before.tier !== "STANDART") {
      await this.prisma.$transaction([
        this.prisma.companyConnection.deleteMany({
          where: { inviterCompanyId: id, status: "PENDING" },
        }),
        ...cancelOutgoingReferralInvites(this.prisma, [id]),
      ]);
      // Ücretsiz paket ürün tavanı (2026-09-06): tavanı aşan yayında ürünler
      // taslağa çekilir (silinmez) — üyelik cron'uyla aynı kural.
      const trimmed = await enforceProductLimit(this.prisma, id, "STANDART").catch(() => ({ unpublished: 0 }));
      const kirpildi = trimmed.unpublished > 0;
      void this.notifyCompany(id, {
        type: "membership_downgraded",
        subjectKey: "api.notifications.adminCompanies.paketSonlandirildiBaslik",
        // Çok paragraflı: in-app satırı birleşmiş metnin anahtarını taşır.
        bodyKey: kirpildi
          ? "api.notifications.adminCompanies.paketSonlandirildiGovdeKirpildi"
          : "api.notifications.adminCompanies.paketSonlandirildiGovde",
        paragraphKeys: [
          "api.notifications.adminCompanies.paketSonlandirildiAnaParagraf",
          kirpildi &&
            "api.notifications.adminCompanies.paketSonlandirildiKirpilanUrun",
          "api.notifications.adminCompanies.paketSonlandirildiDavetIptal",
        ],
        // Ürün tavanı metne SABİT yazılmaz (10 → 50 değişiminde metin bayat kalmıştı).
        params: { adet: trimmed.unpublished, limit: PRODUCT_LIMITS.STANDART ?? 0 },
      });
    } else if (tier !== "STANDART" && before.tier === "STANDART") {
      void this.notifyCompany(id, {
        type: "membership_granted",
        subjectKey: "api.notifications.adminCompanies.paketTanimlandiBaslik",
        paragraphKeys: [
          "api.notifications.adminCompanies.paketTanimlandiGovde",
        ],
        params: { paket: tier },
      });
    }
    return { ok: true, tier, membershipEndAt };
  }

  /**
   * Ek-süreli uzatma — mevcut bitişe AY EKLER (setTier'ın aksine bitişi
   * bugünden yeniden HESAPLAMAZ; müşterinin kalan süresi yanmaz). Bitiş
   * geçmişte kaldıysa bugünden itibaren eklenir.
   */
  async extendMembership(
    id: string,
    months: number,
    adminId: string,
    reason?: string,
  ) {
    const c = await this.prisma.company.findUnique({
      where: { id },
      select: { tier: true, membershipEndAt: true },
    });
    if (!c) throw new NotFoundException(i18nMessage("api.adminCompanies.firmaBulunamadi"));
    if (c.tier === "STANDART") {
      throw new BadRequestException(
        i18nMessage("api.adminCompanies.uzatmaYalnizPaketliUyelikteOnceBir"),
      );
    }
    // Dalga B-3: SÜRESİZ üyelik uzatılamaz. Eskiden `membershipEndAt === null`
    // dalında `base = now` alınıyordu → "12 ay uzat" süresiz bir üyeliği
    // 12 ay sonra BİTECEK hâle getiriyordu; uzatma işlemi üyeliği KISALTIYORDU
    // ve olay tablosunda EXTEND olarak görünüyordu.
    if (!c.membershipEndAt) {
      throw new BadRequestException(
        i18nMessage("api.adminCompanies.buFirmaninUyeligiSuresizUzatilamazSure"),
      );
    }
    const now = new Date();
    const base =
      c.membershipEndAt.getTime() > now.getTime()
        ? new Date(c.membershipEndAt)
        : now;
    const end = new Date(base);
    end.setMonth(end.getMonth() + months);
    // #5 (denetim 2026-08-26 Parça 9): eskiden oku-sonra-yaz idi — iki uzatma
    // aynı tabanı okuyunca biri KAYBOLUYOR, müşteri 24 ay ödeyip 12 alıyor
    // ama olay tablosunda iki EXTEND (24 ay) görünüyordu. CAS + tek tx.
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.company.updateMany({
        where: { id, membershipEndAt: c.membershipEndAt, tier: c.tier },
        data: { membershipEndAt: end },
      });
      if (done.count !== 1) {
        throw new ConflictException(
          i18nMessage("api.adminCompanies.firmaninUyeligiAzOnceDegistiSayfayi"),
        );
      }
      await tx.companyMembershipEvent.create({
        data: {
          companyId: id,
          action: "EXTEND",
          months,
          endBefore: c.membershipEndAt,
          endAfter: end,
          reason: reason?.trim() || null,
          adminId,
        },
      });
    });
    await this.audit.log({
      action: "admin.company.membership_extended",
      actorType: "admin",
      actorId: adminId,
      entityType: "company",
      entityId: id,
      metadata: { months },
      // #10: para aksiyonu.
      critical: true,
    });
    return { ok: true, membershipEndAt: end };
  }

  /** Firma üyelik geçmişi — en yeni önce (admin e-postaları eşlenmiş). */
  async membershipHistory(id: string) {
    await this.requireCompany(id);
    const events = await this.prisma.companyMembershipEvent.findMany({
      where: { companyId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const admins = await this.adminEmailMap(
      events.map((e) => e.adminId).filter((v): v is string => !!v),
    );
    return events.map((e) => ({
      id: e.id,
      action: e.action,
      months: e.months,
      endBefore: e.endBefore,
      endAfter: e.endAfter,
      reason: e.reason,
      adminEmail: e.adminId ? (admins.get(e.adminId) ?? null) : null,
      createdAt: e.createdAt,
    }));
  }

  /**
   * Üyelik satış/yenileme raporu — tarih aralığındaki tüm olaylar + toplamlar.
   * (Fiyatlandırma manuel takip edildiğinden "gelir" = verilen ay toplamı.)
   */
  async membershipReport(from?: string, to?: string) {
    const where: Record<string, unknown> = {};
    const createdAt: Record<string, Date> = {};
    // Dalga B: pencere `setHours` ile SUNUCU yerel saatinde kuruluyordu —
    // UTC sunucuda (Render) TR günü 3 saat kayıyor, "gün sonu" yanlış oluyordu.
    // Rapor TR kullanıcısına gösterildiği için sınırlar AÇIKÇA TR gününe göre
    // hesaplanır (Europe/Istanbul sabit +03, yaz saati uygulaması yok).
    const TR_OFFSET_MS = 3 * 3600_000;
    /** "YYYY-MM-DD" → o TR gününün başlangıcı (UTC anı). */
    const trDayStart = (day: string) =>
      new Date(new Date(`${day}T00:00:00.000Z`).getTime() - TR_OFFSET_MS);
    if (from) createdAt.gte = trDayStart(from);
    if (to) {
      // to = TR gününün SONU dahil (ertesi TR gününün başlangıcından 1 ms önce).
      createdAt.lte = new Date(trDayStart(to).getTime() + 86_400_000 - 1);
    }
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
    // #14 (denetim 2026-08-26 Parça 9): `take` sessiz kesiyordu ve TOPLAMLAR
    // kesilmiş satırlardan hesaplanıyordu — "satılan ay" (gelirin vekil
    // ölçüsü) 1000+ olaylı dönemlerde sessizce eksik çıkıyordu. Artık (a)
    // toplamlar TÜM eşleşen satırlardan DB'de agregatla hesaplanır, (b) liste
    // kesildiyse `truncated` bayrağı döner.
    const MAX_REPORT_EVENTS = 1000;
    const [events, totalMatching] = await Promise.all([
      this.prisma.companyMembershipEvent.findMany({
        where,
        include: { company: { select: { name: true, rothernId: true } } },
        orderBy: { createdAt: "desc" },
        take: MAX_REPORT_EVENTS,
      }),
      this.prisma.companyMembershipEvent.count({ where }),
    ]);
    const admins = await this.adminEmailMap(
      events.map((e) => e.adminId).filter((v): v is string => !!v),
    );
    const rows = events.map((e) => ({
      id: e.id,
      companyName: e.company.name,
      rothernId: e.company.rothernId,
      action: e.action,
      months: e.months,
      endAfter: e.endAfter,
      reason: e.reason,
      adminEmail: e.adminId ? (admins.get(e.adminId) ?? null) : null,
      createdAt: e.createdAt,
    }));
    // Toplamlar EVRENİN TAMAMINDAN (listenin tavanından bağımsız) gelir.
    const byAction = await this.prisma.companyMembershipEvent.groupBy({
      where,
      by: ["action"],
      _count: { _all: true },
      _sum: { months: true },
    });
    const cnt = (a: string) =>
      byAction.find((g) => g.action === a)?._count._all ?? 0;
    const sum = (a: string) =>
      byAction.find((g) => g.action === a)?._sum.months ?? 0;
    const totals = {
      grants: cnt("GRANT"),
      extends: cnt("EXTEND"),
      revokes: cnt("REVOKE"),
      expires: cnt("EXPIRE"),
      /** Satılan toplam ay (GRANT+EXTEND) — gelirin vekil ölçüsü. */
      monthsGranted: sum("GRANT") + sum("EXTEND"),
    };
    return {
      rows,
      totals,
      // Liste kesildiyse ekran bunu SÖYLEMELİ (sessiz kesme yasak).
      truncated: totalMatching > rows.length,
      totalMatching,
    };
  }

  /** PlatformAdmin id → e-posta eşlemesi (rapor/geçmiş gösterimi). */
  private async adminEmailMap(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const admins = await this.prisma.platformAdmin.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, email: true },
    });
    return new Map(admins.map((a) => [a.id, a.email]));
  }

  async suspend(id: string, reason: string, adminId?: string) {
    await this.requireCompany(id);
    const blockedReason = reason?.trim() || "Yönetici tarafından askıya alındı";
    await this.prisma.company.update({
      where: { id },
      data: { isBlocked: true, blockedReason, blockedAt: new Date() },
    });
    this.seo?.companyChanged(id);
    await this.audit.log({
      action: "admin.company.suspended",
      actorType: "admin",
      actorId: adminId ?? null,
      entityType: "company",
      entityId: id,
      metadata: { reason: blockedReason },
      // #10: firmayı platformdan koparan aksiyon — izsiz kalmamalı.
      critical: true,
    });
    // #17: askı eskiden SESSİZDİ — firma bir sonraki isteğinde her yerden
    // kapıda duruyor (company-jwt.strategy `isBlocked`) ama nedenini
    // bilmiyordu. Diğer tüm müdahaleler (ilan kapatma/uzatma, sipariş iptali)
    // firmayı bilgilendiriyor; simetriyi kuruyoruz.
    void this.notifyCompany(id, {
      type: "admin_company_suspended",
      subjectKey: "api.notifications.adminCompanies.askiyaAlindiBaslik",
      // İki paragraf → in-app satırı birleşmiş metni taşır.
      bodyKey: "api.notifications.adminCompanies.askiyaAlindiGovde",
      paragraphKeys: [
        "api.notifications.adminCompanies.askiyaAlindiGerekce",
        "api.notifications.adminCompanies.askiyaAlindiItiraz",
      ],
      params: { gerekce: blockedReason },
    });
    return { ok: true };
  }

  async unsuspend(id: string, adminId?: string) {
    await this.requireCompany(id);
    await this.prisma.company.update({
      where: { id },
      data: { isBlocked: false, blockedReason: null, blockedAt: null },
    });
    this.seo?.companyChanged(id);
    await this.audit.log({
      action: "admin.company.unsuspended",
      actorType: "admin",
      actorId: adminId ?? null,
      entityType: "company",
      entityId: id,
      critical: true,
    });
    // #17 simetrisi: askının kalktığı da bildirilir.
    void this.notifyCompany(id, {
      type: "admin_company_unsuspended",
      subjectKey: "api.notifications.adminCompanies.askiKaldirildiBaslik",
      paragraphKeys: [
        "api.notifications.adminCompanies.askiKaldirildiGovde",
      ],
    });
    return { ok: true };
  }

  async listComplaints(
    status?: string,
    companyId?: string,
    q?: string,
    page?: number,
    pageSize?: number,
  ) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status as ComplaintStatus;
    // Firma detay "Şikayetler" sekmesi: hem hakkında hem şikayet eden olarak.
    if (companyId) {
      where.OR = [
        { againstCompanyId: companyId },
        { complainantCompanyId: companyId },
      ];
    }
    if (q?.trim()) {
      const term = q.trim();
      where.AND = [
        {
          OR: [
            { reason: { contains: term, mode: "insensitive" } },
            { detail: { contains: term, mode: "insensitive" } },
            { against: { name: { contains: term, mode: "insensitive" } } },
            { complainant: { name: { contains: term, mode: "insensitive" } } },
          ],
        },
      ];
    }
    const p = Math.max(1, page ?? 1);
    const ps = Math.min(100, Math.max(1, pageSize ?? 25));
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.companyComplaint.count({ where }),
      this.prisma.companyComplaint.findMany({
        where,
        include: {
          complainant: { select: { id: true, name: true, rothernId: true } },
          against: { select: { id: true, name: true, rothernId: true } },
        },
        // P12: tek alanlı sıralama eşit damgalarda sayfalar arası kayma
        // üretir (aynı satır iki sayfada / hiç görünmez) → id ile tie-break.
        orderBy: [{ status: "asc" }, { createdAt: "desc" }, { id: "desc" }],
        skip: (p - 1) * ps,
        take: ps,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        complainant: r.complainant,
        against: r.against,
        reason: r.reason,
        detail: r.detail,
        status: r.status,
        adminNote: r.adminNote,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
      })),
      total,
      page: p,
      pageSize: ps,
    };
  }

  // ── DAHİLİ NOTLAR (Faz 6) — müşteri asla görmez ─────────────

  async listNotes(companyId: string) {
    await this.requireCompany(companyId);
    const notes = await this.prisma.companyAdminNote.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const admins = await this.adminEmailMap(notes.map((n) => n.adminId));
    return notes.map((n) => ({
      id: n.id,
      body: n.body,
      adminEmail: admins.get(n.adminId) ?? null,
      createdAt: n.createdAt,
    }));
  }

  async addNote(companyId: string, body: string, adminId: string) {
    await this.requireCompany(companyId);
    const trimmed = body.trim();
    if (trimmed.length < 3) {
      throw new BadRequestException(i18nMessage("api.adminCompanies.notEnAz3KarakterOlmali"));
    }
    const note = await this.prisma.companyAdminNote.create({
      data: { companyId, adminId, body: trimmed },
    });
    await this.audit.log({
      action: "admin.company.note_added",
      actorType: "admin",
      actorId: adminId,
      entityType: "company",
      entityId: companyId,
    });
    return { ok: true, id: note.id };
  }

  async deleteNote(noteId: string, adminId: string) {
    const done = await this.prisma.companyAdminNote.deleteMany({
      where: { id: noteId },
    });
    if (done.count !== 1) throw new NotFoundException(i18nMessage("api.adminCompanies.notBulunamadi"));
    await this.audit.log({
      action: "admin.company.note_deleted",
      actorType: "admin",
      actorId: adminId,
      entityType: "company_note",
      entityId: noteId,
    });
    return { ok: true };
  }

  // ── GLOBAL ARAMA (Faz 6) — tek kutu: firma + kullanıcı ─────

  async globalSearch(qRaw: string) {
    const q = qRaw.trim();
    if (q.length < 2) return { companies: [], users: [] };
    const [companies, users] = await Promise.all([
      this.prisma.company.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { legalName: { contains: q, mode: "insensitive" } },
            { rothernId: { contains: q.toUpperCase() } },
            { taxNumber: { contains: q } },
          ],
        },
        select: {
          id: true,
          name: true,
          rothernId: true,
          country: true,
          tier: true,
          isBlocked: true,
        },
        take: 8,
      }),
      this.prisma.companyUser.findMany({
        where: {
          email: { contains: q, mode: "insensitive" },
          deletedAt: null,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          companyId: true,
          company: { select: { name: true } },
        },
        take: 5,
      }),
    ]);
    return {
      companies,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: `${u.firstName} ${u.lastName}`.trim(),
        companyId: u.companyId,
        companyName: u.company.name,
      })),
    };
  }

  // ── BİLDİRİM + DUYURU (Faz 6) ───────────────────────────────

  /** Tek firmaya panelden bildirim/e-posta — "aradı, bilgi verdik" akışı. */
  async sendNotification(
    companyId: string,
    subject: string,
    message: string,
    adminId: string,
  ) {
    await this.requireCompany(companyId);
    // Admin'in KENDİ yazdığı metin: katalog anahtarı yok, çevrilmez.
    await this.notifyCompany(companyId, {
      type: "admin_message",
      subject: subject.trim(),
      body: message.trim(),
      paragraphs: [message.trim()],
    });
    await this.audit.log({
      action: "admin.company.notified",
      actorType: "admin",
      actorId: adminId,
      entityType: "company",
      entityId: companyId,
      metadata: { subject },
    });
    return { ok: true };
  }

  /**
   * Segment duyurusu — tüm firmalara veya filtreye (tier/ülke) uyanlara
   * in-app bildirim (+ opsiyonel e-posta). Best-effort: tek firmadaki hata
   * kalanları durdurmaz.
   */
  async announce(
    input: {
      subject: string;
      message: string;
      tier?: "STANDART" | "SILVER" | "GOLD";
      country?: string;
      sendEmail?: boolean;
      /**
       * Dalga B: GÖNDERMEDEN hedef sayısını döndür. Onay ekranındaki tahmin
       * `stats` kırılımından geliyordu ve gerçek hedefle uyuşmuyordu (gönderim
       * `isActive`/`isBlocked` süzüyor, stats süzmüyor) → "1.000 firmaya
       * gidecek" deyip daha azına gidiyordu.
       */
      dryRun?: boolean;
    },
    adminId: string,
  ) {
    const where: Record<string, unknown> = { isActive: true, isBlocked: false };
    if (input.tier) where.tier = input.tier;
    if (input.country) where.country = input.country.trim().toUpperCase();
    if (input.dryRun) {
      const exact = await this.prisma.company.count({ where });
      return {
        ok: true,
        dryRun: true as const,
        targets: Math.min(exact, ANNOUNCE_MAX_TARGETS),
        delivered: 0,
        truncated: exact > ANNOUNCE_MAX_TARGETS,
      };
    }
    // Perf (1000 firma): e-posta hedef alanları TEK sorguda çekilir (eski per-
    // firma notifyCompany.findUnique N+1'i kalktı); gönderim SERİ değil, sınırlı
    // paralel chunk'larda (5000 seri await → istek timeout riski kalktı).
    const targets = (await this.prisma.company.findMany({
      where,
      select: {
        id: true,
        ...(input.sendEmail
          ? {
              name: true,
              billingEmail: true,
              users: {
                where: { isActive: true, deletedAt: null },
                // #15: alıcının duyuru tercihi (opt-out) okunur.
                select: {
                  email: true,
                  firstName: true,
                  lastName: true,
                  notificationPrefs: true,
                  // E-posta kabuğunun/CTA'sının dili (notifyCompanyEmail).
                  locale: true,
                },
                orderBy: { createdAt: "asc" },
                take: 1,
              },
            }
          : {}),
      },
      // Dalga B: sessiz tavan yasak — kesildiyse yanıt bunu SÖYLER.
      take: ANNOUNCE_MAX_TARGETS + 1,
    })) as {
      id: string;
      name: string;
      billingEmail: string | null;
      users: {
        email: string;
        firstName: string;
        lastName: string;
        notificationPrefs?: unknown;
        locale?: string | null;
      }[];
    }[];
    const truncated = targets.length > ANNOUNCE_MAX_TARGETS;
    if (truncated) targets.length = ANNOUNCE_MAX_TARGETS;
    const subject = input.subject.trim();
    const message = input.message.trim();
    const pushPayload = {
      type: "admin_announcement",
      // Yetki tablosu: duyuru yönetim ve koltuk sahiplerine; onaylayıcı-only
      // üye yalnız onay bildirimi alır (kullanıcı kararı 2026-09-05).
      audience: ["users:manage", "company:manage", ...ALL_SEAT_PERMISSIONS],
      // Duyuru metni admin'in KENDİ yazdığı serbest metindir → çevrilmez.
      // Yalnız CTA etiketi katalogdan (alıcının dilinde) gelir.
      title: subject,
      body: message,
      ctaLabelKey: DEFAULT_CTA_KEY,
      ctaPath: `${resolveWebUrl(this.config)}/company`,
    };
    const CHUNK = 25;
    let delivered = 0;
    // E-POSTA (derin denetim Y-08/X18): eskiden `void email.send` ile 5000'e
    // kadar gönderim aynı anda uçuyor, Resend 429'unda FAILED kalıyor ve DB
    // havuzunu tüketiyordu. Artık her gönderim EmailService kuyruğundan
    // (`bulk` öncelik, saniyelik hız + sınırlı eşzamanlılık + 429 yeniden
    // deneme) geçer. İstek e-postaları BEKLEMEZ — hesabın saniyelik limitiyle
    // 1000 e-posta dakikalar sürer, HTTP isteği zaman aşımına düşerdi; sonuç
    // sayıları bitince ayrı audit satırına yazılır.
    const emailJobs: Promise<"sent" | "skipped" | "failed">[] = [];
    for (let i = 0; i < targets.length; i += CHUNK) {
      const results = await Promise.allSettled(
        targets.slice(i, i + CHUNK).map(async (t) => {
          if (input.sendEmail) {
            // notifyCompany paritesi: in-app push (swallow) + prefetch'li e-posta.
            await this.notifications
              .pushToCompany(t.id, pushPayload)
              .catch((err) =>
                this.logger.warn(
                  `Admin bildirimi yazılamadı (${t.id}): ${
                    err instanceof Error ? err.message : String(err)
                  }`,
                ),
              );
            // #15 (denetim 2026-08-26 Parça 9): duyuru artık kapatılabilir
            // bir bildirim tipi (`admin_announcement` → `announcement`).
            // Alıcı kullanıcının tercihine saygı gösterilir. NOT: firma
            // `billingEmail`'ine giden kol tercihsizdir — bu, Parça 7'de
            // yazılı karara bağlanmış mimari (fatura adresi kurumsaldır).
            const prefUser = t.users[0];
            const emailAllowed =
              !prefUser ||
              !!t.billingEmail ||
              isNotificationEnabled(
                prefUser.notificationPrefs as Record<string, boolean> | null,
                "admin_announcement",
              );
            if (emailAllowed) {
              emailJobs.push(
                this.notifyCompanyEmail(
                  t,
                  {
                    type: "admin_announcement",
                    subject,
                    body: message,
                    paragraphs: [message],
                  },
                  { priority: "bulk" },
                ),
              );
            }
          } else {
            await this.notifications.pushToCompany(t.id, pushPayload);
          }
        }),
      );
      for (const r of results) {
        if (r.status === "fulfilled") delivered++;
        else
          this.logger.warn(
            `Duyuru gönderilemedi: ${
              r.reason instanceof Error ? r.reason.message : String(r.reason)
            }`,
          );
      }
    }
    await this.audit.log({
      action: "admin.announcement.sent",
      actorType: "admin",
      actorId: adminId,
      entityType: "announcement",
      entityId: null,
      metadata: {
        subject: input.subject,
        tier: input.tier ?? "all",
        country: input.country ?? "all",
        email: !!input.sendEmail,
        targets: targets.length,
        delivered,
        truncated,
        ...(input.sendEmail ? { emailQueued: emailJobs.length } : {}),
      },
    });
    if (emailJobs.length > 0) {
      void this.recordAnnouncementEmailResult(emailJobs, {
        adminId,
        subject: input.subject,
      });
    }
    return {
      ok: true,
      targets: targets.length,
      delivered,
      truncated,
      ...(input.sendEmail ? { emailQueued: emailJobs.length } : {}),
    };
  }

  /**
   * Duyuru e-postaları kuyrukta bitince gerçek sonucu audit'e yazar
   * (`delivered` yalnız in-app push'u sayar; e-posta kaybı görünmüyordu).
   * Fail-safe: audit hatası yalnız loglanır.
   */
  private async recordAnnouncementEmailResult(
    jobs: Promise<"sent" | "skipped" | "failed">[],
    meta: { adminId: string; subject: string },
  ): Promise<{ sent: number; skipped: number; failed: number }> {
    const results = await Promise.all(jobs);
    const counts = { sent: 0, skipped: 0, failed: 0 };
    for (const r of results) counts[r]++;
    if (counts.failed > 0) {
      this.logger.warn(
        `Announcement emails: ${counts.sent} sent, ${counts.failed} failed, ${counts.skipped} skipped`,
      );
    }
    try {
      await this.audit.log({
        action: "admin.announcement.email_completed",
        actorType: "admin",
        actorId: meta.adminId,
        entityType: "announcement",
        entityId: null,
        metadata: { subject: meta.subject, ...counts },
      });
    } catch (err) {
      this.logger.warn(
        `Announcement email result could not be written to audit: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return counts;
  }

  async resolveComplaint(
    id: string,
    input: {
      status: "RESOLVED" | "DISMISSED";
      adminNote?: string;
      /**
       * Firmayı askıya al. DİKKAT: askıya alma `POST companies/:id/suspend`
       * ucunda SUPER_ADMIN'e kilitlidir; bu bayrak o kapıyı DOLANMAMALIDIR
       * (denetim 2026-08-26 Parça 10 #2) — bu yüzden `actorRole` şart.
       */
      suspend?: boolean;
      suspendReason?: string;
    },
    adminId: string,
    actorRole?: string,
  ) {
    // #2: `suspend` bayrağı, SUPER_ADMIN'e kilitli askıya alma yetkisini
    // SALES'e açan bir yan kapıydı (üstelik `unsuspend` SUPER-only olduğu için
    // SALES yaptığını GERİ ALAMIYORDU). Kapı burada, yan etkinin yanında.
    if (input.suspend && actorRole !== "SUPER_ADMIN") {
      throw new ForbiddenException(
        i18nMessage("api.adminCompanies.firmaAskiyaAlmaYetkisiYalnizSuper"),
      );
    }
    const c = await this.prisma.companyComplaint.findUnique({
      where: { id },
      select: { id: true, againstCompanyId: true, status: true },
    });
    if (!c) throw new NotFoundException(i18nMessage("api.adminCompanies.sikayetBulunamadi"));
    if (c.status !== "OPEN") {
      throw new BadRequestException(i18nMessage("api.adminCompanies.buSikayetZatenSonuclanmis"));
    }
    // Atomik CAS: yalnız hâlâ OPEN ise sonuçlandır — tekrar-resolve / eşzamanlı
    // ikinci karar tekrar suspend/üzerine yazma yapamaz.
    const resolved = await this.prisma.companyComplaint.updateMany({
      where: { id, status: "OPEN" },
      data: {
        status: input.status as ComplaintStatus,
        adminNote: input.adminNote?.trim() || null,
        resolvedAt: new Date(),
        resolvedByAdminId: adminId,
      },
    });
    if (resolved.count === 0) {
      throw new BadRequestException(i18nMessage("api.adminCompanies.buSikayetZatenSonuclanmis"));
    }
    await this.audit.log({
      action: "admin.complaint.resolved",
      actorType: "admin",
      actorId: adminId ?? null,
      entityType: "complaint",
      entityId: id,
      metadata: { status: input.status, suspend: !!input.suspend },
    });
    if (input.suspend) {
      // `adminNote` IC nottur (sikayetciye bile gosterilmez; icinde sikayetci
      // firmanin adi olabilir) — askiya alinan firmaya giden gerekceye DUSMEZ.
      // Firmaya yalniz acikca "firmaya iletilir" diye sorulan `suspendReason`
      // gider (derin denetim MU-02).
      const suspendReason = input.suspendReason?.trim() || null;
      // blockedReason yalniz admin panelinde gorunen TR ic kayittir; firmaya
      // giden bildirimde gerekce yoksa sabit metin DEGIL alicinin dilinde
      // cozulen katalog anahtari kullanilir (EN/RU sablona TR metin girmesin).
      const blockedReason = suspendReason ?? "Şikayet üzerine askıya alındı";
      await this.prisma.company.update({
        where: { id: c.againstCompanyId },
        data: {
          isBlocked: true,
          blockedReason,
          blockedAt: new Date(),
        },
      });
      // suspend() ile ayni: herkese acik profil/urun/sitemap onbellegi tazelenir.
      this.seo?.companyChanged(c.againstCompanyId);
      await this.audit.log({
        action: "admin.company.suspended",
        actorType: "admin",
        actorId: adminId ?? null,
        entityType: "company",
        entityId: c.againstCompanyId,
        metadata: { via: "complaint", complaintId: id },
        critical: true,
      });
      // #17: şikayet üzerinden askıya alma da sessiz kalmasın (suspend()
      // ile aynı bildirim; iki yolun tek davranışı olmalı).
      void this.notifyCompany(c.againstCompanyId, {
        type: "admin_company_suspended",
        subjectKey: "api.notifications.adminCompanies.askiyaAlindiBaslik",
        // İki paragraf → in-app satırı birleşmiş metni taşır.
        ...(suspendReason
          ? {
              bodyKey: "api.notifications.adminCompanies.askiyaAlindiGovde",
              paragraphKeys: [
                "api.notifications.adminCompanies.askiyaAlindiGerekce",
                "api.notifications.adminCompanies.askiyaAlindiItiraz",
              ],
              params: { gerekce: suspendReason },
            }
          : {
              bodyKey: "api.notifications.adminCompanies.sikayetUzerineAskiyaAlindiGovde",
              paragraphKeys: [
                "api.notifications.adminCompanies.sikayetUzerineAskiyaAlindiGerekce",
                "api.notifications.adminCompanies.askiyaAlindiItiraz",
              ],
            }),
      });
    }
    return { ok: true };
  }

  // ── KVKK (Faz 9) — veri export + silme/anonimleştirme ──────

  /**
   * KVKK erişim hakkı — firmanın platformdaki TÜM verisi tek JSON.
   * Dönüş gevşek tip: içerik sözleşmesi "her şey" (Prisma include ağacı).
   */
  async exportData(
    id: string,
    actor?: { id: string; email?: string | null },
  ): Promise<Record<string, unknown>> {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException(i18nMessage("api.adminCompanies.firmaBulunamadi"));
    // Perf (aktif/büyük firmada OOM): eski tek-sorgu 14-relation include ağacı
    // her relation'ı SINIRSIZ belleğe yüklüyordu. Prisma FLUENT relation API'siyle
    // her relation cursor-batch'lenir (include şekli AYNI, TÜM satırlar korunur —
    // KVKK "her şey" sözleşmesi bozulmaz; fark yalnız çekme stratejisi).
    const root = () => this.prisma.company.findUnique({ where: { id } });
    const [
      users,
      listings,
      bidsPlaced,
      ordersAsBuyer,
      ordersAsSeller,
      connectionsInitiated,
      connectionsReceived,
      referralInvitesSent,
      complaintsMade,
      complaintsReceived,
      membershipEvents,
      adminNotes,
      addresses,
      bankAccounts,
    ] = await Promise.all([
      // KVKK dökümü veri ÖZNESİNE iletilir → kimlik-doğrulama iç durumu
      // (TOTP sırrı/kurtarma kodu hash'leri, authId, tokenVersion) ve yetki
      // override'ı KAPSAM DIŞI: bunlar öznenin kişisel verisi değil, hesap
      // güvenliği iç durumudur (denetim 2026-08-23 Parça 4).
      this.pageRelation((a) =>
        root().users({
          ...a,
          omit: {
            twoFactorSecret: true,
            twoFactorRecoveryCodes: true,
            authId: true,
            tokenVersion: true,
            // 2FA deneme freni sayaclari (derin denetim MU-16): hesap
            // guvenligi ic durumu, dokum kapsami disinda.
            twoFactorFailedAttempts: true,
            twoFactorWindowStartedAt: true,
            twoFactorLastTotpStep: true,
          },
        }),
      ),
      this.pageRelation((a) =>
        root().listings({ ...a, include: { items: true, invitations: true } }),
      ),
      this.pageRelation((a) =>
        root().bidsPlaced({ ...a, include: { items: true } }),
      ),
      this.pageRelation((a) =>
        root().ordersAsBuyer({ ...a, include: { items: true, payments: true } }),
      ),
      this.pageRelation((a) =>
        root().ordersAsSeller({
          ...a,
          include: { items: true, payments: true },
        }),
      ),
      this.pageRelation((a) => root().connectionsInitiated(a)),
      this.pageRelation((a) => root().connectionsReceived(a)),
      this.pageRelation((a) => root().referralInvitesSent(a)),
      // Sikayetler (derin denetim MU-02): urun sikayet edilen firmaya
      // sikayetci kimligini hic gostermez — dokum de gostermez. Hakkindaki
      // sikayetlerde yalniz konu/durum/tarih; sikayetci firma/kullanici,
      // detay metni (sikayetcinin yazdigi), ic admin notu ve karar veren admin
      // YOK. Kendi actiklarinda da ic not ve admin kimligi yok (listMine gibi).
      this.pageRelation((a) =>
        root().complaintsMade({
          ...a,
          omit: { adminNote: true, resolvedByAdminId: true },
        }),
      ),
      this.pageRelation((a) =>
        root().complaintsReceived({
          ...a,
          select: {
            id: true,
            reason: true,
            status: true,
            createdAt: true,
            resolvedAt: true,
          },
        }),
      ),
      this.pageRelation((a) => root().membershipEvents(a)),
      this.pageRelation((a) => root().adminNotes(a)),
      this.pageRelation((a) => root().addresses(a)),
      this.pageRelation((a) => root().bankAccounts(a)),
    ]);
    // INV-AUDIT-1: KVKK dökümü hassas ve toplu bir okuma — kardeş uç
    // (deleteOrAnonymize) audit'liyken bu uç izsizdi (denetim 2026-08-23
    // Parça 4). Metadata'ya ham PII (IBAN/vergi no) YAZILMAZ, yalnız kapsam.
    if (actor) {
      await this.audit.log({
        action: "admin.company.exported",
        actorType: "admin",
        actorId: actor.id,
        actorEmail: actor.email ?? undefined,
        entityType: "company",
        entityId: id,
        critical: true,
        metadata: {
          rothernId: company.rothernId,
          rowCounts: {
            users: users.length,
            listings: listings.length,
            bidsPlaced: bidsPlaced.length,
            ordersAsBuyer: ordersAsBuyer.length,
            ordersAsSeller: ordersAsSeller.length,
            bankAccounts: bankAccounts.length,
            adminNotes: adminNotes.length,
          },
        },
      });
    }
    return {
      exportedAt: new Date().toISOString(),
      company: {
        ...company,
        users,
        listings,
        bidsPlaced,
        ordersAsBuyer,
        ordersAsSeller,
        connectionsInitiated,
        connectionsReceived,
        referralInvitesSent,
        complaintsMade,
        complaintsReceived,
        membershipEvents,
        addresses,
        bankAccounts,
      },
      // İç admin notları döküme KONMAZ (öznenin verisi değil, platformun iç
      // değerlendirmesi) — sayısı hesap-verebilirlik için audit'e yazılır.
    };
  }

  /**
   * Bir relation'ı `id` cursor'la batch batch çekip tümünü döndürür — tek dev
   * sorgu yerine ≤`batch` satırlık pencereler (peak bellek sınırlı). Fluent
   * relation query fonksiyonu alır (FK adı bilmeye gerek yok).
   */
  private async pageRelation<T extends { id: string }>(
    query: (args: {
      take: number;
      skip?: number;
      cursor?: { id: string };
    }) => Promise<T[] | null>,
    batch = 500,
  ): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | undefined;
    for (;;) {
      const rows =
        (await query({
          take: batch,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        })) ?? [];
      all.push(...rows);
      if (rows.length < batch) break;
      cursor = rows[rows.length - 1]!.id;
    }
    return all;
  }

  /**
   * KVKK silme hakkı — iki yol:
   *  - Siparişi YOKSA: hard delete (cascade; Supabase auth hesapları da silinir).
   *  - Siparişi VARSA: finansal kayıt korunmalı (Order FK RESTRICT) →
   *    ANONİMLEŞTİRME: kimlik/PII alanları temizlenir, kullanıcılar soft-delete
   *    + e-postaları karartılır + oturumları düşer, hesap pasifleşir.
   * Güvence: FE iki-adım onay (rothernId yazdırılır); yalnız SUPER_ADMIN.
   */

  /**
   * KVKK imhası — firmaya ait R2 nesnelerini siler (private KYC belgeleri +
   * public profil görselleri + KYC revizyon anahtarları). Best-effort:
   * silinemeyen nesne akışı durdurmaz, uyarı olarak loglanır (bucket
   * object-lock politikası DeleteObject'i reddedebilir).
   */
  private async purgeCompanyObjects(company: {
    id: string;
    docTaxPlateUrl: string | null;
    docTradeRegistryUrl: string | null;
    docSignatureCircularUrl: string | null;
    docActivityCertUrl: string | null;
    docIdFrontUrl: string | null;
    docIdBackUrl: string | null;
    logoUrl: string | null;
    coverImageUrl: string | null;
    photos: string[];
    certificateImages: string[];
    kycRevisions: { key: string | null }[];
  }): Promise<void> {
    const privateKeys = [
      company.docTaxPlateUrl,
      company.docTradeRegistryUrl,
      company.docSignatureCircularUrl,
      company.docActivityCertUrl,
      company.docIdFrontUrl,
      company.docIdBackUrl,
      ...company.kycRevisions.map((r) => r.key),
    ].filter((k): k is string => !!k);
    // Public görseller URL olarak saklanır; anahtar = public taban sonrası yol.
    const publicKeys = [
      company.logoUrl,
      company.coverImageUrl,
      ...(company.photos ?? []),
      ...(company.certificateImages ?? []),
    ]
      .filter((u): u is string => !!u)
      .map((u) => this.storage.publicUrlToKey(u))
      .filter((k): k is string => !!k);

    let failed = 0;
    for (const key of privateKeys) {
      await this.storage.deleteObject("private", key).catch(() => {
        failed++;
      });
    }
    for (const key of publicKeys) {
      await this.storage.deleteObject("public", key).catch(() => {
        failed++;
      });
    }
    if (failed > 0) {
      this.logger.warn(
        `KVKK imhası: ${failed} nesne silinemedi (firma ${company.id}) — bucket politikası/erişim kontrol edilmeli`,
      );
    }
  }

  async deleteOrAnonymize(
    id: string,
    adminId: string,
    supabaseDeleteUser: (authId: string) => Promise<void>,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        rothernId: true,
        // SEO tazelemesi için (sert silmeden sonra satır okunamaz).
        slug: true,
        cityId: true,
        country: true,
        users: { select: { id: true, authId: true } },
        // Dalga A2 (denetim P12 #1/#2): SERT SİLME kapısı eskiden YALNIZ
        // siparişe bakıyordu. Sipariş FK'ları `Restrict` (doğru), ama iki
        // taraflı DİĞER tabloların hepsi `Cascade` — yani 0 siparişli ama
        // 40 aktif teklifli bir tedarikçi silinince ALICININ ihale dosyası
        // geriye dönük değişiyordu: teklifler, teklif belgeleri (R2
        // anahtarlarıyla), soru cevapları, karşılıklı mesaj geçmişi, o
        // firmanın BAŞKA firmalara verdiği değerlendirmeler ve hakkında/
        // tarafından açılmış şikâyetler siliniyordu. 3 teklifli bir ihale
        // 2 teklifli görünüyordu ve bunu fark etmenin yolu yoktu.
        //
        // Kural artık: KARŞI TARAFIN kaydını ya da platformun defterini
        // etkileyen HERHANGİ bir iz varsa sert silme YAPILMAZ —
        // anonimleştirme dalına düşer (o dal zaten var ve KVKK'yı karşılar).
        // Şemadaki cascade'leri `Restrict`'e çevirmek ayrıca yapılmalı
        // (savunma derinliği), ama canlı riski kapatan kapı BURASI.
        _count: {
          select: {
            ordersAsBuyer: true,
            ordersAsSeller: true,
            bidsPlaced: true,
            listings: true,
            messagesSent: true,
            reviewsGiven: true,
            reviewsReceived: true,
            complaintsMade: true,
            complaintsReceived: true,
            membershipEvents: true,
            // Derin denetim MU-03 (S010/X18): karsi tarafin yazdigi ama bu
            // firmanin hic yanitlamadigi thread'ler (messagesSent=0), baska
            // firmalarin taleplerindeki davet kayitlari ve kayitli alicilarin
            // bu firmanin urunlerine actigi bilgi talepleri de Company'ye
            // `onDelete: Cascade` bagli — sert silme karsi tarafin gelen
            // kutusunu / davetli listesini / "Bilgi taleplerim"ini siliyordu.
            threadsAsBuyer: true,
            threadsAsSeller: true,
            listingInvitations: true,
            // Anonim ziyaretci talebi (claimedCompanyId yok) platformda kimsenin
            // kaydi degil; yalniz kayitli aliciya baglananlar tutar.
            publicInquiries: { where: { claimedCompanyId: { not: null } } },
          },
        },
        // KVKK imhası için nesne anahtarları (aşağıda R2'dan silinir).
        docTaxPlateUrl: true,
        docTradeRegistryUrl: true,
        docSignatureCircularUrl: true,
        docActivityCertUrl: true,
        docIdFrontUrl: true,
        docIdBackUrl: true,
        logoUrl: true,
        coverImageUrl: true,
        photos: true,
        certificateImages: true,
        kycRevisions: { select: { key: true } },
      },
    });
    if (!company) throw new NotFoundException(i18nMessage("api.adminCompanies.firmaBulunamadi"));
    const c = company._count;
    /**
     * Sert silmeyi engelleyen izler. Her biri ya KARŞI TARAFIN kaydını
     * (teklif/mesaj/değerlendirme/şikâyet) ya da platformun defterini
     * (üyelik olayları = gelir raporunun tek kaynağı) taşır.
     * `listings`: bu firmanın ilanları silinince ONA TEKLİF VERMİŞ firmaların
     * teklif geçmişi de gider — kendi ilanı olsa bile tek taraflı değil.
     */
    const retentionCounts = {
      ordersAsBuyer: c.ordersAsBuyer,
      ordersAsSeller: c.ordersAsSeller,
      bidsPlaced: c.bidsPlaced,
      listings: c.listings,
      messagesSent: c.messagesSent,
      reviewsGiven: c.reviewsGiven,
      reviewsReceived: c.reviewsReceived,
      complaintsMade: c.complaintsMade,
      complaintsReceived: c.complaintsReceived,
      membershipEvents: c.membershipEvents,
      threadsAsBuyer: c.threadsAsBuyer,
      threadsAsSeller: c.threadsAsSeller,
      listingInvitations: c.listingInvitations,
      publicInquiries: c.publicInquiries,
    };
    const hasRetainedHistory = Object.values(retentionCounts).some(
      (n) => n > 0,
    );

    /**
     * GERİ ALINAMAZ dış temizlik — denetim 2026-08-26 Parça 9 #9: bu üç adım
     * eskiden kalıcı DB değişikliğinden ÖNCE koşuyordu. Son adım (delete /
     * anonimleştirme tx'i) patlarsa telafi yolu olmadığı için ortada
     * "kimsenin giremediği, belgeleri 404 veren canlı firma" kalıyor ve audit
     * satırı da hiç yazılmamış oluyordu. Artık ÖNCE DB + audit kesinleşir,
     * sonra dış dünya temizlenir.
     *   - Supabase auth hesapları (login kapanır)
     *   - R2 nesneleri: cascade yalnız DB'yi kapsar, bucket lifecycle kuralı
     *     yok (denetim 2026-08-24 Parça 5)
     *   - AI sohbet oturumları: `ai_chat_sessions` firmaya FK ile BAĞLI DEĞİL,
     *     cascade ulaşmaz (denetim 2026-08-24 Parça 6). `ai_usage` KALIR:
     *     append-only ölçüm kaydı, serbest metin içermez.
     */
    const purgeExternal = async () => {
      for (const u of company.users) {
        if (!u.authId) continue;
        await supabaseDeleteUser(u.authId).catch((err: unknown) =>
          this.logger.warn(
            `Supabase kullanıcı silinemedi (${u.id}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
      }
      await this.purgeCompanyObjects(company);
      await this.prisma.aiChatSession
        .deleteMany({ where: { companyId: id } })
        .catch((err: unknown) =>
          this.logger.warn(
            `AI sohbet oturumları silinemedi (${id}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
    };

    if (!hasRetainedHistory) {
      await this.prisma.company.delete({ where: { id } });
      // Herkese acik profil/urun/sitemap onbellegi dussun (derin denetim
      // MU-02); satir artik yok, slug silmeden once okundu.
      this.seo?.companyChanged(id, {
        slug: company.slug,
        cityId: company.cityId,
        country: company.country,
      });
      await this.audit.log({
        action: "admin.company.deleted",
        actorType: "admin",
        actorId: adminId,
        entityType: "company",
        entityId: id,
        metadata: { name: company.name, rothernId: company.rothernId },
        // #10: geri alınamaz aksiyon.
        critical: true,
      });
      await purgeExternal();
      return { ok: true, mode: "deleted" as const };
    }

    // Anonimleştirme — finansal geçmiş (siparişler) korunur, kimlik gider.
    const anonName = `Silinmiş Firma (${company.rothernId ?? id.slice(0, 6)})`;
    await this.prisma.$transaction([
      this.prisma.company.update({
        where: { id },
        data: {
          name: anonName,
          legalName: null,
          taxNumber: null,
          taxOffice: null,
          mersisNo: null,
          tradeRegistryNo: null,
          iban: null,
          ibanHolder: null,
          billingEmail: null,
          website: null,
          addressLine: null,
          city: null,
          stateRegion: null,
          isActive: false,
          isBlocked: true,
          blockedReason: "KVKK silme talebi — anonimleştirildi",
          blockedAt: new Date(),
          tier: "STANDART",
          membershipEndAt: null,
          // Denetim 2026-08-24 Parça 5: kimlik/KYC alanları da temizlenmeliydi.
          // Eskiden vergi no/MERSİS null'lanırken tam da onların KANITI olan
          // belge anahtarları ve yetkili TCKN kalıyordu — admin firma detayı
          // bu kolonlar için koşulsuz presigned GET üretiyor, yani silme
          // talebinden SONRA da kimlik kartı taraması açılabiliyordu.
          // (Servisin kendi profil yanıtı bu alanları "kişisel/finansal veri"
          // diye maskeliyor — iç tutarsızlık.)
          docTaxPlateUrl: null,
          docTradeRegistryUrl: null,
          docSignatureCircularUrl: null,
          docActivityCertUrl: null,
          docIdFrontUrl: null,
          docIdBackUrl: null,
          authorizedTckn: null,
          authorizedTitle: null,
          billingTitle: null,
          billingPhone: null,
          kepAddress: null,
          district: null,
          neighborhood: null,
          postalCode: null,
          logoUrl: null,
          coverImageUrl: null,
          photos: [],
          certificateImages: [],
          aboutText: null,
          publicEnabled: false,
          // Derin denetim MU-03 (X07/X18/S010): kalan kimlik/iletisim izleri.
          // slug firma adindan turetilir; searchTextI18n about + ceviri
          // katlamasidir. Eski slug SEO tazelemesi icin yukarida okundu.
          slug: null,
          legalFormLocal: null,
          bankSwiftBic: null,
          bankName: null,
          linkedinUrl: null,
          instagramUrl: null,
          services: [],
          searchTextI18n: "",
        },
      }),
      // KYC revizyon kayıtları da (R2 anahtarı taşır) silinir.
      this.prisma.companyKycRevision.deleteMany({ where: { companyId: id } }),
      // Derin denetim MU-03: iliskili tablolar cascade'e yalniz SERT silmede
      // girer; anonimlestirmede elle temizlenir.
      //  - Banka hesaplari (hesap sahibi adi + IBAN/hesap no): siparisler banka
      //    bilgisini kendi anlik goruntusunde tutar, satir gerekmez.
      //  - Bekleyen kullanici davetleri (davetli e-postasi + gecerli token).
      //  - Firma tanitim cevirileri (aboutText/services EN/RU).
      //  - Adres defteri: satirlar SILINMEZ (ilan/teklif FK'siz ya da SetNull
      //    ile bu satirlara bakar), kisi/vergi alanlari ve acik adres
      //    karartilir; ulke/sehir gibi kaba konum kalir.
      this.prisma.companyBankAccount.deleteMany({ where: { companyId: id } }),
      this.prisma.companyUserInvitation.deleteMany({ where: { companyId: id } }),
      this.prisma.contentTranslation.deleteMany({
        where: { entityType: "COMPANY", entityId: id },
      }),
      this.prisma.companyAddress.updateMany({
        where: { companyId: id },
        data: {
          contactName: null,
          phone: null,
          addressLine: "",
          district: null,
          postalCode: null,
          taxOffice: null,
          taxNumber: null,
        },
      }),
      // Kullanıcılar: soft-delete + e-posta karartma (unique korunur) +
      // oturum düşürme. İsimler de anonimleşir.
      ...company.users.map((u, i) =>
        this.prisma.companyUser.update({
          where: { id: u.id },
          data: {
            email: `deleted-${id.slice(0, 8)}-${i}@anon.rothern.local`,
            firstName: "Silinmiş",
            lastName: "Kullanıcı",
            phone: null,
            isActive: false,
            deletedAt: new Date(),
            authId: null,
            tokenVersion: { increment: 1 },
          },
        }),
      ),
    ]);
    // Anonim firma gorunmez (publicEnabled=false, isBlocked) — eski ad/logo
    // ISR onbelleginden servis edilmesin (derin denetim MU-02). slug artik
    // null (MU-03): eski profil yolu, once okunan anlik goruntuyle tazelenir.
    this.seo?.companyChanged(id, {
      slug: company.slug,
      cityId: company.cityId,
      country: company.country,
    });
    await this.audit.log({
      action: "admin.company.anonymized",
      actorType: "admin",
      actorId: adminId,
      entityType: "company",
      entityId: id,
      metadata: {
        name: company.name,
        rothernId: company.rothernId,
        // Neden sert silinmedi — hangi izler tuttu (Dalga A2, P12 #1/#2).
        // Eskiden yalnız "sipariş var" ima ediliyordu; artık gerekçe açık.
        retainedBecause: Object.fromEntries(
          Object.entries(retentionCounts).filter(([, n]) => n > 0),
        ),
      },
      // #10: geri alınamaz aksiyon.
      critical: true,
    });
    // #9: geri alınamaz dış temizlik ancak DB + audit kesinleştikten sonra.
    await purgeExternal();
    return { ok: true, mode: "anonymized" as const };
  }

  private async requireCompany(id: string) {
    const exists = await this.prisma.company.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(i18nMessage("api.adminCompanies.firmaBulunamadi"));
  }
}
