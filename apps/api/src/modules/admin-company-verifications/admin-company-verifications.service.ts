import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CompanyVerificationStatus, Prisma } from "@supkeys/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CompanyDocsService } from "../company-docs/company-docs.service";
import {
  ListCompanyVerificationsDto,
  VerificationStatusFilter,
} from "./dto/company-verifications.dto";

type OwnerType = "tenant" | "supplier";

/** Tenant + Supplier ortak kurumsal kimlik alanları (detayda gösterilir). */
const COMMON_SELECT = {
  id: true,
  legalName: true,
  companyType: true,
  taxNumber: true,
  taxOffice: true,
  authorizedTckn: true,
  authorizedTitle: true,
  mersisNo: true,
  tradeRegistryNo: true,
  kepAddress: true,
  iban: true,
  ibanHolder: true,
  companyVerificationStatus: true,
  companyVerifiedAt: true,
};

@Injectable()
export class AdminCompanyVerificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyDocs: CompanyDocsService,
  ) {}

  private statusWhere(
    status?: VerificationStatusFilter,
  ): CompanyVerificationStatus | { in: CompanyVerificationStatus[] } {
    if (!status || status === VerificationStatusFilter.ALL) {
      // Liste varsayılanı: incelenmesi gerekenler (PENDING) + sonuçlananlar.
      return { in: ["PENDING", "VERIFIED", "REJECTED"] };
    }
    return status;
  }

  async stats() {
    const [tenant, supplier] = await Promise.all([
      this.prisma.tenant.count({
        where: { companyVerificationStatus: "PENDING" },
      }),
      this.prisma.supplier.count({
        where: { companyVerificationStatus: "PENDING" },
      }),
    ]);
    return { pending: tenant + supplier, tenantPending: tenant, supplierPending: supplier };
  }

  async list(query: ListCompanyVerificationsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const status = this.statusWhere(query.status);
    const search = query.search?.trim();

    const tenantWhere: Prisma.TenantWhereInput = {
      companyVerificationStatus: status,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    };
    const supplierWhere: Prisma.SupplierWhereInput = {
      companyVerificationStatus: status,
      ...(search
        ? { companyName: { contains: search, mode: "insensitive" } }
        : {}),
    };

    const [tenants, suppliers] = await Promise.all([
      this.prisma.tenant.findMany({
        where: tenantWhere,
        select: {
          id: true,
          name: true,
          companyVerificationStatus: true,
          companyVerifiedAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.supplier.findMany({
        where: supplierWhere,
        select: {
          id: true,
          companyName: true,
          companyVerificationStatus: true,
          companyVerifiedAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const merged = [
      ...tenants.map((t) => ({
        ownerType: "tenant" as const,
        id: t.id,
        name: t.name,
        status: t.companyVerificationStatus,
        verifiedAt: t.companyVerifiedAt?.toISOString() ?? null,
        updatedAt: t.updatedAt.toISOString(),
      })),
      ...suppliers.map((s) => ({
        ownerType: "supplier" as const,
        id: s.id,
        name: s.companyName,
        status: s.companyVerificationStatus,
        verifiedAt: s.companyVerifiedAt?.toISOString() ?? null,
        updatedAt: s.updatedAt.toISOString(),
      })),
    ];
    // PENDING'ler önce, sonra en son güncellenen.
    merged.sort((a, b) => {
      if (a.status === "PENDING" && b.status !== "PENDING") return -1;
      if (b.status === "PENDING" && a.status !== "PENDING") return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

    const total = merged.length;
    const items = merged.slice((page - 1) * pageSize, page * pageSize);
    return {
      items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async detail(ownerType: OwnerType, id: string) {
    const row =
      ownerType === "tenant"
        ? await this.prisma.tenant.findUnique({
            where: { id },
            select: { ...COMMON_SELECT, name: true },
          })
        : await this.prisma.supplier.findUnique({
            where: { id },
            select: { ...COMMON_SELECT, companyName: true },
          });
    if (!row) throw new NotFoundException("Firma bulunamadı");

    const docs = await this.companyDocs.getStatus({ type: ownerType, id });
    const name =
      "name" in row ? row.name : (row as { companyName: string }).companyName;
    return {
      ownerType,
      id: row.id,
      name,
      legalName: row.legalName,
      companyType: row.companyType,
      taxNumber: row.taxNumber,
      taxOffice: row.taxOffice,
      authorizedTckn: row.authorizedTckn,
      authorizedTitle: row.authorizedTitle,
      mersisNo: row.mersisNo,
      tradeRegistryNo: row.tradeRegistryNo,
      kepAddress: row.kepAddress,
      iban: row.iban,
      ibanHolder: row.ibanHolder,
      companyVerificationStatus: row.companyVerificationStatus,
      companyVerifiedAt: row.companyVerifiedAt?.toISOString() ?? null,
      docs: docs.docs,
      allUploaded: docs.allUploaded,
    };
  }

  async approve(ownerType: OwnerType, id: string, reviewerId: string) {
    const docs = await this.companyDocs.getStatus({ type: ownerType, id });
    if (!docs.allUploaded) {
      throw new BadRequestException(
        "Tüm zorunlu belgeler yüklenmeden onaylanamaz",
      );
    }
    await this.updateStatus(ownerType, id, "VERIFIED", new Date());
    void this.audit.log({
      action: "company.verification_approved",
      actorType: "admin",
      actorId: reviewerId,
      metadata: { ownerType, ownerId: id },
    });
    return { ok: true };
  }

  async reject(
    ownerType: OwnerType,
    id: string,
    reviewerId: string,
    reason: string,
  ) {
    await this.updateStatus(ownerType, id, "REJECTED", null);
    void this.audit.log({
      action: "company.verification_rejected",
      actorType: "admin",
      actorId: reviewerId,
      metadata: { ownerType, ownerId: id, reason },
    });
    return { ok: true };
  }

  private async updateStatus(
    ownerType: OwnerType,
    id: string,
    status: "VERIFIED" | "REJECTED",
    verifiedAt: Date | null,
  ) {
    const data = {
      companyVerificationStatus: status,
      companyVerifiedAt: verifiedAt,
    };
    if (ownerType === "tenant") {
      await this.prisma.tenant.update({ where: { id }, data });
    } else {
      await this.prisma.supplier.update({ where: { id }, data });
    }
  }
}
