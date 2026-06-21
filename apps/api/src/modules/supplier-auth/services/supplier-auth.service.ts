import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { buildBreadcrumb } from "../../categories/services/category.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";
import { SupplierLoginDto } from "../dto/supplier-login.dto";
import type { SupplierJwtPayload } from "../strategies/supplier-jwt.strategy";

@Injectable()
export class SupplierAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly audit: AuditService,
  ) {}

  async login(
    dto: SupplierLoginDto,
    ctx?: { ip?: string; userAgent?: string },
  ) {
    const email = dto.email.toLowerCase().trim();
    const auditFail = (reason: string) =>
      void this.audit.log({
        action: "auth.login_failed",
        actorType: "supplier",
        actorEmail: email,
        metadata: { reason, portal: "supplier" },
        ip: ctx?.ip,
        userAgent: ctx?.userAgent,
      });

    // Supabase Auth source-of-truth. verifyPassword başarısızsa generic 401.
    let authId: string;
    try {
      const result = await this.supabaseAuth.verifyPassword(email, dto.password);
      authId = result.authId;
    } catch {
      auditFail("bad_credentials");
      throw new UnauthorizedException("E-posta veya şifre hatalı");
    }

    const user = await this.prisma.supplierUser.findUnique({
      where: { authId },
      include: { supplier: true },
    });

    if (!user) {
      auditFail("user_missing");
      throw new UnauthorizedException("E-posta veya şifre hatalı");
    }

    if (user.supplier.isBlocked) {
      auditFail("supplier_blocked");
      const reason = user.supplier.blockedReason
        ? `Sebep: ${user.supplier.blockedReason}`
        : "Lütfen Supkeys ekibiyle iletişime geçin.";
      throw new ForbiddenException(
        `Hesabınız platform tarafından engellenmiş. ${reason}`,
      );
    }
    if (!user.supplier.isActive) {
      auditFail("supplier_inactive");
      throw new ForbiddenException("Tedarikçi hesabı aktif değil");
    }
    if (!user.isActive) {
      auditFail("user_inactive");
      throw new ForbiddenException("Kullanıcı hesabı aktif değil");
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

    void this.audit.log({
      action: "auth.login",
      actorType: "supplier",
      actorId: user.id,
      actorEmail: user.email,
      metadata: { portal: "supplier", supplierId: user.supplierId },
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });

    return {
      token: this.jwt.sign(payload),
      supplierUser: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        isManager: user.isManager,
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
            categories: {
              include: {
                category: {
                  include: {
                    parent: {
                      include: {
                        parent: {
                          include: {
                            parent: {
                              select: {
                                id: true,
                                nameTr: true,
                                segmentLetter: true,
                                level: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
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
        // G6 madde 20 — yönetici mi (UI gate: banka + kullanıcı yönetimi)
        isManager: user.isManager,
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
      categories: user.supplier.categories.map((sc) => ({
        id: sc.category.id,
        code: sc.category.code,
        nameTr: sc.category.nameTr,
        level: sc.category.level,
        breadcrumb: buildBreadcrumb(sc.category),
      })),
    };
  }

  private serializeSupplier(supplier: {
    id: string;
    supkeysId: string | null;
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
      supkeysId: supplier.supkeysId,
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
