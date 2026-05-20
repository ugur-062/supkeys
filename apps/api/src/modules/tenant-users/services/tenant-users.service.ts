import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  ALL_PERMISSIONS,
  FORBIDDEN_PERMISSIONS_BY_ROLE,
  PERMISSION_LABELS,
} from "../../auth/permissions/permissions.constants";
import { resolveUserPermissions } from "../../auth/permissions/permissions.utils";
import { EmailService } from "../../email/email.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";
import { ChangePasswordDto } from "../dto/change-password.dto";
import { InviteUserDto } from "../dto/invite-user.dto";
import {
  sanitizeNotificationPrefs,
  UpdateNotificationPrefsDto,
} from "../dto/notification-prefs.dto";
import { UpdateUserDto } from "../dto/update-user.dto";

const ROLE_LABELS: Record<string, string> = {
  COMPANY_ADMIN: "Yönetici",
  BUYER: "Satın Almacı",
  APPROVER: "Onaylayıcı",
};

const INVITATION_TTL_DAYS = 7;

// V2-6.5 — BUYER kontenjan exclude opsiyonu: bir kullanıcı zaten
// BUYER'sa ve rolünü güncellerken kendisini saymak istemiyorsak excludeUserId
// veriyoruz. Davet için sadece active+pending sayılır.
interface BuyerSeatExclude {
  excludeUserId?: string;
}

@Injectable()
export class TenantUsersService {
  private readonly logger = new Logger(TenantUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  // ----- LIST + ME -----

  async list(tenantId: string): Promise<unknown[]> {
    const rows = await this.prisma.user.findMany({
      // V2-6.5 — soft-delete edilen kullanıcılar listede gözükmez
      where: { tenantId, deletedAt: null },
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
        permissionsOverride: true,
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
    // V2-6.5 — Her satıra efektif permission listesi + override flag ekle
    return rows.map((u) => ({
      ...u,
      permissions: resolveUserPermissions(u.role, u.permissionsOverride),
      hasCustomPermissions: u.permissionsOverride !== null,
    }));
  }

  async findById(tenantId: string, userId: string): Promise<unknown> {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
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
        permissionsOverride: true,
      },
    });
    if (!u) throw new NotFoundException("Kullanıcı bulunamadı");
    return {
      ...u,
      permissions: resolveUserPermissions(u.role, u.permissionsOverride),
      hasCustomPermissions: u.permissionsOverride !== null,
    };
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
        permissionsOverride: true,
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

    // V2-6.5 — efektif permission listesi (saf role default veya override sonrası)
    const permissions = resolveUserPermissions(
      user.role,
      user.permissionsOverride,
    );

    // V2-6 — buyerApplication alt-nesnesini düzleştir (TenantUserMe.tenant'ta
    // companyType + taxCertUrl direkt erişilebilir olsun).
    if (user.tenant) {
      const { buyerApplication, ...rest } = user.tenant;
      return {
        ...user,
        permissions,
        hasCustomPermissions: user.permissionsOverride !== null,
        tenant: {
          ...rest,
          companyType: buyerApplication?.companyType ?? null,
          taxCertUrl: buyerApplication?.taxCertUrl ?? null,
        },
      };
    }
    return user;
  }

  // ----- BUYER KONTENJANI -----

