import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { authenticator } from "otplib";
import * as crypto from "node:crypto";
import * as QRCode from "qrcode";
import { CompanyRole, type Company, type CompanyUser } from "@supkeys/db";
import {
  generateShortCode,
  isValidCountryCode,
  isValidTaxIdForCountry,
  isValidTckn,
} from "@supkeys/shared";
import { validateCategorySelection } from "../../../common/helpers/category-selection.helper";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { EmailService } from "../../email/email.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";
import { CompanyLoginDto } from "../dto/company-login.dto";
import { CompanySignupDto } from "../dto/company-signup.dto";
import { CompleteOnboardingDto } from "../dto/onboarding.dto";
import type { CompanyJwtPayload } from "../strategies/company-jwt.strategy";

const ROLE_LABELS: Record<CompanyRole, string> = {
  [CompanyRole.YONETICI]: "Yönetici",
  [CompanyRole.SATIN_ALMACI]: "Satın Almacı",
  [CompanyRole.SATISCI]: "Satışçı",
  [CompanyRole.ONAYLAYICI]: "Onaylayıcı",
};

type Ctx = { ip?: string; userAgent?: string };

const EMAIL_CODE_TTL_MIN = 15;
const EMAIL_CODE_MAX_ATTEMPTS = 5;

@Injectable()
export class CompanyAuthService {
  private readonly logger = new Logger(CompanyAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  // ============================================================
  // SIGNUP — firma self-servis kaydı (kaydeden = SAHİP)
  // ============================================================
  async signup(dto: CompanySignupDto, ctx?: Ctx) {
    const email = dto.email.toLowerCase().trim();

    // Aynı e-posta zaten bir CompanyUser'da var mı? (dostane mesaj)
    const existing = await this.prisma.companyUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("Bu e-posta ile zaten bir hesap var");
    }

    // 1) Supabase auth.users oluştur
    const { authId } = await this.supabaseAuth.createUser(email, dto.password, {
      type: "company",
    });

    const supkeysId = await this.generateUniqueSupkeysId();
    const now = new Date();

    // 2) Company + ilk CompanyUser (owner). Prisma hatasında auth.users temizle.
    //    Firma adı signup'ta sorulmaz → geçici ad; onboarding'de legalName ile
    //    güncellenir. E-posta doğrulanmadan (emailVerifiedAt=null) login engelli.
    let result: { company: Company; user: CompanyUser };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            name: `${dto.firstName.trim()} ${dto.lastName.trim()} Firması`,
            tier: "STANDARD",
            supkeysId,
          },
        });
        const user = await tx.companyUser.create({
          data: {
            email,
            authId,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            phone: dto.phone.trim(),
            roles: [
              CompanyRole.YONETICI,
              CompanyRole.SATIN_ALMACI,
              CompanyRole.SATISCI,
            ],
            companyId: company.id,
            emailVerifiedAt: null, // 6-haneli kod ile doğrulanacak
            // Zorunlu sözleşme + opsiyonel rıza denetim izi.
            termsAcceptedAt: now,
            mediationAcceptedAt: now,
            kvkkAcceptedAt: now,
            marketingConsent: dto.marketingConsent ?? false,
            profileImprovementConsent: dto.profileImprovementConsent ?? false,
          },
        });
        const updatedCompany = await tx.company.update({
          where: { id: company.id },
          data: { ownerUserId: user.id },
        });
        return { company: updatedCompany, user };
      });
    } catch (e) {
      // Orphan auth.users bırakma.
      await this.supabaseAuth.deleteUser(authId);
      throw e;
    }

    void this.audit.log({
      action: "company.signup",
      actorType: "company",
      actorId: result.user.id,
      actorEmail: email,
      metadata: { companyId: result.company.id, portal: "company" },
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });

    await this.acceptReferralInvites(email, result.company.id).catch((err) =>
      this.logger.error(
        `Referans daveti bağlama hatası (${email}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );

    // 3) 6-haneli doğrulama kodu üret + e-posta gönder. Token DÖNMEZ — kullanıcı
    //    önce kodu doğrulamalı (verifyEmail token verir).
    await this.issueEmailCode(result.user.id, email, result.user.firstName);
    return { email, verificationRequired: true as const };
  }

  // ============================================================
  // E-POSTA DOĞRULAMA — 6 haneli kod (Resend ile gönderilir)
  // ============================================================

  private hashCode(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  /** Yeni kod üret, eski kodları geçersiz kıl, e-posta gönder. */
  private async issueEmailCode(userId: string, email: string, firstName: string) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    await this.prisma.emailVerificationCode.updateMany({
      where: { companyUserId: userId, usedAt: null },
      data: { usedAt: new Date() }, // eskileri kapat
    });
    await this.prisma.emailVerificationCode.create({
      data: {
        companyUserId: userId,
        codeHash: this.hashCode(code),
        expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MIN * 60_000),
      },
    });
    void this.email
      .send({
        to: { email, name: firstName },
        subject: "E-posta doğrulama kodunuz",
        templateData: {
          template: "notification",
          data: {
            subject: "E-posta doğrulama kodunuz",
            heading: "E-posta adresinizi doğrulayın",
            paragraphs: [
              "Merhaba,",
              `Rothern hesabınızı etkinleştirmek için doğrulama kodunuz: ${code}`,
              `Kod ${EMAIL_CODE_TTL_MIN} dakika geçerlidir.`,
            ],
          },
        },
        context: { type: "email_verify", id: userId },
      })
      .catch((err) =>
        this.logger.error(
          `Doğrulama kodu e-postası gönderilemedi (${email}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }

  /** Kodu doğrula → emailVerifiedAt set + otomatik login (token). */
  async verifyEmail(email: string, code: string) {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.companyUser.findUnique({
      where: { email: normalized },
      include: { company: true },
    });
    if (!user) throw new BadRequestException("Kod geçersiz veya süresi dolmuş");
    if (user.emailVerifiedAt) {
      return this.buildLoginResponse(user, user.company);
    }
    const record = await this.prisma.emailVerificationCode.findFirst({
      where: { companyUserId: user.id, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException("Kod geçersiz veya süresi dolmuş");
    }
    if (record.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      throw new BadRequestException(
        "Çok fazla hatalı deneme — yeni kod isteyin",
      );
    }
    if (record.codeHash !== this.hashCode(code)) {
      await this.prisma.emailVerificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("Kod geçersiz veya süresi dolmuş");
    }
    const [, updatedUser] = await this.prisma.$transaction([
      this.prisma.emailVerificationCode.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.companyUser.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
        include: { company: true },
      }),
    ]);
    return this.buildLoginResponse(updatedUser, updatedUser.company);
  }

  /** Kodu yeniden gönder (enumeration'a karşı her zaman genel yanıt). */
  async resendEmailCode(email: string) {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.companyUser.findUnique({
      where: { email: normalized },
      select: { id: true, firstName: true, emailVerifiedAt: true },
    });
    if (user && !user.emailVerifiedAt) {
      await this.issueEmailCode(user.id, normalized, user.firstName);
    }
    return { success: true as const };
  }

  // ============================================================
  // ONBOARDING — Firma Doğrulama sihirbazı (Faz 2)
  // ============================================================
  async completeOnboarding(
    userId: string,
    companyId: string,
    dto: CompleteOnboardingDto,
  ) {
    const country = (dto.country || "TR").toUpperCase();
    if (!isValidCountryCode(country)) {
      throw new BadRequestException("Geçersiz ülke seçimi");
    }
    const isSole = dto.companyType === "SOLE_PROPRIETOR";
    if (!isValidTaxIdForCountry(dto.taxNumber, country, isSole)) {
      throw new BadRequestException(
        country === "TR"
          ? isSole
            ? "Şahıs firması için 11 haneli geçerli TCKN giriniz"
            : "Tüzel kişi için 10 haneli geçerli vergi numarası giriniz"
          : "Geçerli bir vergi/sicil numarası giriniz",
      );
    }
    if (country === "TR") {
      if (!dto.authorizedTckn || !isValidTckn(dto.authorizedTckn)) {
        throw new BadRequestException("Yetkili T.C. Kimlik No geçersiz");
      }
      if (!dto.taxOffice?.trim()) {
        throw new BadRequestException("Vergi dairesi zorunlu");
      }
      if (!dto.district?.trim()) {
        throw new BadRequestException("İlçe zorunlu");
      }
    }

    const { mainIds, subIds } = await validateCategorySelection(
      this.prisma,
      dto.mainCategoryIds,
      dto.subCategoryIds ?? [],
    );

    // Sahip her zaman YÖNETİCİ + seçilen rol.
    const roles = Array.from(
      new Set<CompanyRole>([CompanyRole.YONETICI, dto.role]),
    );
    const deliverySame = dto.deliverySameAsBilling !== false;

    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: {
          name: dto.legalName.trim(),
          legalName: dto.legalName.trim(),
          companyType: dto.companyType,
          country,
          taxNumber: dto.taxNumber.trim(),
          taxOffice: dto.taxOffice?.trim() || null,
          city: dto.city.trim(),
          district: dto.district?.trim() || null,
          stateRegion: dto.stateRegion?.trim() || null,
          neighborhood: dto.neighborhood?.trim() || null,
          postalCode: dto.postalCode?.trim() || null,
          addressLine: dto.addressLine.trim(),
          authorizedTckn: dto.authorizedTckn?.trim() || null,
          authorizedTitle: ROLE_LABELS[dto.role],
          buyerCategoryIds: mainIds,
          sellerCategoryIds: mainIds,
          buyerSubCategoryIds: subIds,
          sellerSubCategoryIds: subIds,
          onboardingCompletedAt: new Date(),
        },
      });
      await tx.companyUser.update({
        where: { id: userId },
        data: { roles },
      });
      // Eski onboarding adres kayıtlarını temizle (idempotent tekrar).
      await tx.companyAddress.deleteMany({ where: { companyId } });
      await tx.companyAddress.create({
        data: {
          companyId,
          type: "FATURA",
          title: "Merkez",
          country,
          city: dto.city.trim(),
          district: dto.district?.trim() || null,
          postalCode: dto.postalCode?.trim() || null,
          addressLine: dto.addressLine.trim(),
          taxOffice: dto.taxOffice?.trim() || null,
          taxNumber: dto.taxNumber.trim(),
          isDefault: true,
        },
      });
      await tx.companyAddress.create({
        data: {
          companyId,
          type: "TESLIMAT",
          title: deliverySame ? "Teslimat (fatura ile aynı)" : "Teslimat",
          country,
          city: (deliverySame ? dto.city : dto.deliveryCity ?? dto.city).trim(),
          district:
            (deliverySame ? dto.district : dto.deliveryDistrict)?.trim() || null,
          postalCode:
            (deliverySame ? dto.postalCode : dto.deliveryPostalCode)?.trim() ||
            null,
          addressLine: (deliverySame
            ? dto.addressLine
            : dto.deliveryAddressLine ?? dto.addressLine
          ).trim(),
          isDefault: true,
        },
      });
    });

    return { ok: true as const };
  }

  /**
   * Yeni kayıt olan firmaya gönderilmiş bekleyen e-posta davetlerini işler:
   * her biri için davet eden firma ile ACTIVE INVITE bağlantı kurar (kalıcı).
   */
  private async acceptReferralInvites(
    email: string,
    newCompanyId: string,
  ): Promise<void> {
    const invites = await this.prisma.companyReferralInvite.findMany({
      where: { email, status: "PENDING" },
      select: { id: true, inviterCompanyId: true, invitedById: true },
    });
    for (const inv of invites) {
      if (inv.inviterCompanyId === newCompanyId) continue;
      await this.prisma.companyConnection.upsert({
        where: {
          inviterCompanyId_inviteeCompanyId: {
            inviterCompanyId: inv.inviterCompanyId,
            inviteeCompanyId: newCompanyId,
          },
        },
        create: {
          inviterCompanyId: inv.inviterCompanyId,
          inviteeCompanyId: newCompanyId,
          invitedById: inv.invitedById,
          status: "ACTIVE",
          origin: "INVITE",
          decidedAt: new Date(),
        },
        update: {},
      });
      await this.prisma.companyReferralInvite.update({
        where: { id: inv.id },
        data: {
          status: "ACCEPTED",
          acceptedCompanyId: newCompanyId,
          acceptedAt: new Date(),
        },
      });
    }
  }

  // ============================================================
  // LOGIN
  // ============================================================
  async login(dto: CompanyLoginDto, ctx?: Ctx) {
    const email = dto.email.toLowerCase().trim();
    const auditFail = (reason: string) =>
      void this.audit.log({
        action: "auth.login_failed",
        actorType: "company",
        actorEmail: email,
        metadata: { reason, portal: "company" },
        ip: ctx?.ip,
        userAgent: ctx?.userAgent,
      });

    let authId: string;
    try {
      const r = await this.supabaseAuth.verifyPassword(email, dto.password);
      authId = r.authId;
    } catch {
      auditFail("bad_credentials");
      throw new UnauthorizedException("E-posta veya şifre hatalı");
    }

    const user = await this.prisma.companyUser.findUnique({
      where: { authId },
      include: { company: true },
    });
    if (!user) {
      auditFail("user_missing");
      throw new UnauthorizedException("E-posta veya şifre hatalı");
    }
    if (user.deletedAt || !user.isActive) {
      auditFail("user_inactive");
      throw new ForbiddenException("Kullanıcı hesabı aktif değil");
    }
    if (user.company.isBlocked) {
      auditFail("company_blocked");
      throw new ForbiddenException("Firma hesabı engellenmiş");
    }
    if (!user.company.isActive) {
      auditFail("company_inactive");
      throw new ForbiddenException("Firma hesabı aktif değil");
    }
    if (!user.emailVerifiedAt) {
      auditFail("email_unverified");
      throw new ForbiddenException(
        "Giriş yapmadan önce e-posta adresinizi doğrulayın.",
      );
    }

    // 2FA açıksa: kod yoksa "gerekli" yanıtı, varsa doğrula.
    if (user.twoFactorEnabled) {
      if (!dto.code) {
        return { twoFactorRequired: true as const };
      }
      const ok = user.twoFactorSecret
        ? authenticator.verify({
            token: dto.code.trim(),
            secret: user.twoFactorSecret,
          })
        : false;
      if (!ok) {
        auditFail("bad_2fa");
        throw new UnauthorizedException("Doğrulama kodu hatalı");
      }
    }

    return this.buildLoginResponse(user, user.company, ctx);
  }

  // ============================================================
  // PREMIUM'A GEÇ (Faz 3) — doğrulama tamamsa tier=PAKET
  // ============================================================
  async upgradeToPremium(userId: string, companyId: string) {
    const [company, user] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { tier: true, companyVerificationStatus: true },
      }),
      this.prisma.companyUser.findUnique({
        where: { id: userId },
        select: { twoFactorEnabled: true },
      }),
    ]);
    if (!company || !user) throw new UnauthorizedException();
    if (company.tier === "PAKET") return { ok: true as const, tier: "PAKET" };
    if (company.companyVerificationStatus !== "VERIFIED") {
      throw new BadRequestException(
        "Önce şirket belgelerinizi doğrulatmalısınız",
      );
    }
    if (!user.twoFactorEnabled) {
      throw new BadRequestException(
        "Önce iki adımlı doğrulamayı (2FA) etkinleştirmelisiniz",
      );
    }
    // TODO(ödeme): premium ücretlendirme burada devreye girecek. Şimdilik
    // doğrulama tamamlandıysa ücretsiz PAKET'e geçilir (açık seam).
    await this.prisma.company.update({
      where: { id: companyId },
      data: { tier: "PAKET" },
    });
    return { ok: true as const, tier: "PAKET" };
  }

  // ============================================================
  // 2FA (TOTP) — eski ayarlar
  // ============================================================

  /** 2FA kurulumunu başlat — secret üret, QR + otpauth döndür (henüz aktif değil). */
  async setupTwoFactor(userId: string) {
    const user = await this.prisma.companyUser.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.twoFactorEnabled) {
      throw new BadRequestException("İki adımlı doğrulama zaten açık");
    }
    const secret = authenticator.generateSecret();
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    });
    const otpauthUrl = authenticator.keyuri(user.email, "Rothern", secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { otpauthUrl, qrDataUrl, secret };
  }

  /** Kurulum kodunu doğrulayıp 2FA'yı aç. */
  async enableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.companyUser.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true },
    });
    if (!user?.twoFactorSecret) {
      throw new BadRequestException("Önce 2FA kurulumunu başlatın");
    }
    if (!authenticator.verify({ token: code.trim(), secret: user.twoFactorSecret })) {
      throw new BadRequestException("Doğrulama kodu hatalı");
    }
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorEnabledAt: new Date() },
    });
    return { ok: true };
  }

  /** Kod doğrulayıp 2FA'yı kapat. */
  async disableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.companyUser.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException("İki adımlı doğrulama zaten kapalı");
    }
    if (!authenticator.verify({ token: code.trim(), secret: user.twoFactorSecret })) {
      throw new BadRequestException("Doğrulama kodu hatalı");
    }
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorEnabledAt: null,
        twoFactorSecret: null,
      },
    });
    return { ok: true };
  }

  // ============================================================
  // ME
  // ============================================================
  async getMe(userId: string) {
    const user = await this.prisma.companyUser.findUnique({
      where: { id: userId },
      include: { company: true },
    });
    if (!user) throw new UnauthorizedException();
    return {
      user: this.serializeUser(user, user.company.ownerUserId === user.id),
      company: this.serializeCompany(user.company),
    };
  }

  // ============================================================
  // HESAP AYARLARI (eski ayarlar — kişisel)
  // ============================================================

  /** Kendi profilini güncelle (ad/soyad/telefon). */
  async updateMe(
    userId: string,
    dto: { firstName?: string; lastName?: string; phone?: string },
  ) {
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: dto.lastName.trim() }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
      },
    });
    return this.getMe(userId);
  }

  /** Mevcut parolayı doğrulayıp yenisini ata (Supabase). */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.companyUser.findUnique({
      where: { id: userId },
      select: { email: true, authId: true },
    });
    if (!user || !user.authId) throw new UnauthorizedException();
    try {
      await this.supabaseAuth.verifyPassword(user.email, currentPassword);
    } catch {
      throw new ForbiddenException("Mevcut parola hatalı");
    }
    await this.supabaseAuth.updatePassword(user.authId, newPassword);
    return { ok: true };
  }

  /** Bildirim tercihlerini güncelle (serbest Json). */
  async updateNotificationPrefs(
    userId: string,
    prefs: Record<string, boolean>,
  ) {
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: { notificationPrefs: prefs },
    });
    return this.getMe(userId);
  }

  // ============================================================
  // HELPERS
  // ============================================================
  private async buildLoginResponse(
    user: CompanyUser,
    company: Company,
    ctx?: Ctx,
  ) {
    await this.prisma.companyUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: CompanyJwtPayload = {
      sub: user.id,
      email: user.email,
      type: "company",
      userId: user.id,
      companyId: company.id,
    };

    void this.audit.log({
      action: "auth.login",
      actorType: "company",
      actorId: user.id,
      actorEmail: user.email,
      metadata: { portal: "company", companyId: company.id },
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });

    return {
      token: this.jwt.sign(payload),
      user: this.serializeUser(
        { ...user, lastLoginAt: new Date() },
        company.ownerUserId === user.id,
      ),
      company: this.serializeCompany(company),
    };
  }

  private serializeUser(user: CompanyUser, isOwner: boolean) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      roles: user.roles,
      isOwner,
      twoFactorEnabled: user.twoFactorEnabled,
      notificationPrefs:
        (user.notificationPrefs as Record<string, boolean> | null) ?? null,
      lastLoginAt: user.lastLoginAt,
    };
  }

  /** Çakışmasız supkeysId üretir (XXXX-XXXX). Bağlantı davetinde kullanılır. */
  private async generateUniqueSupkeysId(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = generateShortCode();
      const exists = await this.prisma.company.count({
        where: { supkeysId: code },
      });
      if (exists === 0) return code;
    }
    throw new Error("supkeysId üretilemedi (çakışma)");
  }

  private serializeCompany(company: Company) {
    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      supkeysId: company.supkeysId,
      tier: company.tier,
      country: company.country,
      companyVerificationStatus: company.companyVerificationStatus,
      onboardingCompletedAt: company.onboardingCompletedAt,
      ownerUserId: company.ownerUserId,
      publicEnabled: company.publicEnabled,
      isActive: company.isActive,
    };
  }
}
