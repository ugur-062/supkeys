import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "node:crypto";
import { CompanyRole } from "@supkeys/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import {
  ALL_COMPANY_PERMISSIONS,
  type CompanyPermissionOverride,
  permissionsForRoles,
} from "../company-auth/permissions/company-permissions.constants";
import { PasswordResetService } from "../password-reset/password-reset.service";
import { SupabaseAuthService } from "../supabase-auth/supabase-auth.service";
import {
  InviteCompanyUserDto,
  UpdateUserPermissionsDto,
  UpdateUserRolesDto,
} from "./dto/company-user.dto";

@Injectable()
export class CompanyUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  async list(companyId: string) {
    const [users, company] = await Promise.all([
      this.prisma.companyUser.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { ownerUserId: true },
      }),
    ]);
    return users.map((u) => {
      const override =
        (u.permissionsOverride as CompanyPermissionOverride | null) ?? null;
      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        roles: u.roles,
        isOwner: company?.ownerUserId === u.id,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
        // Rol-varsayılan izinleri + override (UI toggle hesabı için).
        rolePermissions: [...permissionsForRoles(u.roles)],
        permissionsOverride: {
          added: override?.added ?? [],
          removed: override?.removed ?? [],
        },
      };
    });
  }

  /** Ekibe yeni kullanıcı ekle (admin parolayı belirler — email-davet follow-on). */
  async invite(actor: AuthenticatedCompanyUser, dto: InviteCompanyUserDto) {
    this.assertValidRoleCombo(dto.roles as CompanyRole[]);
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.companyUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) throw new ConflictException("Bu e-posta zaten kayıtlı");

    // Parola verilmezse e-posta daveti: rastgele parola + sıfırlama linki maili.
    const sendInvite = !dto.password;
    const password =
      dto.password ?? crypto.randomBytes(24).toString("base64url");

    const { authId } = await this.supabaseAuth.createUser(email, password, {
      type: "company",
    });
    try {
      const u = await this.prisma.companyUser.create({
        data: {
          email,
          authId,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          roles: dto.roles as CompanyRole[],
          companyId: actor.companyId,
          emailVerifiedAt: new Date(),
          invitedById: actor.userId,
          invitedAt: new Date(),
        },
      });
      if (sendInvite) {
        // Davet maili — kullanıcı linkten kendi parolasını belirler.
        await this.passwordReset.requestForCompany(email);
      }
      return { id: u.id, email: u.email, invited: sendInvite };
    } catch (e) {
      await this.supabaseAuth.deleteUser(authId);
      throw e;
    }
  }

  async updateRoles(
    actor: AuthenticatedCompanyUser,
    targetId: string,
    dto: UpdateUserRolesDto,
  ) {
    const target = await this.requireMember(actor.companyId, targetId);
    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { ownerUserId: true },
    });
    const roles = dto.roles as CompanyRole[];
    this.assertValidRoleCombo(roles);

    if (company?.ownerUserId === targetId && !roles.includes("YONETICI")) {
      throw new BadRequestException(
        "Firma sahibinin Yönetici rolü kaldırılamaz",
      );
    }
    await this.assertNotLastAdmin(actor.companyId, targetId, roles, target.roles);

    await this.prisma.companyUser.update({
      where: { id: targetId },
      data: { roles },
    });
    return { ok: true };
  }

  /** Kullanıcı bilgilerini güncelle (ad/soyad/telefon + roller). */
  async updateUser(
    actor: AuthenticatedCompanyUser,
    targetId: string,
    dto: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      roles?: CompanyRole[];
    },
  ) {
    const target = await this.requireMember(actor.companyId, targetId);
    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { ownerUserId: true },
    });
    const roles = dto.roles as CompanyRole[] | undefined;
    if (roles) {
      this.assertValidRoleCombo(roles);
      if (company?.ownerUserId === targetId && !roles.includes("YONETICI")) {
        throw new BadRequestException(
          "Firma sahibinin Yönetici rolü kaldırılamaz",
        );
      }
      await this.assertNotLastAdmin(
        actor.companyId,
        targetId,
        roles,
        target.roles,
      );
    }
    await this.prisma.companyUser.update({
      where: { id: targetId },
      data: {
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: dto.lastName.trim() }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(roles ? { roles } : {}),
      },
    });
    return { ok: true };
  }

  /** Kullanıcıyı pasif/aktif yap (soft-delete değil — listede kalır). */
  async setActive(
    actor: AuthenticatedCompanyUser,
    targetId: string,
    active: boolean,
  ) {
    await this.requireMember(actor.companyId, targetId);
    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { ownerUserId: true },
    });
    if (company?.ownerUserId === targetId) {
      throw new BadRequestException("Firma sahibi pasifleştirilemez");
    }
    if (targetId === actor.userId) {
      throw new BadRequestException("Kendinizi pasifleştiremezsiniz");
    }
    if (!active) {
      await this.assertNotLastAdmin(actor.companyId, targetId, [], null);
    }
    await this.prisma.companyUser.update({
      where: { id: targetId },
      data: { isActive: active },
    });
    return { ok: true };
  }

  /**
   * Kişi-bazlı izin override — yalnızca FİRMA SAHİBİ, başka kullanıcıların
   * rol-varsayılan izinlerini artırır/azaltır. Sahibin kendi izinleri kısıtlanamaz.
   */
  async updatePermissions(
    actor: AuthenticatedCompanyUser,
    targetId: string,
    dto: UpdateUserPermissionsDto,
  ) {
    if (!actor.isOwner) {
      throw new ForbiddenException(
        "İzinleri yalnızca firma sahibi düzenleyebilir",
      );
    }
    const target = await this.requireMember(actor.companyId, targetId);
    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { ownerUserId: true },
    });
    if (company?.ownerUserId === targetId) {
      throw new BadRequestException(
        "Firma sahibinin izinleri kısıtlanamaz (tüm yetkilere sahiptir)",
      );
    }

    // Anahtarları katalogla doğrula; geçersizleri reddet.
    const valid = new Set(ALL_COMPANY_PERMISSIONS);
    const clean = (arr: string[]) =>
      [...new Set(arr)].filter((k) => valid.has(k));
    const added = clean(dto.added);
    const removed = clean(dto.removed).filter((k) => !added.includes(k));
    const invalid = [...dto.added, ...dto.removed].filter((k) => !valid.has(k));
    if (invalid.length > 0) {
      throw new BadRequestException(`Geçersiz izin: ${invalid[0]}`);
    }

    // Rol-varsayılanıyla aynı sonucu veren override'ı sadeleştir:
    // - role'de OLAN izni added'dan düş (gereksiz), OLMAYAN izni removed'dan düş.
    const roleSet = permissionsForRoles(target.roles);
    const effectiveAdded = added.filter((k) => !roleSet.has(k));
    const effectiveRemoved = removed.filter((k) => roleSet.has(k));

    await this.prisma.companyUser.update({
      where: { id: targetId },
      data: {
        permissionsOverride: { added: effectiveAdded, removed: effectiveRemoved },
      },
    });
    return { ok: true };
  }

  /** İş çıkışı — soft delete (login engellenir, geçmiş korunur). */
  async remove(actor: AuthenticatedCompanyUser, targetId: string) {
    await this.requireMember(actor.companyId, targetId);
    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { ownerUserId: true },
    });
    if (company?.ownerUserId === targetId) {
      throw new BadRequestException(
        "Firma sahibi çıkarılamaz — önce sahipliği devredin",
      );
    }
    if (targetId === actor.userId) {
      throw new BadRequestException("Kendinizi çıkaramazsınız");
    }
    await this.assertNotLastAdmin(actor.companyId, targetId, [], null);

    await this.prisma.companyUser.update({
      where: { id: targetId },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Rol kombinasyon kuralı: bir kişiye tek rol atanır; istisna olarak yalnızca
   * Satın Almacı + Satışçı birlikte verilebilir. Yönetici ve Onaylayıcı tek başına.
   */
  private assertValidRoleCombo(roles: CompanyRole[]) {
    if (roles.length === 0) {
      throw new BadRequestException("En az bir rol seçin");
    }
    const hasExclusive = roles.some(
      (r) => r === "YONETICI" || r === "ONAYLAYICI",
    );
    if (hasExclusive && roles.length > 1) {
      throw new BadRequestException(
        "Yönetici veya Onaylayıcı tek başına atanır; yalnızca Satın Almacı ve Satışçı birlikte tanımlanabilir",
      );
    }
  }

  private async requireMember(companyId: string, userId: string) {
    const u = await this.prisma.companyUser.findFirst({
      where: { id: userId, companyId, deletedAt: null },
      select: { id: true, roles: true },
    });
    if (!u) throw new NotFoundException("Kullanıcı bulunamadı");
    return u;
  }

  /**
   * targetId'nin rolleri `newRoles`a değişir/çıkarılırsa firmada en az 1
   * YONETICI kalmalı.
   */
  private async assertNotLastAdmin(
    companyId: string,
    targetId: string,
    newRoles: CompanyRole[],
    _targetCurrentRoles: CompanyRole[] | null,
  ) {
    const targetStaysAdmin = newRoles.includes("YONETICI");
    if (targetStaysAdmin) return;
    const otherAdmins = await this.prisma.companyUser.count({
      where: {
        companyId,
        deletedAt: null,
        id: { not: targetId },
        roles: { has: "YONETICI" },
      },
    });
    if (otherAdmins === 0) {
      throw new BadRequestException(
        "Firmada en az bir Yönetici kalmalı",
      );
    }
  }
}
