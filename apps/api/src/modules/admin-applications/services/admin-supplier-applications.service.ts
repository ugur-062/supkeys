import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import type { Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { EmailService } from "../../email/email.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";
import { ListApplicationsDto } from "../dto/list-applications.dto";
import { RejectApplicationDto } from "../dto/reject-application.dto";

@Injectable()
export class AdminSupplierApplicationsService {
  private readonly logger = new Logger(AdminSupplierApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListApplicationsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SupplierApplicationWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { companyName: { contains: term, mode: "insensitive" } },
        { adminEmail: { contains: term, mode: "insensitive" } },
        { taxNumber: { contains: term } },
      ];
    }

    // Bug #1 fix: list response'unda büyük base64 alan dönmesin —
    // taxCertUrl ve passwordHash hariç tüm tablo sütunlarını seç.
    // Detail endpoint taxCertUrl'i tam halde döner.
    const [items, total] = await Promise.all([
      this.prisma.supplierApplication.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          companyName: true,
          companyType: true,
          taxNumber: true,
          taxOffice: true,
          industry: true,
          website: true,
          city: true,
          district: true,
          addressLine: true,
          postalCode: true,
          adminFirstName: true,
          adminLastName: true,
          adminEmail: true,
          adminPhone: true,
          emailVerifiedAt: true,
          reviewedAt: true,
          reviewedById: true,
          rejectionReason: true,
          invitationId: true,
          invitedByTenantId: true,
          supplierId: true,
          ipAddress: true,
          createdAt: true,
          updatedAt: true,
          reviewedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          invitedByTenant: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.supplierApplication.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string) {
    const app = await this.prisma.supplierApplication.findUnique({
      where: { id },
      include: {
        reviewedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        invitedByTenant: { select: { id: true, name: true, slug: true } },
        invitation: {
          select: {
            id: true,
            email: true,
            expiresAt: true,
            status: true,
          },
        },
        supplier: { select: { id: true, companyName: true } },
      },
    });
    if (!app) throw new NotFoundException("Başvuru bulunamadı");
    return app;
  }

  async stats() {
    const grouped = await this.prisma.supplierApplication.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const total = await this.prisma.supplierApplication.count();
    const byStatus = grouped.reduce(
      (acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      {} as Record<string, number>,
    );
    return { total, byStatus };
  }

  async approve(id: string, reviewerId: string) {
    const app = await this.prisma.supplierApplication.findUnique({
      where: { id },
      include: {
        invitedByTenant: { select: { name: true } },
        // V2-7 — Davet bir ihaleye bağlıysa onay sonrası tedarikçiyi o ihaleye ekle
        invitation: { select: { tenderId: true } },
      },
    });
    if (!app) throw new NotFoundException("Başvuru bulunamadı");
    if (app.status !== "PENDING_REVIEW") {
      throw new ConflictException(
        "Sadece e-posta doğrulamasını tamamlamış başvurular onaylanabilir",
      );
    }

    // Supabase Auth source-of-truth. Apply formundaki bcrypt hash artık
    // kullanılmıyor — random parola ile Supabase user yaratılır, sonra
    // sendPasswordResetEmail ile kullanıcı kendi parolasını kurar.
    const tempPassword = crypto.randomBytes(32).toString("base64url");
    const { authId } = await this.supabaseAuth.createUser(
      app.adminEmail,
      tempPassword,
      { role: "supplier_user", from_application: app.id },
    );

    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: {
          companyName: app.companyName,
          companyType: app.companyType,
          taxNumber: app.taxNumber,
          taxOffice: app.taxOffice,
          taxCertUrl: app.taxCertUrl,
          industry: app.industry,
          website: app.website,
          city: app.city,
          district: app.district,
          addressLine: app.addressLine,
          postalCode: app.postalCode,
          membership: "STANDARD",
        },
      });

      const supplierUser = await tx.supplierUser.create({
        data: {
          email: app.adminEmail,
          authId,
          passwordHash: null,
          firstName: app.adminFirstName,
          lastName: app.adminLastName,
          phone: app.adminPhone,
          supplierId: supplier.id,
        },
      });

      // V2-6 — register'da seçilen kategorileri SupplierCategory junction'a kopyala.
      // Geriye dönük uyum: eski Application kayıtlarında categoryIds null/undefined.
      const categoryIds = Array.isArray(app.categoryIds)
        ? (app.categoryIds as string[]).filter((id) => typeof id === "string")
        : [];
      if (categoryIds.length > 0) {
        await tx.supplierCategory.createMany({
          data: categoryIds.map((categoryId) => ({
            supplierId: supplier.id,
            categoryId,
          })),
          skipDuplicates: true,
        });
      }

      // Davetli ise tenant ile ilişkilendir
      if (app.invitedByTenantId) {
        await tx.supplierTenantRelation.upsert({
          where: {
            supplierId_tenantId: {
              supplierId: supplier.id,
              tenantId: app.invitedByTenantId,
            },
          },
          create: {
            supplierId: supplier.id,
            tenantId: app.invitedByTenantId,
            status: "ACTIVE",
          },
          update: { status: "ACTIVE" },
        });
      }

      // Davet kaydını güncelle
      if (app.invitationId) {
        await tx.supplierInvitation.update({
          where: { id: app.invitationId },
          data: {
            status: "ACCEPTED",
            acceptedAt: new Date(),
            acceptedBySupplierId: supplier.id,
          },
        });
      }

      // V2-7 — Davet bir ihaleye bağlıysa, onay sonrası tedarikçiyi o ihaleye
      // davetli yap (ihale hâlâ DRAFT/OPEN_FOR_BIDS ise; kapanmışsa atla).
      if (app.invitation?.tenderId) {
        const tenderId = app.invitation.tenderId;
        const tender = await tx.tender.findUnique({
          where: { id: tenderId },
          select: { status: true },
        });
        if (
          tender &&
          (tender.status === "OPEN_FOR_BIDS" || tender.status === "DRAFT")
        ) {
          await tx.tenderInvitation.upsert({
            where: { tenderId_supplierId: { tenderId, supplierId: supplier.id } },
            create: { tenderId, supplierId: supplier.id, status: "PENDING" },
            update: {},
          });
        }
      }

      const updatedApp = await tx.supplierApplication.update({
        where: { id: app.id },
        data: {
          status: "APPROVED",
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          supplierId: supplier.id,
          rejectionReason: null,
        },
      });

      return { supplier, supplierUser, application: updatedApp };
      });
    } catch (err) {
      try {
        await this.supabaseAuth.deleteUser(authId);
      } catch (cleanupErr) {
        this.logger.error(
          `Supplier approval rollback sonrası auth.users cleanup hatası (${authId}): ${
            cleanupErr instanceof Error ? cleanupErr.message : cleanupErr
          }`,
        );
      }
      throw err;
    }

    // Tedarikçinin kendi parolasını kurabilmesi için Supabase reset email.
    const webUrl = this.config.get<string>("WEB_URL", "http://localhost:3000");
    this.supabaseAuth
      .sendPasswordResetEmail(
        app.adminEmail,
        `${webUrl.replace(/\/$/, "")}/auth/reset-callback`,
      )
      .catch((err) => {
        this.logger.error(
          `Supplier approval reset email gönderilemedi (${app.adminEmail}): ${
            err instanceof Error ? err.message : err
          }`,
        );
      });

    this.dispatchApprovedEmail(app, app.invitedByTenant?.name ?? null).catch(
      (err) => {
        this.logger.error(
          `Supplier approved email enqueue failed (${app.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      },
    );

    void this.audit.log({
      action: "supplier.application_approved",
      actorType: "admin",
      actorId: reviewerId,
      entityType: "supplier_application",
      entityId: app.id,
      metadata: {
        supplierId: result.supplier.id,
        supplierUserId: result.supplierUser.id,
        email: app.adminEmail,
      },
    });

    return {
      supplierId: result.supplier.id,
      supplierUserId: result.supplierUser.id,
      message: "Başvuru onaylandı, tedarikçi ve kullanıcı oluşturuldu",
    };
  }

  async reject(id: string, reviewerId: string, dto: RejectApplicationDto) {
    const app = await this.prisma.supplierApplication.findUnique({
      where: { id },
    });
    if (!app) throw new NotFoundException("Başvuru bulunamadı");
    if (app.status === "APPROVED" || app.status === "REJECTED") {
      throw new ConflictException("Bu başvuru zaten sonuçlandırılmış");
    }

    await this.prisma.supplierApplication.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: dto.reason,
      },
    });

    void this.audit.log({
      action: "supplier.application_rejected",
      actorType: "admin",
      actorId: reviewerId,
      entityType: "supplier_application",
      entityId: app.id,
      metadata: { email: app.adminEmail, reason: dto.reason },
    });

    this.dispatchRejectedEmail(app, dto.reason).catch((err) => {
      this.logger.error(
        `Supplier rejected email enqueue failed (${app.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return { message: "Başvuru reddedildi" };
  }

  // ----------- email helpers -----------

  private async dispatchApprovedEmail(
    app: {
      id: string;
      adminFirstName: string;
      adminEmail: string;
      companyName: string;
    },
    invitedByTenantName: string | null,
  ) {
    const webUrl = this.config.get<string>("WEB_URL", "http://localhost:3000");
    await this.emailService.send({
      to: { email: app.adminEmail, name: app.adminFirstName },
      templateData: {
        template: "supplier_application_approved",
        data: {
          firstName: app.adminFirstName,
          companyName: app.companyName,
          loginUrl: `${webUrl.replace(/\/$/, "")}/supplier/login`,
          invitedByTenantName,
        },
      },
      context: { type: "supplier_application", id: app.id },
      subject: "🎉 Tedarikçi hesabınız aktif — Supkeys",
    });
  }

  private async dispatchRejectedEmail(
    app: {
      id: string;
      adminFirstName: string;
      adminEmail: string;
      companyName: string;
    },
    reason: string,
  ) {
    const supportEmail = this.config.get<string>(
      "EMAIL_REPLY_TO",
      "support@supkeys.com",
    );
    await this.emailService.send({
      to: { email: app.adminEmail, name: app.adminFirstName },
      templateData: {
        template: "application_rejected",
        data: {
          firstName: app.adminFirstName,
          companyName: app.companyName,
          applicantType: "supplier",
          rejectionReason: reason,
          supportEmail: supportEmail || "support@supkeys.com",
        },
      },
      context: { type: "supplier_application", id: app.id },
      subject: "Başvurunuz hakkında — Supkeys",
    });
  }
}
