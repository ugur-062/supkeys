import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "node:crypto";
import { CompanyRole } from "@supkeys/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { PasswordResetService } from "../password-reset/password-reset.service";
import { SupabaseAuthService } from "../supabase-auth/supabase-auth.service";
import {
  InviteCompanyUserDto,
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
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      roles: u.roles,
      isOwner: company?.ownerUserId === u.id,
      isActive: u.isActive,
    }));
  }

  /** Ekibe yeni kullanıcı ekle (admin parolayı belirler — email-davet follow-on). */
  async invite(actor: AuthenticatedCompanyUser, dto: InviteCompanyUserDto) {
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
