import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailQueue } from "../../email/email.queue";
import { ChangePasswordDto } from "../dto/change-password.dto";
import { InviteUserDto } from "../dto/invite-user.dto";
import {
  sanitizeNotificationPrefs,
  UpdateNotificationPrefsDto,
} from "../dto/notification-prefs.dto";
import { UpdateUserDto } from "../dto/update-user.dto";

const ROLE_LABELS: Record<string, string> = {
  COMPANY_ADMIN: "Firma Yöneticisi",
  BUYER: "Satın Almacı",
  APPROVER: "Onaylayıcı",
};

const INVITATION_TTL_DAYS = 7;
const BCRYPT_ROUNDS = 12;

@Injectable()
export class TenantUsersService {
  private readonly logger = new Logger(TenantUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueue,
    private readonly config: ConfigService,
  ) {}

  // ----- LIST + ME -----

  async list(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        invitedAt: true,
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
  }

  async getMe(userId: string): Promise<unknown> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        notificationPrefs: true,
        lastLoginAt: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            taxNumber: true,
            taxOffice: true,
            industry: true,
            city: true,
            district: true,
            addressLine: true,
            postalCode: true,
            buyerApplication: {
              select: { companyType: true, taxCertUrl: true },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException("Kullanıcı bulunamadı");

    // V2-6 — buyerApplication alt-nesnesini düzleştir (TenantUserMe.tenant'ta
    // companyType + taxCertUrl direkt erişilebilir olsun).
    if (user.tenant) {
      const { buyerApplication, ...rest } = user.tenant;
      return {
        ...user,
        tenant: {
          ...rest,
          companyType: buyerApplication?.companyType ?? null,
          taxCertUrl: buyerApplication?.taxCertUrl ?? null,
        },
      };
    }
    return user;
  }

  // ----- UPDATE -----

