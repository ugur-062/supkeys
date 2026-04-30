import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { generateSlug, uniqueSlug } from "@supkeys/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailQueue } from "../../email/email.queue";
import { VerifyEmailDto, VerifyEmailType } from "../dto/verify-email.dto";

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueue,
    private readonly config: ConfigService,
  ) {}

  async verify(dto: VerifyEmailDto) {
    if (dto.type === VerifyEmailType.BUYER) {
      return this.verifyBuyer(dto.token);
    }
    return this.verifySupplier(dto.token);
  }

  private async verifyBuyer(token: string) {
    const app = await this.prisma.buyerApplication.findUnique({
      where: { emailToken: token },
      include: {
        // Demo daveti üzerinden gelmiş mi? Varsa otomatik onayla
        fromDemoRequest: { select: { id: true } },
      },
    });

    if (!app) throw new NotFoundException("Doğrulama bağlantısı geçersiz");
    if (app.emailVerifiedAt) {
      throw new ConflictException("E-posta zaten doğrulanmış");
    }
    if (!app.emailTokenExp || app.emailTokenExp < new Date()) {
      throw new GoneException(
        "Doğrulama bağlantısının süresi dolmuş, lütfen yeniden başvurun",
      );
    }

    const fromDemo = !!app.fromDemoRequest;

    if (fromDemo) {
      // ----- Demo daveti ile geldi: otomatik onay (admin onayı atlanır) -----
      const baseSlug = generateSlug(app.companyName) || "firma";
      const slug = await uniqueSlug(baseSlug, async (candidate) => {
        const existing = await this.prisma.tenant.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        return existing !== null;
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
            emailVerifiedAt: new Date(),
            reviewedAt: new Date(),
            reviewedById: null, // sistem otomatik onayladı (demo daveti)
            tenantId: tenant.id,
            emailToken: null,
            rejectionReason: null,
          },
        });

        return { tenant, user, updated };
      });

      this.dispatchBuyerApprovedEmail(app).catch((err) => {
        this.logger.error(
          `Buyer auto-approved email enqueue failed (${app.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

      this.logger.log(
        `Buyer application ${app.id} auto-approved via demo invite (tenant=${result.tenant.id})`,
      );

      return {
        message:
          "E-posta doğrulandı, hesabınız aktif edildi! Şimdi giriş yapabilirsiniz.",
        applicationId: app.id,
        type: "buyer" as const,
        autoApproved: true,
        tenantId: result.tenant.id,
      };
    }

    // ----- Normal akış: admin review bekler -----
    await this.prisma.buyerApplication.update({
      where: { id: app.id },
      data: {
        emailVerifiedAt: new Date(),
        emailToken: null,
        status: "PENDING_REVIEW",
      },
    });

    this.dispatchAdminAlert("buyer", {
      applicationId: app.id,
      companyName: app.companyName,
      contactName: `${app.adminFirstName}`,
      contactEmail: app.adminEmail,
      contactPhone: app.adminPhone,
      taxNumber: app.taxNumber,
      city: app.city,
      industry: app.industry,
      invitedByTenantName: null,
    }).catch((err) => {
      this.logger.error(
        `Buyer admin alert enqueue failed (${app.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return {
      message: "E-posta doğrulandı, başvurunuz incelemeye alındı",
      applicationId: app.id,
      type: "buyer" as const,
      autoApproved: false,
    };
  }

  private async verifySupplier(token: string) {
    const app = await this.prisma.supplierApplication.findUnique({
      where: { emailToken: token },
      select: {
        id: true,
        status: true,
        emailTokenExp: true,
        emailVerifiedAt: true,
        adminFirstName: true,
        adminEmail: true,
        adminPhone: true,
        companyName: true,
        taxNumber: true,
        city: true,
        industry: true,
        invitedByTenant: { select: { name: true } },
      },
    });

    if (!app) throw new NotFoundException("Doğrulama bağlantısı geçersiz");
    if (app.emailVerifiedAt) {
      throw new ConflictException("E-posta zaten doğrulanmış");
    }
    if (!app.emailTokenExp || app.emailTokenExp < new Date()) {
      throw new GoneException(
        "Doğrulama bağlantısının süresi dolmuş, lütfen yeniden başvurun",
      );
    }

    const now = new Date();
    await this.prisma.supplierApplication.update({
      where: { id: app.id },
      data: {
        emailVerifiedAt: now,
        emailToken: null,
        status: "PENDING_REVIEW",
      },
    });

    this.dispatchAdminAlert("supplier", {
      applicationId: app.id,
      companyName: app.companyName,
      contactName: app.adminFirstName,
      contactEmail: app.adminEmail,
      contactPhone: app.adminPhone,
      taxNumber: app.taxNumber,
      city: app.city,
      industry: app.industry,
      invitedByTenantName: app.invitedByTenant?.name ?? null,
    }).catch((err) => {
      this.logger.error(
        `Supplier admin alert enqueue failed (${app.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return {
      message: "E-posta doğrulandı, başvurunuz incelemeye alındı",
      applicationId: app.id,
      type: "supplier" as const,
      autoApproved: false,
    };
  }

  private async dispatchBuyerApprovedEmail(app: {
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

  private async dispatchAdminAlert(
    applicantType: "buyer" | "supplier",
    payload: {
      applicationId: string;
      companyName: string;
      contactName: string;
      contactEmail: string;
      contactPhone?: string | null;
      taxNumber: string;
      city: string;
      industry?: string | null;
      invitedByTenantName?: string | null;
    },
  ) {
    const adminUrl = this.config.get<string>(
      "ADMIN_URL",
      "http://localhost:3001",
    );
    const reviewBase =
      applicantType === "supplier"
        ? "supplier-applications"
        : "buyer-applications";
    const reviewUrl = `${adminUrl.replace(/\/$/, "")}/admin/${reviewBase}?id=${payload.applicationId}`;

    const admins = await this.prisma.platformAdmin.findMany({
      where: { role: "SUPER_ADMIN", isActive: true },
      select: { email: true, firstName: true },
    });

    const template =
      applicantType === "supplier"
        ? "supplier_application_admin_alert"
        : "buyer_application_admin_alert";

    for (const admin of admins) {
      await this.emailQueue.enqueue({
        to: { email: admin.email, name: admin.firstName },
        templateData: {
          template,
          data: {
            applicationId: payload.applicationId,
            companyName: payload.companyName,
            contactName: payload.contactName,
            contactEmail: payload.contactEmail,
            contactPhone: payload.contactPhone,
            taxNumber: payload.taxNumber,
            city: payload.city,
            industry: payload.industry,
            invitedByTenantName: payload.invitedByTenantName,
            reviewUrl,
          },
        },
        context: {
          type: `${applicantType}_application`,
          id: payload.applicationId,
        },
        subject:
          applicantType === "supplier"
            ? `🔔 Yeni tedarikçi başvurusu: ${payload.companyName}`
            : `🔔 Yeni alıcı başvurusu: ${payload.companyName}`,
      });
    }
  }
}
