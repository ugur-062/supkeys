import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { SupplierLoginDto } from "../dto/supplier-login.dto";
import type { SupplierJwtPayload } from "../strategies/supplier-jwt.strategy";

// Hesap bulunamadığında bcrypt.compare çalıştırarak timing attack'tan korunmak için
// kullanılan sabit dummy hash. "invalid-password-placeholder" üzerinden bcrypt(rounds=12).
// Sadece compare süresini eşitlemek amacıyla, hiçbir kullanıcının şifresine eşit değil.
const DUMMY_HASH =
  "$2b$12$8b/5VmH1kS7lHe9b8p2E6.7jZqL1k4rNQ3sP1bMxUVwYZcTfGdW6e";

@Injectable()
export class SupplierAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: SupplierLoginDto) {
    const email = dto.email.toLowerCase().trim();

    const user = await this.prisma.supplierUser.findUnique({
      where: { email },
      include: { supplier: true },
    });

    // Timing-safe: kullanıcı yoksa bile bcrypt.compare çalıştır
    if (!user) {
      await bcrypt.compare(dto.password, DUMMY_HASH);
      throw new UnauthorizedException("E-posta veya şifre hatalı");
    }

    if (user.supplier.isBlocked) {
      const reason = user.supplier.blockedReason
        ? `Sebep: ${user.supplier.blockedReason}`
        : "Lütfen Supkeys ekibiyle iletişime geçin.";
      throw new ForbiddenException(
        `Hesabınız platform tarafından engellenmiş. ${reason}`,
      );
    }
    if (!user.supplier.isActive) {
      throw new ForbiddenException("Tedarikçi hesabı aktif değil");
    }
    if (!user.isActive) {
      throw new ForbiddenException("Kullanıcı hesabı aktif değil");
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("E-posta veya şifre hatalı");
    }

    await this.prisma.supplierUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: SupplierJwtPayload = {
      sub: user.id,
      email: user.email,
      type: "supplier",
      supplierUserId: user.id,
      supplierId: user.supplierId,
    };

    return {
      token: this.jwt.sign(payload),
      supplierUser: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        lastLoginAt: new Date(),
      },
      supplier: this.serializeSupplier(user.supplier),
    };
  }

  async getMe(supplierUserId: string) {
    const user = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      include: {
        supplier: {
          include: {
            tenantRelations: {
              include: {
                tenant: { select: { id: true, name: true, slug: true } },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      supplierUser: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        lastLoginAt: user.lastLoginAt,
      },
      supplier: this.serializeSupplier(user.supplier),
      tenantRelations: user.supplier.tenantRelations.map((rel) => ({
        id: rel.id,
        tenantId: rel.tenantId,
        tenantName: rel.tenant.name,
        tenantSlug: rel.tenant.slug,
        status: rel.status,
        blockedAt: rel.blockedAt,
        blockedReason: rel.blockedReason,
        createdAt: rel.createdAt,
      })),
    };
  }

  private serializeSupplier(supplier: {
    id: string;
    companyName: string;
    companyType: string;
    taxNumber: string;
    taxOffice: string;
    industry: string | null;
    website: string | null;
    city: string;
    district: string;
    addressLine: string;
    postalCode: string | null;
    membership: string;
    isActive: boolean;
    isBlocked: boolean;
  }) {
    return {
      id: supplier.id,
      companyName: supplier.companyName,
      companyType: supplier.companyType,
      taxNumber: supplier.taxNumber,
      taxOffice: supplier.taxOffice,
      industry: supplier.industry,
      website: supplier.website,
      city: supplier.city,
      district: supplier.district,
      addressLine: supplier.addressLine,
      postalCode: supplier.postalCode,
      membership: supplier.membership,
      isActive: supplier.isActive,
      isBlocked: supplier.isBlocked,
    };
  }
}
