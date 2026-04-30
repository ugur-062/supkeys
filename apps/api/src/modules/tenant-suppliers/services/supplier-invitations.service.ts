import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailQueue } from "../../email/email.queue";
import {
  generateRegistrationToken,
  hashToken,
} from "../../registration/helpers/token.helper";
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

    // Plain token üret + hash sakla
    const plainToken = generateRegistrationToken();
    const tokenHash = hashToken(plainToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const invitation = await this.prisma.supplierInvitation.create({
      data: {
        tenantId,
        invitedByUserId: inviterUserId,
        email,
        contactName: dto.contactName?.trim(),
        message: dto.message?.trim(),
        tokenHash,
        expiresAt,
        status: "PENDING",
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
      message: "Davet gönderildi",
    };
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

  // ----------------- email helper -----------------

  private async dispatchInvitationEmail(
    invitation: {
      id: string;
      email: string;
      contactName: string | null;
      message: string | null;
      expiresAt: Date;
      tenant: { name: string };
      invitedByUser: { firstName: string; lastName: string };
    },
    plainToken: string,
  ) {
    const webUrl = this.config.get<string>("WEB_URL", "http://localhost:3000");
    const acceptUrl = `${webUrl.replace(/\/$/, "")}/register/supplier?invitation=${plainToken}`;

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
        },
      },
      context: { type: "supplier_invitation", id: invitation.id },
      subject: `${invitation.tenant.name} sizi tedarikçi olarak davet etti — Supkeys`,
    });
  }
}