  /**
   * V2-6.5 — Tenant'ın BUYER kontenjan kullanımı:
   *   used = aktif BUYER user'lar + bekleyen BUYER davetleri
   *   limit = tenant.buyerSeatLimit
   *
   * Sadece role = "BUYER" sayılır. COMPANY_ADMIN ve APPROVER sınırsızdır.
   * excludeUserId: rol değişiminde, hedef kullanıcı zaten BUYER ise kendini
   * say(ma)mak için kullanılır.
   */
  async getBuyerSeatUsage(tenantId: string, opts: BuyerSeatExclude = {}) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { buyerSeatLimit: true },
    });
    if (!tenant) throw new NotFoundException("Firma bulunamadı");

    const [active, pending] = await Promise.all([
      this.prisma.user.count({
        where: {
          tenantId,
          role: "BUYER",
          isActive: true,
          deletedAt: null,
          ...(opts.excludeUserId ? { id: { not: opts.excludeUserId } } : {}),
        },
      }),
      this.prisma.userInvitation.count({
        where: { tenantId, role: "BUYER", status: "PENDING" },
      }),
    ]);

    return {
      active,
      pending,
      used: active + pending,
      limit: tenant.buyerSeatLimit,
      available: Math.max(0, tenant.buyerSeatLimit - (active + pending)),
    };
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
          "Bu işlem için Yönetici yetkisi gerekli",
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

    // V2-6.5 — BUYER kontenjan kontrolü: rol BUYER'a yükseltiliyorsa
    // mevcut kullanım + 1 limiti aşıyor mu? (kullanıcı zaten BUYER ise atla)
    if (
      dto.role === "BUYER" &&
      target.role !== "BUYER" &&
      dto.isActive !== false
    ) {
      const usage = await this.getBuyerSeatUsage(tenantId, {
        excludeUserId: target.id,
      });
      if (usage.used >= usage.limit) {
        throw new ConflictException(
          `Satın Almacı kontenjanı dolu (${usage.used}/${usage.limit}). ` +
            `Daha fazla satın almacı eklemek için firma yöneticinizden kontenjan artırımı talep edin.`,
        );
      }
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
            "En az bir aktif Yönetici olmak zorunda",
          );
        }
      }
    }

    // V2-6.5 — permissionsOverride: self-update'te değiştirilemez (kullanıcı
    // kendi yetkilerini boost edemez). Sadece admin başkasını yetkilendirebilir.
    if (dto.permissionsOverride !== undefined && isSelf) {
      throw new ForbiddenException(
        "Kendi yetkilerinizi düzenleyemezsiniz",
      );
    }

    // permissionsOverride validation — added/removed her permission ALL_PERMISSIONS içinde mi?
    let normalizedOverride: { added?: string[]; removed?: string[] } | null | undefined =
      undefined;
    if (dto.permissionsOverride === null) {
      normalizedOverride = null; // saf default'a dön
    } else if (dto.permissionsOverride !== undefined) {
      const ov = dto.permissionsOverride;
      const allKeys = [...(ov.added ?? []), ...(ov.removed ?? [])];
      const invalid = allKeys.filter((k) => !ALL_PERMISSIONS.includes(k));
      if (invalid.length > 0) {
        throw new BadRequestException(
          `Geçersiz yetki: ${invalid.join(", ")}`,
        );
      }

      // V2-6.5 fix — Role bazında yasak izin kontrolü. COMPANY_ADMIN'e
      // tender:create gibi yetkiler override.added ile verilemez.
      const effectiveRole = dto.role ?? target.role;
      const forbiddenForRole = FORBIDDEN_PERMISSIONS_BY_ROLE[effectiveRole] ?? [];
      const violations = (ov.added ?? []).filter((p) =>
        forbiddenForRole.includes(p),
      );
      if (violations.length > 0) {
        const labels = violations
          .map((p) => PERMISSION_LABELS[p]?.tr ?? p)
          .join(", ");
        throw new BadRequestException(
          `${ROLE_LABELS[effectiveRole] ?? effectiveRole} rolüne şu yetkiler verilemez: ${labels}`,
        );
      }

      // Hem added hem removed boşsa null olarak sakla (saf default)
      if (
        (ov.added ?? []).length === 0 &&
        (ov.removed ?? []).length === 0
      ) {
        normalizedOverride = null;
      } else {
        normalizedOverride = {
          ...(ov.added && ov.added.length > 0 ? { added: ov.added } : {}),
          ...(ov.removed && ov.removed.length > 0
            ? { removed: ov.removed }
            : {}),
        };
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
        isActive: dto.isActive,
        ...(normalizedOverride === null
          ? { permissionsOverride: Prisma.JsonNull }
          : normalizedOverride !== undefined
            ? {
                permissionsOverride:
                  normalizedOverride as unknown as Prisma.InputJsonValue,
              }
            : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        permissionsOverride: true,
      },
    });
    return {
      ...updated,
      permissions: resolveUserPermissions(updated.role, updated.permissionsOverride),
      hasCustomPermissions: updated.permissionsOverride !== null,
    };
  }

  // ----- DELETE (soft-delete + anonymize) -----

  /**
   * V2-6.5 — Firma yöneticisi kullanıcıyı ekipten çıkarır. Soft-delete:
   *   - deletedAt = now
   *   - isActive = false
   *   - email + isim anonimleştirilir (KVKK + e-posta yeniden kullanılabilir)
   * Tender/Order/ApprovalRequest referansları KIRILMAZ.
   *
   * Kurallar:
   *   - Self-delete yasak (caller hedefiyle aynı olamaz)
   *   - Hedef zaten silinmişse 404 (idempotent değil — UI zaten gizler)
   *   - Hedef son aktif COMPANY_ADMIN ise reddet
   *   - Yetki: caller COMPANY_ADMIN olmalı (controller'da RolesGuard ile)
   */
  async delete(tenantId: string, targetUserId: string, callerUserId: string) {
    if (targetUserId === callerUserId) {
      throw new ForbiddenException("Kendinizi silemezsiniz");
    }

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, tenantId, deletedAt: null },
      select: { id: true, role: true, email: true },
    });
    if (!target) throw new NotFoundException("Kullanıcı bulunamadı");

    // Son aktif COMPANY_ADMIN'i silemez
    if (target.role === "COMPANY_ADMIN") {
      const others = await this.prisma.user.count({
        where: {
          tenantId,
          role: "COMPANY_ADMIN",
          isActive: true,
          deletedAt: null,
          id: { not: targetUserId },
        },
      });
      if (others === 0) {
        throw new ConflictException(
          "En az bir aktif Yönetici olmak zorunda",
        );
      }
    }

    // Anonimleştir: e-postayı invalid bir formata çevir ki başka kullanıcı
    // aynı e-postayla davet edilebilsin. unique constraint korunur.
    const now = new Date();
    const anonymizedEmail = `deleted-${targetUserId}@supkeys.local`;

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        deletedAt: now,
        isActive: false,
        email: anonymizedEmail,
        firstName: "Silinmiş",
        lastName: "Kullanıcı",
        phone: null,
        // Token-equivalent hash bırakılır (zaten isActive=false login'i bloklar)
      },
    });

    this.logger.log(
      `User ${targetUserId} (${target.email}) soft-deleted by ${callerUserId} in tenant ${tenantId}`,
    );

    return { success: true };
  }

  // ----- CHANGE PASSWORD -----

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.authId) throw new NotFoundException();

    // Mevcut şifre Supabase Auth üzerinden doğrulanır (source-of-truth).
    try {
      await this.supabaseAuth.verifyPassword(user.email, dto.currentPassword);
    } catch {
      throw new BadRequestException("Mevcut şifre yanlış");
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException("Yeni şifre eski şifreyle aynı olamaz");
    }

    await this.supabaseAuth.updatePassword(user.authId, dto.newPassword);
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

    // V2-6.5 — BUYER kontenjan kontrolü: rol BUYER ise mevcut kullanım +
    // bekleyen davetler kontenjanı aşıyor mu?
    if (dto.role === "BUYER") {
      const usage = await this.getBuyerSeatUsage(tenantId);
      if (usage.used >= usage.limit) {
        throw new ConflictException(
          `Satın Almacı kontenjanı dolu (${usage.used}/${usage.limit}). ` +
            `Daha fazla satın almacı davet etmek için kontenjan artırımı talep edin.`,
        );
      }
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
    await this.emailService.send({
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
