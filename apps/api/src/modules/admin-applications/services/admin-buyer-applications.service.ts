import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@supkeys/db";
import { generateSlug, uniqueSlug } from "@supkeys/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailQueue } from "../../email/email.queue";
import {
  ApplicationStatusDto,
  ListApplicationsDto,
} from "../dto/list-applications.dto";
import { RejectApplicationDto } from "../dto/reject-application.dto";

@Injectable()
export class AdminBuyerApplicationsService {
  private readonly logger = new Logger(AdminBuyerApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueue,
    private readonly config: ConfigService,
  ) {}

  async list(query: ListApplicationsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.BuyerApplicationWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { companyName: { contains: term, mode: "insensitive" } },
        { adminEmail: { contains: term, mode: "insensitive" } },
        { taxNumber: { contains: term } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.buyerApplication.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          reviewedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.buyerApplication.count({ where }),
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
    const app = await this.prisma.buyerApplication.findUnique({
      where: { id },
      include: {
        reviewedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        tenant: { select: { id: true, name: true, slug: true } },
        fromDemoRequest: {
          select: {
            id: true,
            companyName: true,
            contactName: true,
            email: true,
            status: true,
          },
        },
      },
    });
    if (!app) throw new NotFoundException("Başvuru bulunamadı");
    return app;
  }

  async stats() {
    const grouped = await this.prisma.buyerApplication.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const total = await this.prisma.buyerApplication.count();
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
    const app = await this.prisma.buyerApplication.findUnique({
      where: { id },
      include: { fromDemoRequest: { select: { id: true, status: true } } },
    });
    if (!app) throw new NotFoundException("Başvuru bulunamadı");
    if (app.status !== "PENDING_REVIEW") {
      throw new ConflictException(
        "Sadece e-posta doğrulamasını tamamlamış başvurular onaylanabilir",
      );
    }

    const baseSlug = generateSlug(app.companyName) || "firma";
    const slug = await uniqueSlug(baseSlug, async (candidate) => {
      const exists = await this.prisma.tenant.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return exists !== null;
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: app.companyName,
          slug,
          industry: app.industry,
          city: app.city,
          district: app.district,
          addressLine: app.addressLine,
          postalCode: app.postalCode,
          taxNumber: app.taxNumber,
          taxOffice: app.taxOffice,
        },
      });

      const user = await tx.user.create({
        data: {
          email: app.adminEmail,
          passwordHash: app.passwordHash,
          firstName: app.adminFirstName,
          lastName: app.adminLastName,
          role: "COMPANY_ADMIN",
          tenantId: tenant.id,
        },
      });

      const updated = await tx.buyerApplication.update({
        where: { id: app.id },
        data: {
          status: "APPROVED",
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          tenantId: tenant.id,
          rejectionReason: null,
        },
      });

      // Demo davet ile gelen başvuru onaylandığında bağlı DemoRequest'i WON'a geçir
      // (closedAt henüz dolmadıysa onu da set et, demo-requests.service.update ile
      // tutarlı kalsın)
      if (app.fromDemoRequest && app.fromDemoRequest.status !== "WON") {
        await tx.demoRequest.update({
          where: { id: app.fromDemoRequest.id },
          data: { status: "WON", closedAt: new Date() },
        });
      }

      return { tenant, user, application: updated };
    });

    this.dispatchApprovedEmail(app).catch((err) => {
      this.logger.error(
        `Buyer approved email enqueue failed (${app.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return {
      tenantId: result.tenant.id,
      tenantSlug: result.tenant.slug,
      userId: result.user.id,
      message: "Başvuru onaylandı, tenant ve kullanıcı oluşturuldu",
    };
  }

  async reject(id: string, reviewerId: string, dto: RejectApplicationDto) {
    const app = await this.prisma.buyerApplication.findUnique({
      where: { id },
    });
    if (!app) throw new NotFoundException("Başvuru bulunamadı");
    if (app.status === "APPROVED" || app.status === "REJECTED") {
      throw new ConflictException(
        "Bu başvuru zaten sonuçlandırılmış",
      );
    }

    await this.prisma.buyerApplication.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: dto.reason,
      },
    });

    this.dispatchRejectedEmail(app, dto.reason).catch((err) => {
      this.logger.error(
        `Buyer rejected email enqueue failed (${app.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return { message: "Başvuru reddedildi" };
  }

  // ----------- email helpers -----------

  private async dispatchApprovedEmail(app: {
    id: string;
    adminFirstName: string;
    adminEmail: string;
    companyName: string;
  }) {
    const webUrl = this.config.get<string>("WEB_URL", "http://localhost:3000");
    await this.emailQueue.enqueue({
      to: { email: app.adminEmail, name: app.adminFirstName },
      templateData: {
        template: "buyer_application_approved",
        data: {
          firstName: app.adminFirstName,
          companyName: app.companyName,
          loginUrl: `${webUrl.replace(/\/$/, "")}/login`,
        },
      },
      context: { type: "buyer_application", id: app.id },
      subject: "🎉 Hesabınız aktif — Supkeys",
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
    await this.emailQueue.enqueue({
      to: { email: app.adminEmail, name: app.adminFirstName },
      templateData: {
        template: "application_rejected",
        data: {
          firstName: app.adminFirstName,
          companyName: app.companyName,
          applicantType: "buyer",
          rejectionReason: reason,
          supportEmail: supportEmail || "support@supkeys.com",
        },
      },
      context: { type: "buyer_application", id: app.id },
      subject: "Başvurunuz hakkında — Supkeys",
    });
  }
}

// ApplicationStatusDto used in DTO file already
export { ApplicationStatusDto };
