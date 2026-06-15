import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";
import type { ChangeSupplierPasswordDto } from "../dto/change-password.dto";
import { sanitizeNotificationPrefs } from "../dto/notification-prefs.dto";
import type { UpdateAccountDto } from "../dto/update-account.dto";

/**
 * Tedarikçi kullanıcısının kendi hesap ayarları:
 * hesap bilgisi (ad/soyad/telefon), şifre değişimi, bildirim tercihleri.
 */
@Injectable()
export class SupplierAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  /** Hesap bilgisi (ad/soyad/telefon) günceller; güncel kullanıcıyı döner. */
  async updateAccount(supplierUserId: string, dto: UpdateAccountDto) {
    const data: Prisma.SupplierUserUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim() || null;

    const user = await this.prisma.supplierUser.update({
      where: { id: supplierUserId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        lastLoginAt: true,
      },
    });
    return user;
  }

  /** Mevcut şifreyi Supabase üzerinden doğrula, yeniyi yaz. */
  async changePassword(
    supplierUserId: string,
    dto: ChangeSupplierPasswordDto,
  ) {
    const user = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      select: { email: true, authId: true },
    });
    if (!user || !user.authId) throw new NotFoundException();

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

  async getNotificationPrefs(
    supplierUserId: string,
  ): Promise<{ notificationPrefs: unknown }> {
    const user = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      select: { notificationPrefs: true },
    });
    if (!user) throw new NotFoundException();
    return { notificationPrefs: user.notificationPrefs };
  }

  async updateNotificationPrefs(
    supplierUserId: string,
    prefs: Record<string, unknown>,
  ): Promise<{ notificationPrefs: unknown }> {
    const cleaned = sanitizeNotificationPrefs(prefs);
    const user = await this.prisma.supplierUser.update({
      where: { id: supplierUserId },
      data: { notificationPrefs: cleaned },
      select: { notificationPrefs: true },
    });
    return { notificationPrefs: user.notificationPrefs };
  }
}
