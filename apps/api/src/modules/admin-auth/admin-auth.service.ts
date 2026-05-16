import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { DUMMY_HASH } from "../../common/auth/dummy-hash";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AdminLoginDto } from "./dto/admin-login.dto";
import type { AdminJwtPayload } from "./strategies/admin-jwt.strategy";

const INVALID_CREDENTIALS_MESSAGE = "E-posta veya şifre hatalı";

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: AdminLoginDto) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    // BUG FIX #2 — bcrypt.compare her durumda çalışır (timing attack ile
    // user enumeration vektörü kapanır). Kayıt yoksa veya pasifse DUMMY_HASH
    // ile compare; başarı false olarak normalize edilir.
    const passwordMatches = admin
      ? await bcrypt.compare(dto.password, admin.passwordHash)
      : await bcrypt.compare(dto.password, DUMMY_HASH).then(() => false);

    if (!admin || !admin.isActive || !passwordMatches) {
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
