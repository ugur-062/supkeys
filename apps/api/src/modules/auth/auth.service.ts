import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { UserRole } from "@supkeys/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SupabaseAuthService } from "../supabase-auth/supabase-auth.service";
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

  async login(dto: LoginDto) {
    // Supabase Auth source-of-truth. verifyPassword başarısızsa generic 401
    // döndürür — user enumeration sızıntısı yok. Timing-safe (Supabase API
    // call latency'si user var/yok ayrımı yapmaz).
    let authId: string;
    try {
      const result = await this.supabaseAuth.verifyPassword(
        dto.email.toLowerCase(),
        dto.password,
      );
      authId = result.authId;
    } catch {
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

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = this.signToken(user, user.tenant);

    return {
      token,
      user: this.toPublicUser(user, user.tenant),
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.toPublicUser(user, user.tenant);
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
    },
    tenant: {
      id: string;
      name: string;
      slug: string;
      membershipEndAt: Date | null;
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
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        // V2-6.5 — Üyelik bitiş tarihi (web banner için)
        membershipEndAt: tenant.membershipEndAt
          ? tenant.membershipEndAt.toISOString()
          : null,
      },
    };
  }
}
