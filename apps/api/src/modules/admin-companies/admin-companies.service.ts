import { Injectable, NotFoundException } from "@nestjs/common";
import { CompanyVerificationStatus, ComplaintStatus } from "@supkeys/db";
import { StorageService } from "../storage/storage.service";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class AdminCompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

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
        { supkeysId: { contains: q.toUpperCase() } },
        { taxNumber: { contains: q } },
      ];
    }
    const rows = await this.prisma.company.findMany({
      where,
      select: {
        id: true,
        supkeysId: true,
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
      supkeysId: c.supkeysId,
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
        supkeysId: true,
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
    _adminId: string,
  ) {
    await this.requireCompany(id);
    await this.prisma.company.update({
      where: { id },
      data: {
        companyVerificationStatus: status as CompanyVerificationStatus,
        companyVerifiedAt: status === "VERIFIED" ? new Date() : null,
      },
    });
    return { ok: true };
  }

  /** PAKET ver / al. PAKET → membershipEndAt = now + months (varsayılan 12). */
  async setTier(id: string, tier: "STANDARD" | "PAKET", months?: number) {
    await this.requireCompany(id);
    const membershipEndAt =
      tier === "PAKET"
        ? new Date(Date.now() + (months ?? 12) * 30 * 24 * 60 * 60 * 1000)
        : null;
    await this.prisma.company.update({
      where: { id },
      data: { tier, membershipEndAt },
    });
    return { ok: true, tier, membershipEndAt };
  }

  async suspend(id: string, reason: string) {
    await this.requireCompany(id);
    await this.prisma.company.update({
      where: { id },
      data: {
        isBlocked: true,
        blockedReason: reason?.trim() || "Yönetici tarafından askıya alındı",
        blockedAt: new Date(),
      },
    });
    return { ok: true };
  }

  async unsuspend(id: string) {
    await this.requireCompany(id);
    await this.prisma.company.update({
      where: { id },
      data: { isBlocked: false, blockedReason: null, blockedAt: null },
    });
    return { ok: true };
  }

  async listComplaints(status?: string) {
    const rows = await this.prisma.companyComplaint.findMany({
      where: status ? { status: status as ComplaintStatus } : {},
      include: {
        complainant: { select: { name: true, supkeysId: true } },
        against: { select: { id: true, name: true, supkeysId: true } },
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
