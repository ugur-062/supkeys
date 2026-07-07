import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CompanyVerificationStatus, ComplaintStatus } from "@rothern/db";
import { StorageService } from "../storage/storage.service";
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

  /** Firmaya (in-app + e-posta) bildirim — admin aksiyonları için. Best-effort. */
  private async notifyCompany(
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

  async list(query: { status?: string; blocked?: string; q?: string }) {
    const where: Record<string, unknown> = {};
    if (query.status) {
      where.companyVerificationStatus = query.status as CompanyVerificationStatus;
    }
    if (query.blocked === "true") where.isBlocked = true;
    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { rothernId: { contains: q.toUpperCase() } },
        { taxNumber: { contains: q } },
      ];
    }
    const rows = await this.prisma.company.findMany({
      where,
      select: {
        id: true,
        rothernId: true,
        name: true,
        taxNumber: true,
        country: true,
        tier: true,
        companyVerificationStatus: true,
        isBlocked: true,
        createdAt: true,
        _count: { select: { complaintsReceived: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((c) => ({
      id: c.id,
      rothernId: c.rothernId,
      name: c.name,
      taxNumber: c.taxNumber,
      country: c.country,
      tier: c.tier,
      verification: c.companyVerificationStatus,
      isBlocked: c.isBlocked,
      complaintCount: c._count.complaintsReceived,
      createdAt: c.createdAt,
    }));
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
        city: true,
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
        docTaxPlateUrl: true,
        docTradeRegistryUrl: true,
        docSignatureCircularUrl: true,
        docActivityCertUrl: true,
        docIdFrontUrl: true,
        docIdBackUrl: true,
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

  async setVerification(
    id: string,
    status: "VERIFIED" | "REJECTED",
    adminId: string,
    reason?: string,
  ) {
    await this.requireCompany(id);
    await this.prisma.company.update({
      where: { id },
      data: {
        companyVerificationStatus: status as CompanyVerificationStatus,
        companyVerifiedAt: status === "VERIFIED" ? new Date() : null,
        // Red gerekçesi firmaya gösterilir; onayda temizlenir.
        companyRejectionReason:
          status === "REJECTED" ? (reason?.trim() || null) : null,
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

  /** PAKET ver / al. PAKET → membershipEndAt = now + months (varsayılan 12). */
  async setTier(
    id: string,
    tier: "STANDARD" | "PAKET",
    months?: number,
    adminId?: string,
  ) {
    await this.requireCompany(id);
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

  async listComplaints(status?: string) {
    const rows = await this.prisma.companyComplaint.findMany({
      where: status ? { status: status as ComplaintStatus } : {},
      include: {
        complainant: { select: { name: true, rothernId: true } },
        against: { select: { id: true, name: true, rothernId: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      complainant: r.complainant,
      against: r.against,
      reason: r.reason,
      detail: r.detail,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
    }));
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
      select: { id: true, againstCompanyId: true },
    });
    if (!c) throw new NotFoundException("Şikayet bulunamadı");
    await this.prisma.companyComplaint.update({
      where: { id },
      data: {
        status: input.status as ComplaintStatus,
        adminNote: input.adminNote?.trim() || null,
        resolvedAt: new Date(),
        resolvedByAdminId: adminId,
      },
    });
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
