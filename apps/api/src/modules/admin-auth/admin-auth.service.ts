import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SupabaseAuthService } from "../supabase-auth/supabase-auth.service";
import { AdminLoginDto } from "./dto/admin-login.dto";
import type { AdminJwtPayload } from "./strategies/admin-jwt.strategy";

const INVALID_CREDENTIALS_MESSAGE = "E-posta veya şifre hatalı";

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  async login(dto: AdminLoginDto) {
    // Supabase Auth source-of-truth. verifyPassword başarısızsa generic 401.
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

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { authId },
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: AdminJwtPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      type: "admin",
    };

    return {
      token: this.jwt.sign(payload),
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
      },
    };
  }

  async getMe(adminId: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: adminId },
    });
    if (!admin) {
      throw new UnauthorizedException();
    }
    return {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
    };
  }
}
