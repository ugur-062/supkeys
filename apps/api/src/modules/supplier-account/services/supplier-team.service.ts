import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailService } from "../../email/email.service";
import type { InviteTeamMemberDto } from "../dto/invite-team-member.dto";

const INVITATION_TTL_DAYS = 7;

/**
 * Ekip — tedarikçi firmasının çalışan davetleri (rolsüz, herkes eşit).
 * Aynı firmanın her aktif kullanıcısı davet edebilir / üye çıkarabilir.
 */
@Injectable()
export class SupplierTeamService {
  private readonly logger = new Logger(SupplierTeamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async listTeam(supplierId: string, currentUserId: string) {
    const users = await this.prisma.supplierUser.findMany({
      where: { supplierId },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    return users.map((u) => ({ ...u, isYou: u.id === currentUserId }));
  }

  async listInvitations(supplierId: string) {
    const rows = await this.prisma.supplierUserInvitation.findMany({
      where: { supplierId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });
    return rows.map((inv) => ({
      id: inv.id,
      email: inv.email,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      invitedBy: inv.invitedBy,
    }));
  }

  async invite(
    supplierId: string,
    invitedById: string,
    dto: InviteTeamMemberDto,
  ) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.supplierUser.findUnique({
      where: { email },
    });
    if (existing) {
      if (existing.supplierId === supplierId) {
        throw new ConflictException("Bu kullanıcı zaten ekibinizde");
      }
      throw new ConflictException("Bu e-posta başka bir hesaba kayıtlı");
    }

    const pending = await this.prisma.supplierUserInvitation.findFirst({
      where: { supplierId, email, status: "PENDING" },
    });
    if (pending) {
      throw new ConflictException("Bu e-postaya zaten bekleyen bir davet var");
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000,
    );

    const invitation = await this.prisma.supplierUserInvitation.create({
      data: { supplierId, email, token, invitedById, expiresAt },
      include: {
        supplier: { select: { companyName: true } },
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });

    this.dispatchInvitationEmail(invitation).catch((err) =>
      this.logger.error(
        `Supplier team invitation email failed (${invitation.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );

    return {
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  async resendInvitation(supplierId: string, id: string) {
    const inv = await this.prisma.supplierUserInvitation.findFirst({
      where: { id, supplierId },
    });
    if (!inv) throw new NotFoundException("Davet bulunamadı");
    if (inv.status !== "PENDING") {
      throw new BadRequestException("Sadece bekleyen davetler tekrar gönderilebilir");
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000,
    );

    const updated = await this.prisma.supplierUserInvitation.update({
      where: { id },
      data: { token, expiresAt },
      include: {
        supplier: { select: { companyName: true } },
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });

    this.dispatchInvitationEmail(updated).catch((err) =>
      this.logger.error(
        `Supplier team invitation resend failed (${updated.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );

    return { id: updated.id, expiresAt: updated.expiresAt };
  }

  async revokeInvitation(supplierId: string, id: string) {
    const inv = await this.prisma.supplierUserInvitation.findFirst({
      where: { id, supplierId },
    });
    if (!inv) throw new NotFoundException("Davet bulunamadı");
    if (inv.status !== "PENDING") {
      throw new BadRequestException("Sadece bekleyen davetler iptal edilebilir");
    }
    await this.prisma.supplierUserInvitation.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    return { id };
  }

  async removeMember(
    supplierId: string,
    currentUserId: string,
    targetId: string,
  ) {
    if (targetId === currentUserId) {
      throw new BadRequestException("Kendinizi ekipten çıkaramazsınız");
    }
    const target = await this.prisma.supplierUser.findFirst({
      where: { id: targetId, supplierId },
      select: { id: true, isActive: true },
    });
    if (!target) throw new NotFoundException("Ekip üyesi bulunamadı");
    if (!target.isActive) {
      throw new BadRequestException("Üye zaten pasif durumda");
    }

    const activeCount = await this.prisma.supplierUser.count({
      where: { supplierId, isActive: true },
    });
    if (activeCount <= 1) {
      throw new ForbiddenException("Son aktif ekip üyesi çıkarılamaz");
    }

    await this.prisma.supplierUser.update({
      where: { id: targetId },
      data: { isActive: false },
    });
    return { id: targetId };
  }

  private async dispatchInvitationEmail(invitation: {
    id: string;
    email: string;
    token: string;
    expiresAt: Date;
    supplier: { companyName: string };
    invitedBy: { firstName: string; lastName: string };
  }) {
    const webUrl = this.config.get<string>("WEB_URL", "http://localhost:3000");
    const expiresInDays = Math.max(
      1,
      Math.ceil(
        (invitation.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000),
      ),
    );
    await this.emailService.send({
      to: { email: invitation.email },
      templateData: {
        template: "user_invitation",
        data: {
          recipientEmail: invitation.email,
          tenantName: invitation.supplier.companyName,
          inviterName: `${invitation.invitedBy.firstName} ${invitation.invitedBy.lastName}`,
          role: "MEMBER",
          roleLabel: "Ekip Üyesi",
          acceptUrl: `${webUrl.replace(/\/$/, "")}/supplier/accept-invite/${
            invitation.token
          }`,
          expiresInDays,
        },
      },
      context: { type: "user_invitation", id: invitation.id },
      subject: `👥 ${invitation.supplier.companyName} ekibine davet edildiniz — Supkeys`,
    });
  }
}
