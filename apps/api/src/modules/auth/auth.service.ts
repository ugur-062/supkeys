import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../common/prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import type { JwtPayload } from "./strategies/jwt.strategy";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    // Çakışma kontrolleri
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existingUser) {
      throw new ConflictException("Bu e-posta zaten kayıtlı");
    }

    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.companySlug.toLowerCase() },
    });
    if (existingTenant) {
      throw new ConflictException("Bu firma slug'ı zaten kullanılıyor");
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Tenant + User'ı transactional oluştur
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.companyName,
          slug: dto.companySlug.toLowerCase(),
        },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: "COMPANY_ADMIN", // ilk kullanıcı firma yöneticisi
          tenantId: tenant.id,
        },
      });

      return { tenant, user };
    });

    const token = this.signToken(result.user, result.tenant);

    return {
      token,
      user: this.toPublicUser(result.user, result.tenant),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { tenant: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("E-posta veya şifre hatalı");
    }

    if (!user.tenant.isActive) {
      throw new UnauthorizedException("Firma hesabı pasif durumda");
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("E-posta veya şifre hatalı");
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
    },
    tenant: { id: string; name: string; slug: string },
  ) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
    };
  }
}
