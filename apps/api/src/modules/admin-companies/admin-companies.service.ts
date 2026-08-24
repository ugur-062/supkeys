import { PAID_TIERS } from "@rothern/shared";
import {
  BadRequestException,
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
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EmailService } from "../email/email.service";
import { EmailSuppressionService } from "../email/email-suppression.service";
import { NotificationService } from "../notifications/notification.service";
import { resolveWebUrl } from "../../common/config/web-url";

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
      where.tier = query.tier as "STANDART" | "BRONZ" | "SILVER" | "GOLD";
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
              users: true,
              // Faz Y: listede "Belge Güncellemesi" rozeti için.
              kycRevisions: { where: { status: "PENDING" } },
            },
          },
        },
        // "oldest": KYC kuyruğu için en-eski-önce (updatedAt ≈ belgelerin
        // yüklendiği/PENDING'e geçtiği an) — SLA'ya göre işlem sırası.
        orderBy:
          query.sort === "oldest"
            ? { updatedAt: "asc" }
            : { createdAt: "desc" },
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
      this.prisma.company.findFirst({
        where: { companyVerificationStatus: "PENDING" },
        select: { updatedAt: true },
        orderBy: { updatedAt: "asc" },
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
    ]);
    const vmap = new Map(
      byVerification.map((g) => [g.companyVerificationStatus, g._count]),
    );
    const tmap = new Map(byTier.map((g) => [g.tier, g._count]));
    return {
      totalCompanies: total,
      verified: vmap.get("VERIFIED") ?? 0,
      pendingKyc: (vmap.get("PENDING") ?? 0) + (vmap.get("UNVERIFIED") ?? 0),
      /** Yalnız inceleme bekleyen (6/6 belge yüklü) — gerçek kuyruk. */
      pendingReview: vmap.get("PENDING") ?? 0,
      rejected: vmap.get("REJECTED") ?? 0,
      openComplaints,
      tierBreakdown: {
        STANDART: tmap.get("STANDART") ?? 0,
        BRONZ: tmap.get("BRONZ") ?? 0,
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
      oldestPendingSince: oldestPending?.updatedAt ?? null,
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
          byVisibility: {
            PUBLIC: vismap.get("PUBLIC") ?? 0,
            CONNECTIONS: vismap.get("CONNECTIONS") ?? 0,
            PRIVATE: vismap.get("PRIVATE") ?? 0,
          },
          byType: {
            ALIM: tymap.get("ALIM") ?? 0,
            SATIS: tymap.get("SATIS") ?? 0,
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
          select: { users: true, listings: true, complaintsReceived: true },
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
      this.storage.presignStoredObject("private", c.docTaxPlateUrl),
      this.storage.presignStoredObject("private", c.docTradeRegistryUrl),
      this.storage.presignStoredObject("private", c.docSignatureCircularUrl),
      this.storage.presignStoredObject("private", c.docActivityCertUrl),
      this.storage.presignStoredObject("private", c.docIdFrontUrl),
      this.storage.presignStoredObject("private", c.docIdBackUrl),
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
        url: await this.storage.presignStoredObject("private", r.key),
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
      changes[key] = { from: prev, to: data[key] };
    }
    if (Object.keys(data).length === 0) {
      return { ok: true, changed: [] };
    }
    await this.prisma.company.update({ where: { id }, data });
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

  async setVerification(
    id: string,
    status: "VERIFIED" | "REJECTED",
    adminId: string,
    reason?: string,
  ) {
    await this.requireCompany(id);
    // Genel karar tüm belgelere yansır (durum tutarlılığı): VERIFIED → hepsi
    // APPROVED; REJECTED → hepsi REJECTED (aynı gerekçe). Belge bazlı ayrı
    // karar için reviewDocuments kullanılır.
    const docStatus: KycDocStatus = status === "VERIFIED" ? "APPROVED" : "REJECTED";
    const docReason = status === "REJECTED" ? (reason?.trim() || null) : null;
    const docData = Object.fromEntries(
      (Object.keys(DOC_META) as DocKind[]).flatMap((k) => [
        [DOC_META[k].status, docStatus],
        [DOC_META[k].reason, docReason],
      ]),
    );
    await this.prisma.company.update({
      where: { id },
      data: {
        companyVerificationStatus: status as CompanyVerificationStatus,
        companyVerifiedAt: status === "VERIFIED" ? new Date() : null,
        // Red gerekçesi firmaya gösterilir; onayda temizlenir.
        companyRejectionReason:
          status === "REJECTED" ? (reason?.trim() || null) : null,
        ...docData,
      },
    });
    await this.audit.log({
      action: "admin.company.verification_set",
      actorType: "admin",
      actorId: adminId ?? null,
      entityType: "company",
      entityId: id,
      metadata: { status },
    });
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
      Record<DocKind, { status: "APPROVED" | "REJECTED"; reason?: string }>
    >,
    adminId: string,
  ) {
    const c = await this.prisma.company.findUnique({
      where: { id },
      select: {
        country: true,
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
    await this.prisma.company.update({
      where: { id },
      data: {
        ...data,
        companyVerificationStatus: status,
        companyVerifiedAt: status === "VERIFIED" ? new Date() : null,
        // Belge bazlı gerekçe ayrı tutulur; genel özet alanı temizlenir.
        companyRejectionReason: null,
      },
    });
    await this.audit.log({
      action: "admin.company.docs_reviewed",
      actorType: "admin",
      actorId: adminId ?? null,
      entityType: "company",
      entityId: id,
      metadata: { status, rejected: anyRejected },
    });
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
    tier: "STANDART" | "BRONZ" | "SILVER" | "GOLD",
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
    await this.prisma.company.update({
      where: { id },
      data: { tier, membershipEndAt },
    });
    // Üyelik geçmişi (append-only) — rapor + destek "premium'um nereye gitti".
    await this.prisma.companyMembershipEvent.create({
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
    await this.audit.log({
      action: "admin.company.tier_set",
      actorType: "admin",
      actorId: adminId ?? null,
      entityType: "company",
      entityId: id,
      metadata: { tier, months: months ?? 12 },
    });
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
        "Uzatma yalnız paketli üyelikte — önce bir paket (Bronz/Silver/Gold) verin",
      );
    }
    const now = new Date();
    const base =
      c.membershipEndAt && c.membershipEndAt.getTime() > now.getTime()
        ? new Date(c.membershipEndAt)
        : now;
    const end = new Date(base);
    end.setMonth(end.getMonth() + months);
    await this.prisma.company.update({
      where: { id },
      data: { membershipEndAt: end },
    });
    await this.prisma.companyMembershipEvent.create({
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
    await this.audit.log({
      action: "admin.company.membership_extended",
      actorType: "admin",
      actorId: adminId,
      entityType: "company",
      entityId: id,
      metadata: { months },
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
    if (from) createdAt.gte = new Date(from);
    if (to) {
      // to = gün SONU dahil.
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
    const events = await this.prisma.companyMembershipEvent.findMany({
      where,
      include: { company: { select: { name: true, rothernId: true } } },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
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
    const totals = {
      grants: rows.filter((r) => r.action === "GRANT").length,
      extends: rows.filter((r) => r.action === "EXTEND").length,
      revokes: rows.filter((r) => r.action === "REVOKE").length,
      expires: rows.filter((r) => r.action === "EXPIRE").length,
      /** Satılan toplam ay (GRANT+EXTEND) — gelirin vekil ölçüsü. */
      monthsGranted: rows
        .filter((r) => r.action === "GRANT" || r.action === "EXTEND")
        .reduce((sum, r) => sum + (r.months ?? 0), 0),
    };
    return { rows, totals };
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
    });
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
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
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
      tier?: "STANDART" | "BRONZ" | "SILVER" | "GOLD";
      country?: string;
      sendEmail?: boolean;
    },
    adminId: string,
  ) {
    const where: Record<string, unknown> = { isActive: true, isBlocked: false };
    if (input.tier) where.tier = input.tier;
    if (input.country) where.country = input.country.trim().toUpperCase();
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
                select: { email: true, firstName: true, lastName: true },
                orderBy: { createdAt: "asc" },
                take: 1,
              },
            }
          : {}),
      },
      take: 5000,
    })) as {
      id: string;
      name: string;
      billingEmail: string | null;
      users: { email: string; firstName: string; lastName: string }[];
    }[];
    const subject = input.subject.trim();
    const message = input.message.trim();
    const pushPayload = {
      type: "admin_announcement",
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
            this.notifyCompanyEmail(
              t,
              subject,
              ["Merhaba,", message],
              "admin_announcement",
            );
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
      },
    });
    return { ok: true, targets: targets.length, delivered };
  }

  async resolveComplaint(
    id: string,
    input: {
      status: "RESOLVED" | "DISMISSED";
      adminNote?: string;
      suspend?: boolean;
      suspendReason?: string;
    },
    adminId: string,
  ) {
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
      await this.prisma.company.update({
        where: { id: c.againstCompanyId },
        data: {
          isBlocked: true,
          blockedReason:
            input.suspendReason?.trim() ||
            input.adminNote?.trim() ||
            "Şikayet üzerine askıya alındı",
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
            permissionsOverride: true,
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
        _count: { select: { ordersAsBuyer: true, ordersAsSeller: true } },
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
    const hasOrders =
      company._count.ordersAsBuyer + company._count.ordersAsSeller > 0;

    // Supabase auth hesapları her iki yolda da silinir (login kapanır).
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

    // KVKK: AI sohbet oturumları firmaya FK ile bağlı DEĞİL (ai_chat_sessions
    // ayrı tutulur) → cascade ulaşmaz ve silme/anonimleştirme sonrası serbest
    // metin sohbet içeriği (karşı taraf verisi dahil) 90 günlük TTL cron'una
    // kadar DB'de kalıyordu. Her iki kolda da açıkça temizlenir (denetim
    // 2026-08-24 Parça 6). `ai_usage` KALIR: append-only ölçüm/muhasebe kaydı
    // (bütçe SUM'ı ona bağlı) ve serbest metin içermez.
    // KVKK: DB satırını silmek/anonimleştirmek YETMEZ — belgeler R2'da yaşar.
    // Cascade yalnız DB'yi kapsar; hiçbir bucket lifecycle kuralı da yok, yani
    // kimlik/vergi/sicil taramaları ve profil görselleri silme talebinden sonra
    // depoda kalıyordu (denetim 2026-08-24 Parça 5). Best-effort: silme hatası
    // akışı bozmaz, loglanır.
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

    if (!hasOrders) {
      await this.prisma.company.delete({ where: { id } });
      await this.audit.log({
        action: "admin.company.deleted",
        actorType: "admin",
        actorId: adminId,
        entityType: "company",
        entityId: id,
        metadata: { name: company.name, rothernId: company.rothernId },
      });
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
      metadata: { name: company.name, rothernId: company.rothernId },
    });
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
