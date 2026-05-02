import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../../common/prisma/prisma.service";

export interface SupplierJwtPayload {
  sub: string;
  email: string;
  type: "supplier";
  supplierUserId: string;
  supplierId: string;
}

export interface AuthenticatedSupplierUser {
  supplierUserId: string;
  supplierId: string;
  email: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class SupplierJwtStrategy extends PassportStrategy(
  Strategy,
  "supplier-jwt",
) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET"),
    });
  }

  async validate(payload: SupplierJwtPayload): Promise<AuthenticatedSupplierUser> {
    if (payload.type !== "supplier") {
      throw new UnauthorizedException("Geçersiz token tipi");
    }

    const user = await this.prisma.supplierUser.findUnique({
      where: { id: payload.supplierUserId },
      include: { supplier: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Kullanıcı geçersiz");
    }
    if (!user.supplier.isActive || user.supplier.isBlocked) {
      throw new UnauthorizedException("Tedarikçi hesabı pasif veya engellenmiş");
    }

    return {
      supplierUserId: user.id,
      supplierId: user.supplierId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}
