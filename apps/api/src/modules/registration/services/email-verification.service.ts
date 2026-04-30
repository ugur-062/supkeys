import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
    await this.prisma.buyerApplication.update({
      where: { id: app.id },
      data: {
        emailVerifiedAt: now,
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
    };
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
