import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { UserRole } from "@supkeys/db";
import * as bcrypt from "bcrypt";
import { DUMMY_HASH } from "../../common/auth/dummy-hash";
import { PrismaService } from "../../common/prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { resolveUserPermissions } from "./permissions/permissions.utils";
import type { JwtPayload } from "./strategies/jwt.strategy";

const INVALID_CREDENTIALS_MESSAGE = "E-posta veya şifre hatalı";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { tenant: true },
    });

    // BUG FIX #2 — Timing attack mitigation: kullanıcı yoksa, pasifse veya
    // tenant pasifse bile bcrypt.compare DUMMY_HASH ile çalıştırılır. Hangi
    // sebeple başarısız olursa olsun aynı generic mesaj döner.
    // BUG FIX #3 — "Firma hesabı pasif durumda" özel mesajı kaldırıldı;
    // ayrımı sızdırıyordu (user enumeration).
    const passwordMatches = user
      ? await bcrypt.compare(dto.password, user.passwordHash)
      : await bcrypt.compare(dto.password, DUMMY_HASH).then(() => false);

    // V2-6.5 — Üyelik süresi dolmuşsa: ŞİFRE DOĞRUYSA spesifik mesaj
    // göster. Saldırgan şifre bilmediği sürece bu sızıntı değil ve müşteri
    // deneyimi için gerekli (yanlış mesajla kafa karışıklığı yaratmaz).
    if (
      user &&
      passwordMatches &&
      user.tenant.membershipEndAt &&
      user.tenant.membershipEndAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException(
        "Firmanızın üyelik süresi sona erdi. Yöneticinizle iletişime geçin.",
      );
    }

    if (
      !user ||
      !user.isActive ||
      user.deletedAt !== null ||
      !user.tenant.isActive ||
      !passwordMatches
    ) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
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
