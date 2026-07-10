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
} from "@rothern/db";
import { StorageService } from "../storage/storage.service";
import {
  DOC_META,
  requiredKinds,
  type DocKind,
} from "../company-docs/company-docs.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EmailService } from "../email/email.service";
import { NotificationService } from "../notifications/notification.service";

@Injectable()
export class AdminCompaniesService {
  private readonly logger = new Logger(AdminCompaniesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly email: EmailService,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
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
      this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
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
    // E-posta.
    const c = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
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
    const email = c?.billingEmail || c?.users[0]?.email;
    if (!c || !email) return;
    const name = c.users[0]
      ? `${c.users[0].firstName} ${c.users[0].lastName}`.trim() || c.name
      : c.name;
    void this.email
      .send({
        to: { email, name },
        subject,
        templateData: {
          template: "notification",
          data: { subject, heading: subject, paragraphs, ctaLabel, ctaUrl },
        },
        context: { type, id: companyId },
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `Admin e-postası gönderilemedi (${companyId}): ${
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
  }) {
    const where: Record<string, unknown> = {};
    if (query.status) {
      where.companyVerificationStatus = query.status as CompanyVerificationStatus;
    }
    if (query.blocked === "true") where.isBlocked = true;
    if (query.country) where.country = query.country.trim().toUpperCase();
    if (query.tier === "PAKET" || query.tier === "STANDARD") {
      where.tier = query.tier;
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
          _count: { select: { complaintsReceived: true, users: true } },
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
          tier: "PAKET",
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
        PAKET: tmap.get("PAKET") ?? 0,
        STANDARD: tmap.get("STANDARD") ?? 0,
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
        _count: {
          select: { users: true, listings: true, complaintsReceived: true },
        },
      },
    });
    if (!c) throw new NotFoundException("Firma bulunamadı");
    const openComplaints = await this.prisma.companyComplaint.count({
      where: { againstCompanyId: id, status: "OPEN" },
    });
    // Hassas KYC belgeleri kalıcı public URL değil, kısa ömürlü presigned GET.
    const [
      docTaxPlateUrl,
      docTradeRegistryUrl,
      docSignatureCircularUrl,
      docActivityCertUrl,
      docIdFrontUrl,
      docIdBackUrl,
    ] = await Promise.all([
      this.storage.presignStoredObject(c.docTaxPlateUrl),
      this.storage.presignStoredObject(c.docTradeRegistryUrl),
      this.storage.presignStoredObject(c.docSignatureCircularUrl),
      this.storage.presignStoredObject(c.docActivityCertUrl),
      this.storage.presignStoredObject(c.docIdFrontUrl),
      this.storage.presignStoredObject(c.docIdBackUrl),
    ]);
    return {
      ...c,
      docTaxPlateUrl,
      docTradeRegistryUrl,
      docSignatureCircularUrl,
      docActivityCertUrl,
      docIdFrontUrl,
      docIdBackUrl,
      openComplaints,
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

  /** PAKET ver / al. PAKET → membershipEndAt = now + months (varsayılan 12). */
  async setTier(
    id: string,
    tier: "STANDARD" | "PAKET",
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
    if (tier === "PAKET") {
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
        action: tier === "PAKET" ? "GRANT" : "REVOKE",
        months: tier === "PAKET" ? (months ?? 12) : null,
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
    if (c.tier !== "PAKET") {
      throw new BadRequestException(
        "Uzatma yalnız premium (PAKET) üyelikte — önce PAKET verin",
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
      tier?: "PAKET" | "STANDARD";
      country?: string;
      sendEmail?: boolean;
    },
    adminId: string,
  ) {
    const where: Record<string, unknown> = { isActive: true, isBlocked: false };
    if (input.tier) where.tier = input.tier;
    if (input.country) where.country = input.country.trim().toUpperCase();
    const targets = await this.prisma.company.findMany({
      where,
      select: { id: true },
      take: 5000,
    });
    let delivered = 0;
    for (const t of targets) {
      try {
        if (input.sendEmail) {
          // notifyCompany = in-app + e-posta birlikte.
          await this.notifyCompany(t.id, input.subject.trim(), [
            "Merhaba,",
            input.message.trim(),
          ], "admin_announcement");
        } else {
          await this.notifications.pushToCompany(t.id, {
            type: "admin_announcement",
            title: input.subject.trim(),
            body: input.message.trim(),
            ctaLabel: "Rothern'e Git",
            ctaUrl: `${this.config.get<string>("WEB_URL") ?? "http://localhost:3000"}/company`,
          });
        }
        delivered++;
      } catch (err) {
        this.logger.warn(
          `Duyuru gönderilemedi (${t.id}): ${
            err instanceof Error ? err.message : String(err)
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

  private async requireCompany(id: string) {
    const exists = await this.prisma.company.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Firma bulunamadı");
  }
}
