import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Prisma, UserRole } from "@supkeys/db";
import type { AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SupabaseAuthService } from "../supabase-auth/supabase-auth.service";
import { TwoFactorService } from "../two-factor/two-factor.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { resolveUserPermissions } from "./permissions/permissions.utils";
import type { JwtPayload } from "./strategies/jwt.strategy";

const INVALID_CREDENTIALS_MESSAGE = "E-posta veya şifre hatalı";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  /**
   * Şifre sıfırlama linki Supabase üzerinden gönderilir. Kullanıcının
   * tenant/supplier/admin olması fark etmez — Supabase auth.users e-posta
   * üzerinden bulur. Var/yok ayrımı user'a sızdırılmaz (her zaman success
   * döner; SupabaseAuthService sessizce logger.warn yapar).
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ success: true }> {
    const webUrl = this.config.get<string>("WEB_URL", "http://localhost:3000");
    await this.supabaseAuth.sendPasswordResetEmail(
      dto.email.toLowerCase().trim(),
      `${webUrl.replace(/\/$/, "")}/auth/reset-callback`,
    );
    return { success: true };
  }

  async login(dto: LoginDto, ctx?: { ip?: string; userAgent?: string }) {
    const email = dto.email.toLowerCase();
    // Başarısız login'i denetim izine yaz (OWASP A09 — brute-force/anomali tespiti)
    const auditFail = (reason: string) =>
      void this.audit.log({
        action: "auth.login_failed",
        actorType: "system",
        actorEmail: email,
        metadata: { reason },
        ip: ctx?.ip,
        userAgent: ctx?.userAgent,
      });

    // Supabase Auth source-of-truth. verifyPassword başarısızsa generic 401
    // döndürür — user enumeration sızıntısı yok. Timing-safe (Supabase API
    // call latency'si user var/yok ayrımı yapmaz).
    let authId: string;
    try {
      const result = await this.supabaseAuth.verifyPassword(email, dto.password);
      authId = result.authId;
    } catch {
      auditFail("bad_credentials");
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const user = await this.prisma.user.findUnique({
      where: { authId },
      include: { tenant: true },
    });

    // Domain user yok, pasif, soft-deleted veya tenant pasif → user
    // enumeration önlemek için aynı generic mesaj.
    if (
      !user ||
      !user.isActive ||
      user.deletedAt !== null ||
      !user.tenant.isActive
    ) {
      auditFail("inactive_or_missing");
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    // V2-6.5 — Şifre doğru ama üyelik bitmiş: müşteri deneyimi için spesifik
    // mesaj (saldırgan şifreyi zaten bildiği için sızıntı değil).
    if (
      user.tenant.membershipEndAt &&
      user.tenant.membershipEndAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException(
        "Firmanızın üyelik süresi sona erdi. Yöneticinizle iletişime geçin.",
      );
    }

    // Madde 29 — FAZ 3.3: 2FA açıksa token verme, OTP iste.
    if (user.twoFactorEnabled) {
      const { challengeId, expiresAt } = await this.twoFactor.issueChallenge(
        {
          kind: "user",
          id: user.id,
          email: user.email,
          firstName: user.firstName,
        },
        "LOGIN",
      );
      return { twoFactorRequired: true as const, challengeId, expiresAt };
    }

    return this.buildLoginResponse(user, ctx);
  }

  /** Madde 29 — login OTP doğrula → token. */
  async verifyLoginOtp(
    challengeId: string,
    code: string,
    ctx?: { ip?: string; userAgent?: string },
  ) {
    this.twoFactor.assertCodeFormat(code);
    const { id } = await this.twoFactor.verifyChallenge(challengeId, code, {
      kind: "user",
      purpose: "LOGIN",
    });
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { tenant: true },
    });
    if (
      !user ||
      !user.isActive ||
      user.deletedAt !== null ||
      !user.tenant.isActive
    ) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }
    return this.buildLoginResponse(user, ctx);
  }

  private async buildLoginResponse(
    user: Prisma.UserGetPayload<{ include: { tenant: true } }>,
    ctx?: { ip?: string; userAgent?: string },
  ) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = this.signToken(user, user.tenant);

    void this.audit.log({
      action: "auth.login",
      actorType: "tenant",
      actorId: user.id,
      actorEmail: user.email,
      tenantId: user.tenantId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });

    return {
      token,
      user: this.toPublicUser(user, user.tenant),
    };
  }

  // ---- Madde 29 — 2FA aç/kapat (panel-içi) ----

  async startEnableTwoFactor(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    if (!u) throw new UnauthorizedException();
    return this.twoFactor.issueChallenge(
      { kind: "user", id: userId, email: u.email, firstName: u.firstName },
      "ENABLE",
    );
  }

  async verifyEnableTwoFactor(userId: string, challengeId: string, code: string) {
    this.twoFactor.assertCodeFormat(code);
    const { id } = await this.twoFactor.verifyChallenge(challengeId, code, {
      kind: "user",
      purpose: "ENABLE",
    });
    if (id !== userId) throw new UnauthorizedException();
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorEnabledAt: new Date() },
    });
    return { ok: true };
  }

  async disableTwoFactor(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorEnabledAt: null },
    });
    return { ok: true };
  }

  /**
   * /auth/me — JwtAuthGuard `validate()` zaten user+tenant satırını yükledi
   * (permissionsOverride + membershipEndAt dahil). İkinci bir DB round-trip'i
   * yapmadan request.user'dan publicUser inşa edilir. (Perf: uzak Supabase'de
   * her sorgu ~215ms; bu çağrı her sayfa yüklemesinde tetiklenir.)
   */
  async buildMe(user: AuthenticatedUser) {
    // Madde 29 — onboarding/doğrulama + 2FA alanları için tenant + user'ı çek
    // (guard yalnızca temel alanları yüklüyor). /me seyrek + 60sn cache.
    const [tenant, row] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: user.tenant.id } }),
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: { twoFactorEnabled: true },
      }),
    ]);
    if (!tenant) throw new UnauthorizedException();
    return this.toPublicUser(
      {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        permissionsOverride: user.permissionsOverride,
        twoFactorEnabled: row?.twoFactorEnabled ?? false,
      },
      tenant,
    );
  }

  // ----------------- helpers -----------------

  private signToken(
    user: { id: string; email: string; role: string; tenantId: string },
    _tenant: { id: string; slug: string },
  ): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      type: "tenant",
    };
    return this.jwt.sign(payload);
  }

  private toPublicUser(
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      permissionsOverride: unknown;
      twoFactorEnabled?: boolean;
    },
    tenant: {
      id: string;
      name: string;
      slug: string;
      membershipEndAt: Date | null;
      // Madde 29 — onboarding/doğrulama alanları (opsiyonel; login full tenant
      // gönderir, eski çağrılarda undefined olabilir).
      companyType?: string | null;
      legalName?: string | null;
      taxNumber?: string | null;
      taxOffice?: string | null;
      industry?: string | null;
      city?: string | null;
      district?: string | null;
      neighborhood?: string | null;
      postalCode?: string | null;
      addressLine?: string | null;
      billingTitle?: string | null;
      billingEmail?: string | null;
      authorizedTckn?: string | null;
      authorizedTitle?: string | null;
      mersisNo?: string | null;
      tradeRegistryNo?: string | null;
      kepAddress?: string | null;
      iban?: string | null;
      ibanHolder?: string | null;
      billingPhone?: string | null;
      billingPhoneVerifiedAt?: Date | null;
      sectorCategoryIds?: string[];
      onboardingCompletedAt?: Date | null;
      companyVerificationStatus?: string;
    },
  ) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      // V2-6.5 — RBAC efektif permission listesi
      permissions: resolveUserPermissions(
        user.role as UserRole,
        user.permissionsOverride,
      ),
      // Madde 29 — e-posta 2FA aktif mi (kullanıcı seviyesi).
      twoFactorEnabled: user.twoFactorEnabled ?? false,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        // V2-6.5 — Üyelik bitiş tarihi (web banner için)
        membershipEndAt: tenant.membershipEndAt
          ? tenant.membershipEndAt.toISOString()
          : null,
        // Madde 29 — FAZ 2 prefill + onboarding/doğrulama durumu
        companyType: tenant.companyType ?? null,
        legalName: tenant.legalName ?? null,
        taxNumber: tenant.taxNumber ?? null,
        taxOffice: tenant.taxOffice ?? null,
        industry: tenant.industry ?? null,
        city: tenant.city ?? null,
        district: tenant.district ?? null,
        neighborhood: tenant.neighborhood ?? null,
        postalCode: tenant.postalCode ?? null,
        addressLine: tenant.addressLine ?? null,
        billingTitle: tenant.billingTitle ?? null,
        billingEmail: tenant.billingEmail ?? null,
        authorizedTckn: tenant.authorizedTckn ?? null,
        authorizedTitle: tenant.authorizedTitle ?? null,
        // Madde 29 — FAZ 3 kurumsal kimlik
        mersisNo: tenant.mersisNo ?? null,
        tradeRegistryNo: tenant.tradeRegistryNo ?? null,
        kepAddress: tenant.kepAddress ?? null,
        iban: tenant.iban ?? null,
        ibanHolder: tenant.ibanHolder ?? null,
        billingPhone: tenant.billingPhone ?? null,
        billingPhoneVerifiedAt: tenant.billingPhoneVerifiedAt
          ? tenant.billingPhoneVerifiedAt.toISOString()
          : null,
        sectorCategoryIds: tenant.sectorCategoryIds ?? [],
        onboardingCompletedAt: tenant.onboardingCompletedAt
          ? tenant.onboardingCompletedAt.toISOString()
          : null,
        companyVerificationStatus:
          tenant.companyVerificationStatus ?? "UNVERIFIED",
      },
    };
  }
}
