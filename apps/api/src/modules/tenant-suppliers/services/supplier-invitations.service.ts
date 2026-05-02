import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@supkeys/db";
import { renderEmail } from "@supkeys/email";
import { generateShortCode } from "@supkeys/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailQueue } from "../../email/email.queue";
import {
  generateRegistrationToken,
  hashToken,
} from "../../registration/helpers/token.helper";
import type {
  BatchInvitationResponse,
  BatchInvitationResult,
  BatchInvitationsDto,
  PreviewInvitationDto,
} from "../dto/batch-invitations.dto";
import { CreateInvitationDto } from "../dto/create-invitation.dto";
import { ListInvitationsDto } from "../dto/list-invitations.dto";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

@Injectable()
export class SupplierInvitationsService {
  private readonly logger = new Logger(SupplierInvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueue,
    private readonly config: ConfigService,
  ) {}

  async create(
    tenantId: string,
    inviterUserId: string,
    dto: CreateInvitationDto,
  ) {
    const email = dto.email.toLowerCase().trim();

    // Aynı tenant'tan aynı e-postaya bekleyen davet var mı?
    const existing = await this.prisma.supplierInvitation.findFirst({
      where: { tenantId, email, status: "PENDING" },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        "Bu e-posta için zaten bekleyen bir davetiniz var",
      );
    }

    // Mevcut tedarikçi tespiti — e-posta zaten aktif bir SupplierUser'a aitse,
    // davet "/supplier/login" branch'ine düşer ve manual short code görünür
    const detection = await this.detectExistingSupplier(email, tenantId);

    // Plain token + short code üret + hash sakla
    const plainToken = generateRegistrationToken();
    const tokenHash = hashToken(plainToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const shortCode = await this.generateUniqueShortCode();

    const invitation = await this.prisma.supplierInvitation.create({
      data: {
        tenantId,
        invitedByUserId: inviterUserId,
        email,
        contactName: dto.contactName?.trim(),
        message: dto.message?.trim(),
        tokenHash,
        shortCode,
        expiresAt,
        status: "PENDING",
        isExistingSupplier: detection.isExistingSupplier,
      },
      include: {
        tenant: { select: { name: true } },
        invitedByUser: { select: { firstName: true, lastName: true } },
      },
    });

    this.dispatchInvitationEmail(invitation, plainToken).catch((err) => {
      this.logger.error(
        `Supplier invitation email enqueue failed (${invitation.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return {
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      isExistingSupplier: invitation.isExistingSupplier,
      shortCode: invitation.shortCode,
      message: "Davet gönderildi",
    };
  }

  /**
   * E-postanın aktif bir SupplierUser'a ait olup olmadığını ve bu tenant ile
   * zaten bir ilişkisi olup olmadığını kontrol eder.
   *
   * - existingSupplier yok → `{ isExistingSupplier: false }`
   * - existingSupplier var, bu tenant ile ilişkisi yok → `{ isExistingSupplier: true }`
   * - existingSupplier var, ilişki var (ACTIVE/PENDING/BLOCKED) → ConflictException
   *
   * `throwOnExistingRelation: false` verilirse conflict atmaz; sadece flag döner
   * (batch akışında her e-posta için ayrı sebep raporlamak gerekir).
   */
  private async detectExistingSupplier(
    email: string,
    tenantId: string,
    options: { throwOnExistingRelation?: boolean } = {
      throwOnExistingRelation: true,
    },
  ): Promise<{
    isExistingSupplier: boolean;
    relationStatus?: "ACTIVE" | "PENDING_TENANT_APPROVAL" | "BLOCKED";
  }> {
    const supplierUser = await this.prisma.supplierUser.findUnique({
      where: { email },
      include: { supplier: { select: { id: true, isActive: true, isBlocked: true } } },
    });

    if (
      !supplierUser ||
      !supplierUser.supplier.isActive ||
      supplierUser.supplier.isBlocked
    ) {
      return { isExistingSupplier: false };
    }

    const relation = await this.prisma.supplierTenantRelation.findUnique({
      where: {
        supplierId_tenantId: {
          supplierId: supplierUser.supplierId,
          tenantId,
        },
      },
      select: { status: true },
    });

    if (relation && options.throwOnExistingRelation) {
      if (relation.status === "ACTIVE") {
        throw new ConflictException("Bu tedarikçi zaten onaylı listenizde");
      }
      if (relation.status === "PENDING_TENANT_APPROVAL") {
        throw new ConflictException(
          "Bu tedarikçi için bekleyen bir bağlantı talebi zaten var",
        );
      }
      throw new ConflictException(
        "Bu tedarikçiyi engellediniz, davet gönderemezsiniz",
      );
    }

    return {
      isExistingSupplier: true,
      relationStatus: relation?.status,
    };
  }

  /**
   * Crockford Base32 ile 8 karakterlik şifre üretir; collision durumunda
   * 5 deneme yapar. ~1 trilyon kombinasyon olduğu için pratikte ilk denemede
   * üretilir; retry sadece güvence amaçlı.
   */
  private async generateUniqueShortCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateShortCode();
      const exists = await this.prisma.supplierInvitation.findUnique({
        where: { shortCode: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
    }
    throw new InternalServerErrorException(
      "Davet kodu üretilemedi, lütfen tekrar deneyin",
    );
  }

  async list(tenantId: string, query: ListInvitationsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SupplierInvitationWhereInput = { tenantId };
    if (query.status) where.status = query.status;
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { email: { contains: term, mode: "insensitive" } },
        { contactName: { contains: term, mode: "insensitive" } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplierInvitation.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          contactName: true,
          message: true,
          status: true,
          sentCount: true,
          lastSentAt: true,
          expiresAt: true,
          acceptedAt: true,
          cancelledAt: true,
          createdAt: true,
          invitedByUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          acceptedBySupplier: {
            select: { id: true, companyName: true },
          },
        },
      }),
      this.prisma.supplierInvitation.count({ where }),
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

  async findOne(tenantId: string, id: string) {
    const invitation = await this.prisma.supplierInvitation.findFirst({
      where: { id, tenantId },
      include: {
        invitedByUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        acceptedBySupplier: { select: { id: true, companyName: true } },
        application: {
          select: { id: true, status: true, companyName: true },
        },
      },
    });
    if (!invitation) throw new NotFoundException("Davet bulunamadı");
    return invitation;
  }

  async resend(tenantId: string, id: string) {
    const invitation = await this.prisma.supplierInvitation.findFirst({
      where: { id, tenantId },
      include: {
        tenant: { select: { name: true } },
        invitedByUser: { select: { firstName: true, lastName: true } },
      },
    });
    if (!invitation) throw new NotFoundException("Davet bulunamadı");
    if (invitation.status !== "PENDING") {
      throw new ConflictException(
        "Sadece bekleyen davetler yeniden gönderilebilir",
      );
    }

    // Yeni token üret (eski hash invalide olur)
    const plainToken = generateRegistrationToken();
    const tokenHash = hashToken(plainToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const updated = await this.prisma.supplierInvitation.update({
      where: { id },
      data: {
        tokenHash,
        expiresAt,
        sentCount: { increment: 1 },
        lastSentAt: new Date(),
      },
      include: {
        tenant: { select: { name: true } },
        invitedByUser: { select: { firstName: true, lastName: true } },
      },
    });

    this.dispatchInvitationEmail(updated, plainToken).catch((err) => {
      this.logger.error(
        `Supplier invitation resend email failed (${id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return {
      id: updated.id,
      sentCount: updated.sentCount,
      expiresAt: updated.expiresAt,
      message: "Davet yeniden gönderildi",
    };
  }

  async cancel(tenantId: string, id: string) {
    const invitation = await this.prisma.supplierInvitation.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!invitation) throw new NotFoundException("Davet bulunamadı");
    if (invitation.status !== "PENDING") {
      throw new ConflictException(
        "Sadece bekleyen davetler iptal edilebilir",
      );
    }

    await this.prisma.supplierInvitation.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    return { message: "Davet iptal edildi" };
  }

  /**
   * Toplu davet — tek transaction değil, her e-posta bağımsız değerlendirilir.
   * Aynı e-posta için bekleyen davet veya aktif tedarikçi varsa bireysel hata
   * döner; geri kalanlar başarılı şekilde gönderilir.
   */
  async batch(
    tenantId: string,
    inviterUserId: string,
    dto: BatchInvitationsDto,
  ): Promise<BatchInvitationResponse> {
    // Normalize + dedupe
    const seen = new Set<string>();
    const emails = dto.emails
      .map((e) => e.toLowerCase().trim())
      .filter((e) => {
        if (!e || seen.has(e)) return false;
        seen.add(e);
        return true;
      });

    // Tenant + inviter bilgisini bir kez çek (e-posta render için)
    const inviter = await this.prisma.user.findUnique({
      where: { id: inviterUserId },
      select: {
        firstName: true,
        lastName: true,
        tenant: { select: { name: true } },
      },
    });
    if (!inviter) {
      throw new NotFoundException("Davet eden kullanıcı bulunamadı");
    }

    // Üç sorgu paralel:
    //  1) Aynı tenant'a aynı e-posta için PENDING davet
    //  2) Bu tenant ile ilişkili (her status: ACTIVE/PENDING/BLOCKED) → ALREADY_SUPPLIER
    //  3) E-posta var olan, aktif, engelli olmayan SupplierUser'a ait mi
    //     (ilişkisiz olanlar `isExistingSupplier=true` ile invitation oluşturur)
    const [existingInvites, existingRelations, existingSupplierUsers] =
      await this.prisma.$transaction([
        this.prisma.supplierInvitation.findMany({
          where: { tenantId, status: "PENDING", email: { in: emails } },
          select: { email: true },
        }),
        this.prisma.supplierUser.findMany({
          where: {
            email: { in: emails },
            supplier: { tenantRelations: { some: { tenantId } } },
          },
          select: { email: true },
        }),
        this.prisma.supplierUser.findMany({
          where: {
            email: { in: emails },
            isActive: true,
            supplier: { isActive: true, isBlocked: false },
          },
          select: { email: true },
        }),
      ]);
    const invitedEmails = new Set(existingInvites.map((r) => r.email));
    const supplierEmails = new Set(existingRelations.map((r) => r.email));
    const existingSupplierEmails = new Set(
      existingSupplierUsers.map((r) => r.email),
    );

    const results: BatchInvitationResult[] = [];

    for (const email of emails) {
      if (supplierEmails.has(email)) {
        results.push({ email, success: false, reason: "ALREADY_SUPPLIER" });
        continue;
      }
      if (invitedEmails.has(email)) {
        results.push({ email, success: false, reason: "ALREADY_INVITED" });
        continue;
      }

      const isExistingSupplier = existingSupplierEmails.has(email);
      const plainToken = generateRegistrationToken();
      const tokenHash = hashToken(plainToken);
      const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
      let shortCode: string;
      try {
        shortCode = await this.generateUniqueShortCode();
      } catch (err) {
        this.logger.error(
          `Short code generation failed for ${email}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        results.push({ email, success: false, reason: "ALREADY_INVITED" });
        continue;
      }

      try {
        const invitation = await this.prisma.supplierInvitation.create({
          data: {
            tenantId,
            invitedByUserId: inviterUserId,
            email,
            contactName: dto.contactName?.trim(),
            message: dto.message?.trim(),
            tokenHash,
            shortCode,
            expiresAt,
            status: "PENDING",
            isExistingSupplier,
          },
          include: {
            tenant: { select: { name: true } },
            invitedByUser: { select: { firstName: true, lastName: true } },
          },
        });

        results.push({
          email,
          success: true,
          invitationId: invitation.id,
        });

        this.dispatchInvitationEmail(invitation, plainToken).catch((err) => {
          this.logger.error(
            `Batch invitation email enqueue failed (${invitation.id}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
      } catch (err) {
        // Yarış koşulunda unique violation gelirse "zaten davetli" gibi sun
        this.logger.warn(
          `Batch invitation create failed for ${email}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        results.push({ email, success: false, reason: "ALREADY_INVITED" });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    return {
      results,
      summary: {
        total: results.length,
        success: successCount,
        failed: results.length - successCount,
      },
    };
  }

  /**
   * E-posta önizleme — gerçek bir SupplierInvitation oluşturmadan template'i
   * tenant adı + opsiyonel mesajla render eder. Frontend bunu iframe içinde
   * gösterir; davet token'ı `PREVIEW_TOKEN` placeholder'ıdır.
   */
  async previewInvitationEmail(
    tenantId: string,
    inviterUserId: string,
    dto: PreviewInvitationDto,
  ): Promise<{ html: string; subject: string }> {
    const inviter = await this.prisma.user.findUnique({
      where: { id: inviterUserId },
      select: {
        firstName: true,
        lastName: true,
        tenant: { select: { id: true, name: true } },
      },
    });
    if (!inviter || inviter.tenant?.id !== tenantId) {
      throw new NotFoundException("Tenant bulunamadı");
    }

    const webUrl = this.config.get<string>("WEB_URL", "http://localhost:3000");
    const acceptUrl = `${webUrl.replace(/\/$/, "")}/register/supplier?invitation=PREVIEW_TOKEN`;
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const rendered = await renderEmail({
      template: "supplier_invitation",
      data: {
        inviterTenantName: inviter.tenant.name,
        inviterUserName: `${inviter.firstName} ${inviter.lastName}`,
        contactName: dto.contactName?.trim() || null,
        message: dto.message?.trim() || null,
        acceptUrl,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return { html: rendered.html, subject: rendered.subject };
  }

  // ----------------- email helper -----------------

  /**
   * Mevcut tedarikçi: link `/supplier/login?next=/supplier/profil?invitation=<token>`
   * Yeni tedarikçi:    link `/register/supplier?invitation=<token>`
   */
  private buildInvitationAcceptUrl(
    plainToken: string,
    isExistingSupplier: boolean,
  ): string {
    const webUrl = this.config
      .get<string>("WEB_URL", "http://localhost:3000")
      .replace(/\/$/, "");
    if (isExistingSupplier) {
      const next = encodeURIComponent(
        `/supplier/profil?invitation=${plainToken}`,
      );
      return `${webUrl}/supplier/login?next=${next}`;
    }
    return `${webUrl}/register/supplier?invitation=${plainToken}`;
  }

  private async dispatchInvitationEmail(
    invitation: {
      id: string;
      email: string;
      contactName: string | null;
      message: string | null;
      expiresAt: Date;
      isExistingSupplier: boolean;
      shortCode: string | null;
      tenant: { name: string };
      invitedByUser: { firstName: string; lastName: string };
    },
    plainToken: string,
  ) {
    const acceptUrl = this.buildInvitationAcceptUrl(
      plainToken,
      invitation.isExistingSupplier,
    );

    await this.emailQueue.enqueue({
      to: {
        email: invitation.email,
        name: invitation.contactName ?? undefined,
      },
      templateData: {
        template: "supplier_invitation",
        data: {
          inviterTenantName: invitation.tenant.name,
          inviterUserName: `${invitation.invitedByUser.firstName} ${invitation.invitedByUser.lastName}`,
          contactName: invitation.contactName,
          message: invitation.message,
          acceptUrl,
          expiresAt: invitation.expiresAt.toISOString(),
          isExistingSupplier: invitation.isExistingSupplier,
          shortCode: invitation.shortCode,
        },
      },
      context: { type: "supplier_invitation", id: invitation.id },
      subject: invitation.isExistingSupplier
        ? `${invitation.tenant.name} sizinle yeni bir bağlantı kurmak istiyor — Supkeys`
        : `${invitation.tenant.name} sizi tedarikçi olarak davet etti — Supkeys`,
    });
  }
}
