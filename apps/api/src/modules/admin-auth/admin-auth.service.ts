import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AdminLoginDto } from "./dto/admin-login.dto";
import type { AdminJwtPayload } from "./strategies/admin-jwt.strategy";

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

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException("E-posta veya şifre hatalı");
    }

    const valid = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("E-posta veya şifre hatalı");
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
