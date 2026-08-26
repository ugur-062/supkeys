import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { AdminRole } from "@rothern/db";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SupabaseAuthService } from "../supabase-auth/supabase-auth.service";

/** Okunabilir geçici parola — SUPER_ADMIN bir kez görür, personele iletir. */
function tempPassword(): string {
  // base64url'den okunması zor karakterleri ele; 16 karakter + sabit ek =
  // >12 karakter politika + karma set.
  const raw = randomBytes(12).toString("base64url").replace(/[-_]/g, "x");
  return `Rt${raw}!7`;
}

/**
 * Yönetici personel yönetimi (Faz 7) — SALES/SUPPORT hesapları artık DB'ye
 * elle dokunmadan panelden açılır/kapanır. Tüm işlemler yalnız SUPER_ADMIN
 * (controller guard) + audit.
 */
@Injectable()
export class AdminStaffService {
  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly audit: AuditService,
    private readonly supabase: SupabaseAuthService,
  ) {}

  async list() {
    const admins = await this.prisma.platformAdmin.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return admins;
  }

  /**
   * Personel ekle — Supabase hesabı geçici parolayla açılır; parola YALNIZ
   * bu yanıtın içinde bir kez görünür (loglanmaz), personel ilk girişte
   * "şifre değiştir" ile kendisininkini koyar.
   */
  async create(
    input: {
      email: string;
      firstName: string;
      lastName: string;
      role: AdminRole;
    },
    actorId: string,
  ) {
    const email = input.email.trim().toLowerCase();
    const clash = await this.prisma.platformAdmin.findUnique({
      where: { email },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException("Bu e-posta ile zaten bir yönetici var");
    }
    const password = tempPassword();
    const { authId } = await this.supabase.createUser(email, password, {
      role: "platform_admin",
    });
    const admin = await this.prisma.platformAdmin.create({
      data: {
        email,
        authId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        role: input.role,
      },
      select: { id: true, email: true, role: true },
    });
    await this.audit.log({
      action: "admin.staff.created",
      actorType: "admin",
      actorId,
      entityType: "platform_admin",
      entityId: admin.id,
      metadata: { email, role: input.role },
      // #10 (Parça 9): admin yetki yolu — audit yazımı düşerse alarm.
      critical: true,
    });
    // Parola audit'e/log'a YAZILMAZ — yalnız yanıt gövdesinde.
    return { ok: true, id: admin.id, tempPassword: password };
  }

  async setRole(id: string, role: AdminRole, actorId: string) {
    const target = await this.requireStaff(id);
    if (id === actorId && role !== "SUPER_ADMIN") {
      throw new BadRequestException("Kendi rolünüzü düşüremezsiniz");
    }
    if (target.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
      // Dalga B: sayım + yazım ayrıydı — eşzamanlı iki düşürme ikisi de
      // "benden başka biri var" görüp sistemi 0 SUPER_ADMIN'le bırakabiliyordu.
      // Sayım ve yazım tek transaction'da serileşir.
      await this.prisma.$transaction(async (tx) => {
        const others = await tx.platformAdmin.count({
          where: { role: "SUPER_ADMIN", isActive: true, id: { not: id } },
        });
        if (others === 0) {
          throw new BadRequestException(
            "Son aktif SUPER_ADMIN düşürülemez/pasifleştirilemez",
          );
        }
        await tx.platformAdmin.update({ where: { id }, data: { role } });
      });
    } else {
      await this.prisma.platformAdmin.update({ where: { id }, data: { role } });
    }
    await this.audit.log({
      action: "admin.staff.role_set",
      actorType: "admin",
      actorId,
      entityType: "platform_admin",
      entityId: id,
      metadata: { from: target.role, to: role },
      // #10 (Parça 9): admin yetki yolu — audit yazımı düşerse alarm.
      critical: true,
    });
    return { ok: true };
  }

  async setActive(id: string, active: boolean, actorId: string) {
    const target = await this.requireStaff(id);
    if (id === actorId && !active) {
      throw new BadRequestException("Kendinizi pasifleştiremezsiniz");
    }
    if (target.role === "SUPER_ADMIN" && !active) {
      // Dalga B: bkz. setRole — sayım + yazım tek transaction'da.
      await this.prisma.$transaction(async (tx) => {
        const others = await tx.platformAdmin.count({
          where: { role: "SUPER_ADMIN", isActive: true, id: { not: id } },
        });
        if (others === 0) {
          throw new BadRequestException(
            "Son aktif SUPER_ADMIN düşürülemez/pasifleştirilemez",
          );
        }
        await tx.platformAdmin.update({
          where: { id },
          data: { isActive: false },
        });
      });
    } else {
      await this.prisma.platformAdmin.update({
        where: { id },
        data: { isActive: active },
      });
    }
    await this.audit.log({
      action: active ? "admin.staff.activated" : "admin.staff.deactivated",
      actorType: "admin",
      actorId,
      entityType: "platform_admin",
      entityId: id,
      critical: true,
    });
    return { ok: true };
  }

  /** Personel şifresini sıfırla — yeni geçici parola bir kez gösterilir. */
  async resetPassword(id: string, actorId: string) {
    const target = await this.requireStaff(id);
    if (!target.authId) {
      throw new BadRequestException("Hesap Supabase köprüsüne bağlı değil");
    }
    const password = tempPassword();
    await this.supabase.updatePassword(target.authId, password);
    // 2FA kilidi: şifre sıfırlanan personel authenticator'ına erişemiyorsa
    // 2FA da sıfırlanır (SUPER_ADMIN kimliği zaten doğruladı).
    await this.prisma.platformAdmin.update({
      where: { id },
      // Oturum iptali: reset sonrası eski oturumlar düşer (denetim 2026-08-23 #3).
      data: { twoFactorEnabled: false, twoFactorSecret: null, tokenVersion: { increment: 1 } },
    });
    await this.audit.log({
      action: "admin.staff.password_reset",
      actorType: "admin",
      actorId,
      entityType: "platform_admin",
      entityId: id,
      // #10 (Parça 9): admin yetki yolu — audit yazımı düşerse alarm.
      critical: true,
    });
    return { ok: true, tempPassword: password };
  }

  private async requireStaff(id: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
      select: { id: true, role: true, authId: true, isActive: true },
    });
    if (!admin) throw new NotFoundException("Yönetici bulunamadı");
    return admin;
  }

}
