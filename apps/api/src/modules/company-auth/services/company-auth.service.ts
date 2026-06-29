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
import * as QRCode from "qrcode";
import { CompanyRole, type Company, type CompanyUser } from "@supkeys/db";
import { generateShortCode } from "@supkeys/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";
import { CompanyLoginDto } from "../dto/company-login.dto";
import { CompanySignupDto } from "../dto/company-signup.dto";
import type { CompanyJwtPayload } from "../strategies/company-jwt.strategy";

type Ctx = { ip?: string; userAgent?: string };

@Injectable()
export class CompanyAuthService {
  private readonly logger = new Logger(CompanyAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly audit: AuditService,
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

    // 1) Supabase auth.users oluştur (email_confirm: true)
    const { authId } = await this.supabaseAuth.createUser(email, dto.password, {
      type: "company",
    });

    const supkeysId = await this.generateUniqueSupkeysId();

    // 2) Company + ilk CompanyUser (owner). Prisma hatasında auth.users temizle.
    let result: { company: Company; user: CompanyUser };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            name: dto.companyName.trim(),
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
            phone: dto.phone?.trim() || null,
            // İlk kullanıcı = sahip → yönetici + her iki operasyon rolü.
            roles: [
              CompanyRole.YONETICI,
              CompanyRole.SATIN_ALMACI,
              CompanyRole.SATISCI,
            ],
            companyId: company.id,
            // Supabase email_confirm:true → doğrulanmış kabul. (6-haneli kod
            // akışı sonraki chunk.)
            emailVerifiedAt: new Date(),
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

    // Bu e-postaya gönderilmiş bekleyen referans davetleri → otomatik INVITE
    // (kalıcı) bağlantı. Signup'ı bozmaması için hatayı yutar.
    await this.acceptReferralInvites(email, result.company.id).catch((err) =>
      this.logger.error(
        `Referans daveti bağlama hatası (${email}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );

    return this.buildLoginResponse(result.user, result.company);
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
