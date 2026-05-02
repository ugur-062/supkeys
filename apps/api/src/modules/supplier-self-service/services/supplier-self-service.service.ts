import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { normalizeShortCode, validateShortCode } from "@supkeys/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailQueue } from "../../email/email.queue";
import { hashToken } from "../../registration/helpers/token.helper";
import { AcceptInvitationDto } from "../dto/accept-invitation.dto";

@Injectable()
export class SupplierSelfServiceService {
  private readonly logger = new Logger(SupplierSelfServiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueue,
    private readonly config: ConfigService,
  ) {}

  /**
   * Mevcut tedarikçi: aldığı davetin token'ını ya da kısa kodunu girerek
   * `SupplierTenantRelation` (status=PENDING_TENANT_APPROVAL) oluşturur.
   * Tenant tarafı sonra onaylar veya reddeder.
   */
  async acceptInvitation(
    supplierUserId: string,
    supplierId: string,
    supplierEmail: string,
    dto: AcceptInvitationDto,
  ) {
    if (!dto.invitationToken && !dto.shortCode) {
      throw new BadRequestException(
        "Davet token'ı veya kısa kod gerekli",
      );
    }

    // Davet kaydını bul
    const invitation = await this.findInvitation(dto);

    // Aşamalı doğrulama (kullanıcıya en açıklayıcı hata)
    if (invitation.status === "ACCEPTED") {
      throw new ConflictException("Bu davet zaten kullanılmış");
    }
    if (invitation.status === "CANCELLED") {
      throw new GoneException("Davet iptal edilmiş");
    }
    if (invitation.expiresAt < new Date()) {
      throw new GoneException("Davet süresi dolmuş");
    }
    if (!invitation.isExistingSupplier) {
      throw new BadRequestException(
        "Bu davet yeni tedarikçi kaydı için. Profilinizden kabul edilemez.",
      );
    }
    if (invitation.email.toLowerCase() !== supplierEmail.toLowerCase()) {
      throw new ForbiddenException(
        "Davet farklı bir e-postaya gönderilmiş, hesabınızla eşleşmiyor",
      );
    }

    // Aynı tenant ile ilişki var mı?
    const existingRelation = await this.prisma.supplierTenantRelation.findUnique({
      where: {
        supplierId_tenantId: {
          supplierId,
          tenantId: invitation.tenantId,
        },
      },
      select: { status: true },
    });
    if (existingRelation) {
      switch (existingRelation.status) {
        case "ACTIVE":
          throw new ConflictException(
            "Zaten bu alıcının onaylı tedarikçisisiniz",
          );
        case "PENDING_TENANT_APPROVAL":
          throw new ConflictException(
            "Bu alıcının onayı zaten bekleniyor",
          );
        case "BLOCKED":
          throw new ConflictException(
            "Bu alıcı tarafından engellenmişsiniz, talep gönderemezsiniz",
          );
      }
    }

    // Transaction: relation + invitation update
    const result = await this.prisma.$transaction(async (tx) => {
      const relation = await tx.supplierTenantRelation.create({
        data: {
          supplierId,
          tenantId: invitation.tenantId,
          status: "PENDING_TENANT_APPROVAL",
        },
      });

      await tx.supplierInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedBySupplierId: supplierId,
          // Açılma henüz kaydedilmediyse şimdi de kaydet (manual short code akışında doğal)
          openedAt: invitation.openedAt ?? new Date(),
        },
      });

      return { relation };
    });

    // Tenant tarafına bildirim — tüm aktif COMPANY_ADMIN'ler
    this.notifyTenantAdmins(invitation.tenantId, supplierId).catch((err) => {
      this.logger.error(
        `notifyTenantAdmins failed for relation ${result.relation.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return {
      relationId: result.relation.id,
      tenantId: invitation.tenantId,
      tenantName: invitation.tenantName,
      status: "PENDING_TENANT_APPROVAL" as const,
      message:
        "Bağlantı talebiniz alındı. Alıcı firma onayladığında haberdar olacaksınız.",
    };
  }

  // ---------- helpers ----------

  private async findInvitation(dto: AcceptInvitationDto) {
    if (dto.invitationToken) {
      const tokenHash = hashToken(dto.invitationToken);
      const invitation = await this.prisma.supplierInvitation.findUnique({
        where: { tokenHash },
        include: { tenant: { select: { name: true } } },
      });
      if (!invitation) throw new NotFoundException("Davet bulunamadı");
      return {
        id: invitation.id,
        tenantId: invitation.tenantId,
        tenantName: invitation.tenant.name,
        email: invitation.email,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        isExistingSupplier: invitation.isExistingSupplier,
        openedAt: invitation.openedAt,
      };
    }

    // shortCode path
    const normalized = normalizeShortCode(dto.shortCode!);
    if (!validateShortCode(normalized)) {
      throw new BadRequestException(
        "Geçerli bir davet kodu girin (örn: K7X9-3M2P)",
      );
    }
    const invitation = await this.prisma.supplierInvitation.findUnique({
      where: { shortCode: normalized },
      include: { tenant: { select: { name: true } } },
    });
    if (!invitation) throw new NotFoundException("Davet bulunamadı");
    return {
      id: invitation.id,
      tenantId: invitation.tenantId,
      tenantName: invitation.tenant.name,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      isExistingSupplier: invitation.isExistingSupplier,
      openedAt: invitation.openedAt,
    };
  }

  private async notifyTenantAdmins(tenantId: string, supplierId: string) {
    const [supplier, admins] = await Promise.all([
      this.prisma.supplier.findUnique({
        where: { id: supplierId },
        select: {
          companyName: true,
          taxNumber: true,
          city: true,
          industry: true,
        },
      }),
      this.prisma.user.findMany({
        where: { tenantId, role: "COMPANY_ADMIN", isActive: true },
        select: { email: true, firstName: true },
      }),
    ]);
    if (!supplier || admins.length === 0) return;

    const webUrl = this.config
      .get<string>("WEB_URL", "http://localhost:3000")
      .replace(/\/$/, "");
    const reviewUrl = `${webUrl}/dashboard/tedarikciler?tab=pending`;

    for (const admin of admins) {
      await this.emailQueue.enqueue({
        to: { email: admin.email, name: admin.firstName },
        templateData: {
          template: "supplier_relation_pending",
          data: {
            recipientFirstName: admin.firstName,
            supplierCompanyName: supplier.companyName,
            supplierTaxNumber: supplier.taxNumber,
            supplierCity: supplier.city,
            supplierIndustry: supplier.industry ?? null,
            reviewUrl,
          },
        },
        context: { type: "supplier_relation", id: tenantId },
        subject: `🤝 Yeni tedarikçi bağlantı talebi: ${supplier.companyName}`,
      });
    }
  }
}