  async update(
    tenantId: string,
    targetUserId: string,
    callerUserId: string,
    dto: UpdateUserDto,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target || target.tenantId !== tenantId) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }

    const isSelf = targetUserId === callerUserId;
    if (!isSelf) {
      const caller = await this.prisma.user.findUnique({
        where: { id: callerUserId },
      });
      if (caller?.role !== "COMPANY_ADMIN") {
        throw new ForbiddenException(
          "Bu işlem için Firma Yöneticisi yetkisi gerekli",
        );
      }
    }

    // Self-update'te role/isActive değiştirilemez (controller strip eder
    // ama defansif olarak burada da bloklayalım)
    if (isSelf && (dto.role !== undefined || dto.isActive !== undefined)) {
      throw new ForbiddenException(
        "Kendi rolünüzü veya aktiflik durumunuzu değiştiremezsiniz",
      );
    }

    // Son COMPANY_ADMIN korumaları
    if (target.role === "COMPANY_ADMIN") {
      const wouldDeactivate = dto.isActive === false;
      const wouldDemote = dto.role !== undefined && dto.role !== "COMPANY_ADMIN";
      if (wouldDeactivate || wouldDemote) {
        const adminCount = await this.prisma.user.count({
          where: {
            tenantId,
            role: "COMPANY_ADMIN",
            isActive: true,
            id: { not: targetUserId },
          },
        });
        if (adminCount === 0) {
          throw new ConflictException(
            "En az bir aktif Firma Yöneticisi olmak zorunda",
          );
        }
      }
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
        isActive: dto.isActive,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
      },
    });
  }

  // ----- CHANGE PASSWORD -----

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException("Mevcut şifre yanlış");
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        "Yeni şifre eski şifreyle aynı olamaz",
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { success: true };
  }

  // ----- NOTIFICATION PREFS -----

  async updateNotificationPrefs(
    userId: string,
    dto: UpdateNotificationPrefsDto,
  ): Promise<{ notificationPrefs: unknown }> {
    const cleaned = sanitizeNotificationPrefs(dto.prefs);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { notificationPrefs: cleaned },
      select: { notificationPrefs: true },
    });
    return { notificationPrefs: user.notificationPrefs };
  }

  // ----- INVITATIONS -----

  async invite(tenantId: string, invitedById: string, dto: InviteUserDto) {
    const email = dto.email.trim().toLowerCase();

    // Aynı e-posta zaten kayıtlı user var mı?
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.tenantId === tenantId) {
        throw new ConflictException("Bu kullanıcı zaten ekibinizde");
      }
      throw new ConflictException("Bu e-posta başka bir hesaba kayıtlı");
    }

    // Aynı tenant'ta PENDING davet var mı?
    const pending = await this.prisma.userInvitation.findFirst({
      where: { tenantId, email, status: "PENDING" },
    });
    if (pending) {
      throw new ConflictException(
        "Bu e-postaya zaten bekleyen bir davet var",
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000,
    );

    const invitation = await this.prisma.userInvitation.create({
      data: {
        tenantId,
        email,
        role: dto.role,
        token,
        invitedById,
        expiresAt,
      },
      include: {
        tenant: { select: { name: true } },
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });

    // Fire-and-forget e-posta
    this.dispatchInvitationEmail(invitation).catch((err) =>
      this.logger.error(
        `User invitation email enqueue failed (${invitation.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  async listInvitations(tenantId: string) {
    return this.prisma.userInvitation.findMany({
      where: { tenantId, status: "PENDING" },
      include: {
        invitedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async cancelInvitation(tenantId: string, invitationId: string) {
    const inv = await this.prisma.userInvitation.findUnique({
      where: { id: invitationId },
    });
    if (!inv || inv.tenantId !== tenantId) {
      throw new NotFoundException("Davet bulunamadı");
    }
    if (inv.status !== "PENDING") {
      throw new ConflictException(
        "Sadece bekleyen davetler iptal edilebilir",
      );
    }
    return this.prisma.userInvitation.update({
      where: { id: invitationId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
      select: { id: true, status: true },
    });
  }

  async resendInvitation(tenantId: string, invitationId: string) {
    const inv = await this.prisma.userInvitation.findUnique({
      where: { id: invitationId },
      include: {
        tenant: { select: { name: true } },
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!inv || inv.tenantId !== tenantId) {
      throw new NotFoundException("Davet bulunamadı");
    }
    if (inv.status !== "PENDING") {
      throw new ConflictException(
        "Sadece bekleyen davetler tekrar gönderilebilir",
      );
    }

    const newExpiresAt = new Date(
      Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000,
    );
    const updated = await this.prisma.userInvitation.update({
      where: { id: invitationId },
      data: { expiresAt: newExpiresAt },
      include: {
        tenant: { select: { name: true } },
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });

    this.dispatchInvitationEmail(updated).catch((err) =>
      this.logger.error(
        `User invitation resend email failed (${updated.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );

    return { success: true, expiresAt: newExpiresAt };
  }

  // ----- private -----

  private async dispatchInvitationEmail(invitation: {
    id: string;
    email: string;
    role: string;
    token: string;
    expiresAt: Date;
    tenant: { name: string };
    invitedBy: { firstName: string; lastName: string };
  }) {
    const webUrl = this.config.get<string>(
      "WEB_URL",
      "http://localhost:3000",
    );
    const expiresInDays = Math.max(
      1,
      Math.ceil(
        (invitation.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000),
      ),
    );
    await this.emailQueue.enqueue({
      to: { email: invitation.email },
      templateData: {
        template: "user_invitation",
        data: {
          recipientEmail: invitation.email,
          tenantName: invitation.tenant.name,
          inviterName: `${invitation.invitedBy.firstName} ${invitation.invitedBy.lastName}`,
          role: invitation.role,
          roleLabel: ROLE_LABELS[invitation.role] ?? invitation.role,
          acceptUrl: `${webUrl.replace(/\/$/, "")}/accept-invite/${
            invitation.token
          }`,
          expiresInDays,
        },
      },
      context: { type: "user_invitation", id: invitation.id },
      subject: `👥 ${invitation.tenant.name} ekibine davet edildiniz — Supkeys`,
    });
  }
}
