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
   * `SupplierTenantRelation` (status=ACTIVE) oluşturur.
   *
   * Mimari karar (D.2.B sadeleştirmesi): Mevcut tedarikçi platform admin
   * tarafından zaten doğrulanmış olduğu için tenant tarafında ek bir onay
   * adımı gerekmez — ilişki direkt aktiftir. Alıcı tenant ve tedarikçi,
   * paralel iki bilgilendirme e-postası alır.
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

    const invitation = await this.findInvitation(dto);

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

    // Mevcut ilişki kontrolü — yeni akışta PENDING_TENANT_APPROVAL üretilmiyor
    // ama legacy datada hâlâ olabilir; orijinal mesajı koruyoruz.
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

    const result = await this.prisma.$transaction(async (tx) => {
      const relation = await tx.supplierTenantRelation.create({
        data: {
          supplierId,
          tenantId: invitation.tenantId,
          status: "ACTIVE",
        },
      });

      await tx.supplierInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedBySupplierId: supplierId,
          // Manual short code akışında openedAt boş kalmış olabilir
          openedAt: invitation.openedAt ?? new Date(),
        },
      });

      return { relation };
    });

    // Bilgilendirme e-postaları (fire-and-forget, paralel)
    this.notifyRelationEstablished(
      invitation.tenantId,
      supplierId,
      supplierUserId,
    ).catch((err) => {
      this.logger.error(
        `notifyRelationEstablished failed for relation ${result.relation.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return {
      relationId: result.relation.id,
      tenantId: invitation.tenantId,
      tenantName: invitation.tenantName,
      status: "ACTIVE" as const,
      message: `${invitation.tenantName} ile bağlantınız kuruldu! Profilinizde görüntüleyebilirsiniz.`,
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

  /**
   * 2 paralel bilgilendirme e-postası:
   *   - Alıcı tenant'ın aktif COMPANY_ADMIN'lerine "yeni tedarikçi eklendi"
   *   - Tedarikçi user'a "alıcı bağlantınız aktif"
   */
  private async notifyRelationEstablished(
    tenantId: string,
    supplierId: string,
    supplierUserId: string,
  ) {
    const [supplier, supplierUser, tenant, admins] = await Promise.all([
      this.prisma.supplier.findUnique({
        where: { id: supplierId },
        select: {
          companyName: true,
          taxNumber: true,
          city: true,
          industry: true,
        },
      }),
      this.prisma.supplierUser.findUnique({
        where: { id: supplierUserId },
        select: { email: true, firstName: true, lastName: true },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      }),
      this.prisma.user.findMany({
        where: { tenantId, role: "COMPANY_ADMIN", isActive: true },
        select: { email: true, firstName: true },
      }),
    ]);
    if (!supplier || !supplierUser || !tenant) return;

    const webUrl = this.config
      .get<string>("WEB_URL", "http://localhost:3000")
      .replace(/\/$/, "");

    const tedarikciDetayUrl = `${webUrl}/dashboard/tedarikciler?tab=approved`;
    const profileUrl = `${webUrl}/supplier/profil`;

    const tasks: Promise<unknown>[] = [];

    // Alıcı admin'lerine bilgi
    for (const admin of admins) {
      tasks.push(
        this.emailQueue.enqueue({
          to: { email: admin.email, name: admin.firstName },
          templateData: {
            template: "supplier_relation_established_buyer",
            data: {
              adminFirstName: admin.firstName,
              tenantName: tenant.name,
              supplierCompanyName: supplier.companyName,
              supplierTaxNumber: supplier.taxNumber,
              supplierCity: supplier.city,
              supplierIndustry: supplier.industry ?? null,
              supplierContactEmail: supplierUser.email,
              tedarikciDetayUrl,
            },
          },
          context: { type: "supplier_relation", id: tenantId },
          subject: `🤝 Yeni tedarikçi listenize eklendi: ${supplier.companyName}`,
        }),
      );
    }

    // Tedarikçiye bilgi
    tasks.push(
      this.emailQueue.enqueue({
        to: {
          email: supplierUser.email,
          name: `${supplierUser.firstName} ${supplierUser.lastName}`,
        },
        templateData: {
          template: "supplier_relation_established_supplier",
          data: {
            supplierUserName: `${supplierUser.firstName} ${supplierUser.lastName}`,
            tenantName: tenant.name,
            profileUrl,
          },
        },
        context: { type: "supplier_relation", id: supplierId },
        subject: `✓ ${tenant.name} ile bağlantınız aktif — Supkeys`,
      }),
    );

    await Promise.allSettled(tasks);
  }
}
