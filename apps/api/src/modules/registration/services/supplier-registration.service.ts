import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailQueue } from "../../email/email.queue";
import { CreateSupplierApplicationDto } from "../dto/create-supplier-application.dto";
import {
  generateRegistrationToken,
  hashToken,
} from "../helpers/token.helper";

const BCRYPT_ROUNDS = 12;
const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ["PENDING_EMAIL_VERIFICATION", "PENDING_REVIEW"] as const;

@Injectable()
export class SupplierRegistrationService {
  private readonly logger = new Logger(SupplierRegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueue,
    private readonly config: ConfigService,
  ) {}

  async create(
    dto: CreateSupplierApplicationDto,
    invitationToken: string | undefined,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const adminEmail = dto.adminEmail.toLowerCase().trim();
    const taxNumber = dto.taxNumber.trim();

    // 1) E-posta zaten aktif bir SupplierUser'a mı bağlı?
    const existingUser = await this.prisma.supplierUser.findUnique({
      where: { email: adminEmail },
    });
    if (existingUser) {
      throw new ConflictException("Bu e-posta zaten bir tedarikçide kayıtlı");
    }

    // 2) Bekleyen başvuru?
    const activeApp = await this.prisma.supplierApplication.findFirst({
      where: { adminEmail, status: { in: [...ACTIVE_STATUSES] } },
    });
    if (activeApp) {
      throw new ConflictException(
        "Bu e-posta için bir başvurunuz zaten inceleniyor",
      );
    }

    // 3) Vergi no APPROVED supplier'da mı?
    const existingSupplier = await this.prisma.supplier.findUnique({
      where: { taxNumber },
    });
    if (existingSupplier) {
      throw new ConflictException(
        "Bu vergi numarası zaten bir tedarikçiye kayıtlı",
      );
    }

    // 4) Davet token doğrulama
    let invitationId: string | undefined;
    let invitedByTenantId: string | undefined;

    if (invitationToken) {
      const tokenHash = hashToken(invitationToken);
      const invitation = await this.prisma.supplierInvitation.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          tenantId: true,
          status: true,
          expiresAt: true,
          email: true,
        },
      });

      if (!invitation) {
        throw new NotFoundException("Davet bağlantısı geçersiz");
      }
      if (invitation.status !== "PENDING") {
        throw new BadRequestException(
          "Davet bağlantısı kullanılamaz (iptal edilmiş veya kabul edilmiş)",
        );
      }
      if (invitation.expiresAt < new Date()) {
        throw new GoneException("Davet bağlantısının süresi dolmuş");
      }

      invitationId = invitation.id;
      invitedByTenantId = invitation.tenantId;
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const emailToken = generateRegistrationToken();
    const emailTokenExp = new Date(Date.now() + EMAIL_TOKEN_TTL_MS);

    const created = await this.prisma.supplierApplication.create({
      data: {
        companyName: dto.companyName.trim(),
        companyType: dto.companyType,
        taxNumber,
        taxOffice: dto.taxOffice.trim(),
        taxCertUrl: dto.taxCertUrl.trim(),
        industry: dto.industry?.trim(),
        website: dto.website?.trim(),
        city: dto.city.trim(),
        district: dto.district.trim(),
        addressLine: dto.addressLine.trim(),
        postalCode: dto.postalCode?.trim(),
        adminFirstName: dto.adminFirstName.trim(),
        adminLastName: dto.adminLastName.trim(),
        adminEmail,
        adminPhone: dto.adminPhone?.trim(),
        passwordHash,
        emailToken,
        emailTokenExp,
        status: "PENDING_EMAIL_VERIFICATION",
        invitationId,
        invitedByTenantId,
        ipAddress,
        userAgent,
      },
      select: {
        id: true,
        adminFirstName: true,
        adminEmail: true,
        companyName: true,
        emailTokenExp: true,
      },
    });

    this.dispatchVerificationEmail(
      { ...created, emailTokenExp },
      emailToken,
    ).catch((err) => {
      this.logger.error(
        `Supplier verification email enqueue failed for ${created.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return {
      id: created.id,
      message:
        "Başvurunuz alındı. E-postanıza gönderdiğimiz doğrulama bağlantısına 24 saat içinde tıklayın.",
      expiresAt: emailTokenExp,
    };
  }

  async getStatus(id: string) {
    const app = await this.prisma.supplierApplication.findUnique({
      where: { id },
      select: {
        status: true,
        reviewedAt: true,
        rejectionReason: true,
      },
    });
    if (!app) throw new NotFoundException("Başvuru bulunamadı");
    return app;
  }

  /**
   * Public: davet token'ından tedarikçiye davet eden tenant + kişi bilgisini
   * döner — /register/supplier sayfası formu prefil etmek için kullanır.
   */
  async getInvitationInfo(token: string) {
    const tokenHash = hashToken(token);
    const invitation = await this.prisma.supplierInvitation.findUnique({
      where: { tokenHash },
      select: {
        email: true,
        contactName: true,
        message: true,
        expiresAt: true,
        status: true,
        tenant: { select: { name: true } },
      },
    });

    if (!invitation) throw new NotFoundException("Davet bulunamadı");
    if (invitation.status === "ACCEPTED") {
      throw new ConflictException("Bu davet zaten kullanılmış");
    }
    if (invitation.status === "CANCELLED") {
      throw new GoneException("Davet iptal edilmiş");
    }
    if (invitation.expiresAt < new Date()) {
      throw new GoneException("Davet süresi dolmuş");
    }

    return {
      tenantName: invitation.tenant.name,
      email: invitation.email,
      contactName: invitation.contactName,
      message: invitation.message,
      expiresAt: invitation.expiresAt,
    };
  }

  private async dispatchVerificationEmail(
    app: {
      id: string;
      adminFirstName: string;
      adminEmail: string;
      companyName: string;
      emailTokenExp: Date;
    },
    token: string,
  ) {
    const webUrl = this.config.get<string>("WEB_URL", "http://localhost:3000");
    const verifyUrl = `${webUrl.replace(/\/$/, "")}/register/verify-email?token=${token}&type=supplier`;

    await this.emailQueue.enqueue({
      to: { email: app.adminEmail, name: app.adminFirstName },
      templateData: {
        template: "supplier_email_verification",
        data: {
          firstName: app.adminFirstName,
          companyName: app.companyName,
          verifyUrl,
          expiresAt: app.emailTokenExp.toISOString(),
        },
      },
      context: { type: "supplier_application", id: app.id },
      subject: "Tedarikçi başvurunuz için e-posta doğrulama — Supkeys",
    });
  }
}
