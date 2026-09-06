import { ALL_SEAT_PERMISSIONS } from "@rothern/shared";
import { PAID_TIERS, maskIban } from "@rothern/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CompanyVerificationStatus,
  ComplaintStatus,
  KycDocStatus,
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
import { AuditService } from "../audit/audit.service";
import { EmailService } from "../email/email.service";
import { EmailSuppressionService } from "../email/email-suppression.service";
import { NotificationService } from "../notifications/notification.service";
import { resolveWebUrl } from "../../common/config/web-url";

/**
 * Tek duyuruda ulaşılacak azami firma (Dalga B). Aşılırsa gönderim yapılır ama
 * yanıt `truncated` ile bunu SÖYLER — sessiz kesme, "hepsine gitti" yanılgısı
 * üretiyordu.
 */
const ANNOUNCE_MAX_TARGETS = 5000;

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
  ) {}

  /**
   * Firmaya (in-app + e-posta) bildirim — admin aksiyonları için. Best-effort.
   * Public: AdminInspectionService (ilan kapatma/sipariş iptali) da kullanır.
   */
  async notifyCompany(
    companyId: string,
    subject: string,
    paragraphs: string[],
    type: string,
    cta?: { label: string; path: string },
  ) {
    const baseUrl =
      resolveWebUrl(this.config);
    const ctaUrl = `${baseUrl}${cta?.path ?? "/company"}`;
    const ctaLabel = cta?.label ?? "Rothern'e Git";
    // In-app (portal-nötr → her iki panelde görünür).
    await this.notifications
      .pushToCompany(companyId, {
        type,
        title: subject,
        body: paragraphs.slice(1).join(" ") || subject,
        ctaLabel,
        ctaUrl,
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
            select: { email: true, firstName: true, lastName: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      });
      if (!c) return;
      this.notifyCompanyEmail(c, subject, paragraphs, type, cta);
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
   */
  private notifyCompanyEmail(
    company: {
      id: string;
      name: string;
      billingEmail: string | null;
      users: { email: string; firstName: string; lastName: string }[];
    },
    subject: string,
    paragraphs: string[],
    type: string,
    cta?: { label: string; path: string },
  ) {
    const baseUrl =
      resolveWebUrl(this.config);
    const ctaUrl = `${baseUrl}${cta?.path ?? "/company"}`;
    const ctaLabel = cta?.label ?? "Rothern'e Git";
    const email = company.billingEmail || company.users[0]?.email;
    if (!email) return;
    const name = company.users[0]
      ? `${company.users[0].firstName} ${company.users[0].lastName}`.trim() ||
        company.name
      : company.name;
    void this.email
      .send({
        to: { email, name },
        subject,
        templateData: {
          template: "notification",
          data: { subject, heading: subject, paragraphs, ctaLabel, ctaUrl },
        },
        context: { type, id: company.id },
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `Admin e-postası gönderilemedi (${company.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
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
    if (!c) throw new NotFoundException("Firma bulunamadı");
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
    // `users` yalnız suppression hesabı için çekildi — detay contract'ına ham
    // liste sızdırma (ayrı users endpoint'i var); yalnız suppressions dön.
    const { users: _users, ...company } = c;
    return {
      ...company,
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
        | "stateRegion"
        | "city"
        | "addressLine"
        | "billingEmail"
        | "website"
        | "industry"
        | "iban"
        | "ibanHolder",
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
        stateRegion: true,
        city: true,
        addressLine: true,
        billingEmail: true,
        website: true,
        industry: true,
        iban: true,
        ibanHolder: true,
      },
    });
    if (!before) throw new NotFoundException("Firma bulunamadı");

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
        throw new BadRequestException("Firma adı boş olamaz");
      }
      data[key] = key === "country" && value ? value.toUpperCase() : value;
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
    if (effectiveCountry === "TR" && typeof data.iban === "string") {
      const iban = data.iban.replace(/\s+/g, "").toUpperCase();
      if (!/^TR\d{24}$/.test(iban)) {
        throw new BadRequestException("Geçerli bir IBAN gerekli (TR + 24 rakam).");
      }
      data.iban = iban;
      changes.iban = { from: changes.iban?.from ?? null, to: maskIban(iban) };
    }
    if (Object.keys(data).length === 0) {
      return { ok: true, changed: [] };
    }
    await this.prisma.company.update({ where: { id }, data });
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
              companyRejectionReason:
                "Ülke değişikliği sonrası yeni zorunlu belgeler eksik — lütfen tamamlayıp yeniden gönderin.",
            },
          });
          void this.notifyCompany(
            id,
            "Ülke değişikliği: doğrulama belgeleriniz güncellenmeli",
            [
              "Merhaba,",
              "Firmanızın ülkesi güncellendiği için zorunlu doğrulama belgeleri değişti. Eksik belgeleri yükleyip doğrulamayı yeniden gönderin.",
            ],
            "company_verification",
            { label: "Belgeleri Tamamla", path: "/company/ayarlar/dogrulama" },
          );
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
  }): void {
    if ((c.country ?? "TR").toUpperCase() !== "TR") return;
    const missing: string[] = [];
    if (!c.mersisNo?.trim()) missing.push("MERSİS numarası");
    if (!c.tradeRegistryNo?.trim()) missing.push("ticari sicil numarası");
    if (!c.iban?.trim()) missing.push("IBAN");
    if (!c.ibanHolder?.trim()) missing.push("IBAN hesap sahibi");
    if (missing.length > 0) {
      throw new BadRequestException(
        `Doğrulama için eksik kimlik bilgisi: ${missing.join(", ")}. Firma bu alanları doldurmadan onaylanamaz.`,
      );
    }
  }

  async setVerification(
    id: string,
    status: "VERIFIED" | "REJECTED",
    adminId: string,
    reason?: string,
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
        docTaxPlateUrl: true,
        docTradeRegistryUrl: true,
        docSignatureCircularUrl: true,
        docActivityCertUrl: true,
        docIdFrontUrl: true,
        docIdBackUrl: true,
      },
    });
    if (!c) throw new NotFoundException("Firma bulunamadı");
    const required = requiredKinds(c.country);
    if (status === "VERIFIED") {
      for (const k of required) {
        if (!(c as Record<string, unknown>)[DOC_META[k].url]) {
          throw new BadRequestException(
            `Eksik belge var; karar verilemez (${k})`,
          );
        }
      }
      this.assertKycIdentityComplete(c);
    }
    const docStatus: KycDocStatus = status === "VERIFIED" ? "APPROVED" : "REJECTED";
    const docReason = status === "REJECTED" ? (reason?.trim() || null) : null;
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
        companyRejectionReason:
          status === "REJECTED" ? (reason?.trim() || null) : null,
        ...docData,
      },
    });
    if (done.count !== 1) {
      throw new ConflictException(
        "Firma doğrulama durumu az önce değişti — sayfayı yenileyip tekrar deneyin",
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
      void this.notifyCompany(
        id,
        "Firma doğrulamanız onaylandı",
        [
          "Merhaba,",
          "Firma doğrulama belgeleriniz incelendi ve onaylandı. Artık premium doğrulama gerektiren adımlara devam edebilirsiniz.",
        ],
        "company_verification",
        { label: "Hesabım", path: "/company/ayarlar/dogrulama" },
      );
    } else {
      void this.notifyCompany(
        id,
        "Firma doğrulamanız reddedildi",
        [
          "Merhaba,",
          "Firma doğrulama belgeleriniz incelendi ancak onaylanamadı. Lütfen belgelerinizi güncelleyip yeniden gönderin.",
        ],
        "company_verification",
        { label: "Belgeleri Güncelle", path: "/company/ayarlar/dogrulama" },
      );
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
        { status: "APPROVED" | "REJECTED"; reason?: string; key?: string }
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
        docTaxPlateUrl: true,
        docTradeRegistryUrl: true,
        docSignatureCircularUrl: true,
        docActivityCertUrl: true,
        docIdFrontUrl: true,
        docIdBackUrl: true,
      },
    });
    if (!c) throw new NotFoundException("Firma bulunamadı");
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
        throw new BadRequestException(`Eksik belge var; karar verilemez (${k})`);
      }
      const d = decisions[k];
      if (!d || (d.status !== "APPROVED" && d.status !== "REJECTED")) {
        throw new BadRequestException(`Her zorunlu belge için karar gerekli (${k})`);
      }
      if (d.status === "REJECTED") {
        const reason = d.reason?.trim();
        if (!reason || reason.length < 3) {
          throw new BadRequestException(
            `Reddedilen belgeye gerekçe gerekli (${k})`,
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
        "Belgeler veya doğrulama durumu az önce değişti — sayfayı yenileyip kararı tekrar verin",
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
      void this.notifyCompany(
        id,
        "Firma doğrulamanız onaylandı",
        [
          "Merhaba,",
          "Firma doğrulama belgeleriniz incelendi ve onaylandı. Artık premium doğrulama gerektiren adımlara devam edebilirsiniz.",
        ],
        "company_verification",
        { label: "Hesabım", path: "/company/ayarlar/dogrulama" },
      );
    } else {
      void this.notifyCompany(
        id,
        "Bazı belgeleriniz reddedildi",
        [
          "Merhaba,",
          "Firma doğrulama belgelerinizin bir kısmı onaylanmadı. Reddedilen belgeleri düzeltip yeniden gönderin; onaylanan belgeleri tekrar yüklemenize gerek yok.",
        ],
        "company_verification",
        { label: "Belgeleri Güncelle", path: "/company/ayarlar/dogrulama" },
      );
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
    decision: { status: "APPROVED" | "REJECTED"; reason?: string },
    adminId: string,
  ) {
    if (decision.status !== "APPROVED" && decision.status !== "REJECTED") {
      throw new BadRequestException("Geçersiz karar");
    }
    const rev = await this.prisma.companyKycRevision.findUnique({
      where: { id: revisionId },
    });
    if (!rev || rev.companyId !== companyId) {
      throw new NotFoundException("Revizyon bulunamadı");
    }
    if (rev.status !== "PENDING") {
      throw new BadRequestException("Yalnızca bekleyen revizyon incelenebilir");
    }
    if (!(rev.kind in DOC_META)) {
      throw new BadRequestException("Geçersiz belge türü");
    }
    const k = rev.kind as DocKind;
    const reason = decision.reason?.trim();
    if (decision.status === "REJECTED" && (!reason || reason.length < 3)) {
      throw new BadRequestException("Reddedilen revizyona gerekçe gerekli");
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
        throw new BadRequestException("Revizyon az önce karara bağlandı");
      }
      if (decision.status === "APPROVED") {
        const prev = await tx.company.findUnique({
          where: { id: companyId },
          select: { [DOC_META[k].url]: true } as Record<string, true>,
        });
        const prevKey = (prev as Record<string, unknown> | null)?.[
          DOC_META[k].url
        ];
        if (typeof prevKey === "string" && prevKey && prevKey !== rev.key) {
          supersededKey = prevKey;
        }
        await tx.company.update({
          where: { id: companyId },
          data: {
            [DOC_META[k].url]: rev.key,
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
      void this.notifyCompany(
        companyId,
        "Belge güncellemeniz onaylandı",
        [
          "Merhaba,",
          "Gönderdiğiniz yeni belge incelendi ve onaylandı; artık geçerli belgeniz olarak kayıtlıdır.",
        ],
        "company_verification",
        { label: "Belgelerim", path: "/company/ayarlar/dogrulama" },
      );
    } else {
      void this.notifyCompany(
        companyId,
        "Belge güncellemeniz reddedildi",
        [
          "Merhaba,",
          "Gönderdiğiniz yeni belge onaylanmadı; mevcut belgeniz geçerliliğini korumaktadır. Gerekçeyi görüp yeni bir belge yükleyebilirsiniz.",
        ],
        "company_verification",
        { label: "Belgelerim", path: "/company/ayarlar/dogrulama" },
      );
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
    if (!before) throw new NotFoundException("Firma bulunamadı");
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
          "Firmanın üyeliği az önce değişti — sayfayı yenileyip tekrar deneyin",
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
        this.prisma.companyReferralInvite.deleteMany({
          where: { inviterCompanyId: id, status: "PENDING" },
        }),
      ]);
      void this.notifyCompany(
        id,
        "Paket üyeliğiniz sonlandırıldı",
        [
          "Merhaba,",
          "Firma paketiniz platform yöneticisi tarafından Standart üyeliğe alındı. Artık yeni satın alma talebi açamaz, firma davet edemez veya dizinde görünemezsiniz; mevcut ilanlarınızı tamamlayabilir ve gelen davetlere teklif verebilirsiniz.",
          "Gönderdiğiniz bekleyen bağlantı davetleri iptal edildi.",
        ],
        "membership_downgraded",
      );
    } else if (tier !== "STANDART" && before.tier === "STANDART") {
      void this.notifyCompany(
        id,
        "Paket üyeliğiniz tanımlandı",
        [
          "Merhaba,",
          `Firma hesabınıza ${tier} paketi tanımlandı. Paket haklarınızı hemen kullanmaya başlayabilirsiniz.`,
        ],
        "membership_granted",
      );
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
    if (!c) throw new NotFoundException("Firma bulunamadı");
    if (c.tier === "STANDART") {
      throw new BadRequestException(
        "Uzatma yalnız paketli üyelikte — önce bir paket (Silver/Gold) verin",
      );
    }
    // Dalga B-3: SÜRESİZ üyelik uzatılamaz. Eskiden `membershipEndAt === null`
    // dalında `base = now` alınıyordu → "12 ay uzat" süresiz bir üyeliği
    // 12 ay sonra BİTECEK hâle getiriyordu; uzatma işlemi üyeliği KISALTIYORDU
    // ve olay tablosunda EXTEND olarak görünüyordu.
    if (!c.membershipEndAt) {
      throw new BadRequestException(
        "Bu firmanın üyeliği süresiz — uzatılamaz. Süre tanımlamak isterseniz önce paketi yeniden verin (bitiş tarihiyle).",
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
          "Firmanın üyeliği az önce değişti — sayfayı yenileyip tekrar deneyin",
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
    void this.notifyCompany(
      id,
      "Hesabınız askıya alındı",
      [
        "Merhaba,",
        `Firma hesabınız platform yöneticisi tarafından askıya alındı. Gerekçe: ${blockedReason}`,
        "İtiraz veya bilgi için destek ekibimizle iletişime geçebilirsiniz.",
      ],
      "admin_company_suspended",
    );
    return { ok: true };
  }

  async unsuspend(id: string, adminId?: string) {
    await this.requireCompany(id);
    await this.prisma.company.update({
      where: { id },
      data: { isBlocked: false, blockedReason: null, blockedAt: null },
    });
    await this.audit.log({
      action: "admin.company.unsuspended",
      actorType: "admin",
      actorId: adminId ?? null,
      entityType: "company",
      entityId: id,
      critical: true,
    });
    // #17 simetrisi: askının kalktığı da bildirilir.
    void this.notifyCompany(
      id,
      "Hesabınızın askısı kaldırıldı",
      [
        "Merhaba,",
        "Firma hesabınızın askısı kaldırıldı; platformu yeniden kullanabilirsiniz.",
      ],
      "admin_company_unsuspended",
    );
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
      throw new BadRequestException("Not en az 3 karakter olmalı");
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
    if (done.count !== 1) throw new NotFoundException("Not bulunamadı");
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
    await this.notifyCompany(companyId, subject.trim(), [
      "Merhaba,",
      message.trim(),
    ], "admin_message");
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
      title: subject,
      body: message,
      ctaLabel: "Rothern'e Git",
      ctaUrl: `${resolveWebUrl(this.config)}/company`,
    };
    const CHUNK = 25;
    let delivered = 0;
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
              this.notifyCompanyEmail(
                t,
                subject,
                ["Merhaba,", message],
                "admin_announcement",
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
      },
    });
    return { ok: true, targets: targets.length, delivered, truncated };
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
        "Firma askıya alma yetkisi yalnız SUPER_ADMIN'dedir — şikayeti askıya almadan sonuçlandırabilirsiniz",
      );
    }
    const c = await this.prisma.companyComplaint.findUnique({
      where: { id },
      select: { id: true, againstCompanyId: true, status: true },
    });
    if (!c) throw new NotFoundException("Şikayet bulunamadı");
    if (c.status !== "OPEN") {
      throw new BadRequestException("Bu şikayet zaten sonuçlanmış");
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
      throw new BadRequestException("Bu şikayet zaten sonuçlanmış");
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
      const blockedReason =
        input.suspendReason?.trim() ||
        input.adminNote?.trim() ||
        "Şikayet üzerine askıya alındı";
      await this.prisma.company.update({
        where: { id: c.againstCompanyId },
        data: {
          isBlocked: true,
          blockedReason,
          blockedAt: new Date(),
        },
      });
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
      void this.notifyCompany(
        c.againstCompanyId,
        "Hesabınız askıya alındı",
        [
          "Merhaba,",
          `Firma hesabınız platform yöneticisi tarafından askıya alındı. Gerekçe: ${blockedReason}`,
          "İtiraz veya bilgi için destek ekibimizle iletişime geçebilirsiniz.",
        ],
        "admin_company_suspended",
      );
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
    if (!company) throw new NotFoundException("Firma bulunamadı");
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
      this.pageRelation((a) => root().complaintsMade(a)),
      this.pageRelation((a) => root().complaintsReceived(a)),
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
    if (!company) throw new NotFoundException("Firma bulunamadı");
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
        },
      }),
      // KYC revizyon kayıtları da (R2 anahtarı taşır) silinir.
      this.prisma.companyKycRevision.deleteMany({ where: { companyId: id } }),
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
    if (!exists) throw new NotFoundException("Firma bulunamadı");
  }
}
