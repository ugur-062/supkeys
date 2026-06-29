import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import type { CompanyRole, CompanyTier } from "@supkeys/db";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { CompanyPermissionOverride } from "../permissions/company-permissions.constants";

export interface CompanyJwtPayload {
  sub: string;
  email: string;
  type: "company";
  userId: string;
  companyId: string;
}

export interface AuthenticatedCompanyUser {
  userId: string;
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: CompanyRole[];
  tier: CompanyTier;
  isOwner: boolean;
  permissionsOverride: CompanyPermissionOverride | null;
}

@Injectable()
export class CompanyJwtStrategy extends PassportStrategy(
  Strategy,
  "company-jwt",
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

  async validate(
    payload: CompanyJwtPayload,
  ): Promise<AuthenticatedCompanyUser> {
    if (payload.type !== "company") {
      throw new UnauthorizedException("Geçersiz token tipi");
    }

    // Roller + tier + sahiplik DB'den taze okunur (token'a güvenmeyiz).
    const user = await this.prisma.companyUser.findUnique({
      where: { id: payload.userId },
      include: { company: true },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException("Kullanıcı geçersiz");
    }
    if (!user.company.isActive || user.company.isBlocked) {
      throw new UnauthorizedException("Firma hesabı pasif veya engellenmiş");
    }

    return {
      userId: user.id,
      companyId: user.companyId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
      tier: user.company.tier,
      isOwner: user.company.ownerUserId === user.id,
      permissionsOverride:
        (user.permissionsOverride as CompanyPermissionOverride | null) ?? null,
    };
  }
}
