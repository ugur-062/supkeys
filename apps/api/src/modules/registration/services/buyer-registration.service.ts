import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailQueue } from "../../email/email.queue";
import { CreateBuyerApplicationDto } from "../dto/create-buyer-application.dto";
import { generateRegistrationToken } from "../helpers/token.helper";

const BCRYPT_ROUNDS = 12;
const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat
const ACTIVE_STATUSES = ["PENDING_EMAIL_VERIFICATION", "PENDING_REVIEW"] as const;

@Injectable()
export class BuyerRegistrationService {
  private readonly logger = new Logger(BuyerRegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueue,
    private readonly config: ConfigService,
  ) {}

  async create(
    dto: CreateBuyerApplicationDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const adminEmail = dto.adminEmail.toLowerCase().trim();
    const taxNumber = dto.taxNumber.trim();

    // 1) E-posta zaten aktif tenant'a bağlı mı?
    const existingUser = await this.prisma.user.findUnique({
      where: { email: adminEmail },
    });
    if (existingUser) {
      throw new ConflictException("Bu e-posta zaten kayıtlı");
    }

    // 2) Bekleyen bir başvuru var mı?
    const activeApp = await this.prisma.buyerApplication.findFirst({
      where: {
        adminEmail,
        status: { in: [...ACTIVE_STATUSES] },
      },
    });
    if (activeApp) {
      throw new ConflictException(
        "Bu e-posta için bir başvurunuz zaten inceleniyor",
      );
    }

    // 3) Vergi numarası APPROVED bir tenant'ta mı?
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { taxNumber },
    });
    if (existingTenant) {
      throw new ConflictException(
        "Bu vergi numarası zaten bir firmaya kayıtlı",
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const emailToken = generateRegistrationToken();
    const emailTokenExp = new Date(Date.now() + EMAIL_TOKEN_TTL_MS);

    const created = await this.prisma.buyerApplication.create({
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
        `Buyer verification email enqueue failed for ${created.id}: ${
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
    const app = await this.prisma.buyerApplication.findUnique({
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
    const verifyUrl = `${webUrl.replace(/\/$/, "")}/register/verify-email?token=${token}&type=buyer`;

    await this.emailQueue.enqueue({
      to: { email: app.adminEmail, name: app.adminFirstName },
      templateData: {
        template: "buyer_email_verification",
        data: {
          firstName: app.adminFirstName,
          companyName: app.companyName,
          verifyUrl,
          expiresAt: app.emailTokenExp.toISOString(),
        },
      },
      context: { type: "buyer_application", id: app.id },
      subject: "E-posta adresinizi doğrulayın — Supkeys",
    });
  }
}
