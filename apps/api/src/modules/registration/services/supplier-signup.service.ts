import { ConflictException, Injectable } from "@nestjs/common";
import { generateShortCode } from "@supkeys/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";
import { TwoFactorService } from "../../two-factor/two-factor.service";
import {
  SupplierSignupDto,
  VerifySupplierEmailDto,
} from "../dto/supplier-signup.dto";

/**
 * Madde 29 — Tedarikçi signup (önce hesap). Hesap anında oluşur (admin ön-onayı
 * yok); şirket bilgileri onboarding'de, doğrulama belgeleri FAZ 3'te toplanır.
 * E-posta 6 haneli KOD ile doğrulanır; doğrulanana kadar login engellenir.
 */
@Injectable()
export class SupplierSignupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async signup(dto: SupplierSignupDto) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.supplierUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        "Bu e-posta ile zaten bir tedarikçi hesabı var. Giriş yapın.",
      );
    }

    // Supabase auth kullanıcısı (parola doğrulama kaynağı).
    const { authId } = await this.supabaseAuth.createUser(email, dto.password, {
      kind: "supplier",
    });

    let created: { id: string; firstName: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.create({
          data: {
            supkeysId: generateShortCode(),
            // Şirket bilgileri onboarding'de doldurulur (placeholder'lar).
            companyName: `${dto.firstName} ${dto.lastName}`.trim() || "Yeni Tedarikçi",
            companyType: "LIMITED",
            taxNumber: null,
            taxOffice: "",
            taxCertUrl: null,
            city: "",
            district: "",
            addressLine: "",
          },
          select: { id: true },
        });
        return tx.supplierUser.create({
          data: {
            email,
            authId,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            phone: dto.phone?.trim() || null,
            isManager: true,
            supplierId: supplier.id,
            // emailVerifiedAt null → doğrulanana kadar login engelli.
          },
          select: { id: true, firstName: true },
        });
      });
    } catch (err) {
      // Domain kaydı başarısızsa Supabase kullanıcısını geri al.
      await this.supabaseAuth.deleteUser(authId).catch(() => undefined);
      throw err;
    }

    const { challengeId, expiresAt } = await this.twoFactor.issueChallenge(
      { kind: "supplier", id: created.id, email, firstName: created.firstName },
      "EMAIL_VERIFY",
    );
    return { challengeId, expiresAt, email };
  }

  /** 6 haneli kodu doğrula → e-posta doğrulandı (login açılır). */
  async verifyEmail(dto: VerifySupplierEmailDto) {
    this.twoFactor.assertCodeFormat(dto.code);
    const { id } = await this.twoFactor.verifyChallenge(
      dto.challengeId,
      dto.code,
      { kind: "supplier", purpose: "EMAIL_VERIFY" },
    );
    await this.prisma.supplierUser.update({
      where: { id },
      data: { emailVerifiedAt: new Date() },
    });
    return { ok: true };
  }

  /** Kodu yeniden gönder (challengeId ile kullanıcıyı bul). */
  async resend(challengeId: string) {
    const ch = await this.prisma.twoFactorChallenge.findUnique({
      where: { id: challengeId },
      select: { supplierUserId: true },
    });
    if (!ch?.supplierUserId) {
      throw new ConflictException("Geçersiz oturum, lütfen tekrar kayıt olun");
    }
    const u = await this.prisma.supplierUser.findUnique({
      where: { id: ch.supplierUserId },
      select: { id: true, email: true, firstName: true },
    });
    if (!u) throw new ConflictException("Kullanıcı bulunamadı");
    return this.twoFactor.issueChallenge(
      { kind: "supplier", id: u.id, email: u.email, firstName: u.firstName },
      "EMAIL_VERIFY",
    );
  }
}
