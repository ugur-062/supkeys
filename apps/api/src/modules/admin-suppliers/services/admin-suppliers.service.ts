import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { EmailService } from "../../email/email.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";

const PASSWORD_RESET_TTL_MINUTES = 60;
import { ListAdminSuppliersDto } from "../dto/list-suppliers.dto";
import {
  AdminUpdateSupplierUserDto,
  UpdateSupplierDto,
} from "../dto/update-supplier.dto";

function parseSupplierSort(
  sort: string | undefined,
): Prisma.SupplierOrderByWithRelationInput {
  const parts = (sort ?? "createdAt:desc").split(":");
  const field = parts[0];
  const dir: Prisma.SortOrder = parts[1] === "asc" ? "asc" : "desc";
  if (field === "companyName") return { companyName: dir };
  return { createdAt: dir };
}

@Injectable()
export class AdminSuppliersService {
  private readonly logger = new Logger(AdminSuppliersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  /** Parola sıfırlama linki üret + e-posta (alıcı tarafıyla aynı akış). */
  async issuePasswordReset(supplierId: string, userId: string, adminId: string) {
    const target = await this.prisma.supplierUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        supplierId: true,
        email: true,
        firstName: true,
        isActive: true,
        supplier: { select: { isActive: true } },
      },
    });
    if (!target || target.supplierId !== supplierId) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }
    if (!target.isActive || !target.supplier.isActive) {
      throw new BadRequestException(
        "Pasif kullanıcı veya engelli tedarikçi için parola sıfırlanamaz",
      );
    }

    await this.prisma.passwordResetToken.deleteMany({
      where: { supplierUserId: userId, usedAt: null },
    });

    const plainToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(plainToken)
      .digest("hex");
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
    );

    await this.prisma.passwordResetToken.create({
      data: {
        supplierUserId: userId,
        tokenHash,
        expiresAt,
        createdByAdminId: adminId || null,
      },
    });

    const baseUrl =
      this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password?token=${plainToken}`;

    try {
      await this.emailService.send({
        to: { email: target.email, name: target.firstName },
        templateData: {
          template: "admin_password_reset",
          data: {
            firstName: target.firstName,
            email: target.email,
            resetUrl,
            expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
          },
        },
      });
    } catch (err) {
      this.logger.error(
        `Supplier password reset email failed for ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    this.auditAction(adminId, "supplier.user_password_reset", supplierId, {
      supplierUserId: userId,
    });
    this.logger.log(
      `Admin ${adminId} issued password reset for supplier user ${userId}`,
    );

    return { success: true, email: target.email, expiresAt, resetUrl };
  }

  private auditAction(
    adminId: string,
    action: string,
    entityId: string,
    metadata?: Record<string, unknown>,
  ) {
    void this.audit.log({
      action,
      actorType: "admin",
      actorId: adminId || null,
      entityType: "supplier",
      entityId,
      metadata,
    });
  }

  // ----- PATCH supplier (üyelik + blok + metadata) -----

  async update(id: string, dto: UpdateSupplierDto, adminId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!supplier) throw new NotFoundException("Tedarikçi bulunamadı");

    const data: Prisma.SupplierUpdateInput = {};
    if (dto.membership !== undefined) data.membership = dto.membership;

    // Blokla/aç — isActive false ise blockedAt/reason set; true ise temizle.
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      if (dto.isActive === false) {
        data.blockedAt = new Date();
        data.blockedReason = dto.blockedReason?.trim() || null;
      } else {
        data.blockedAt = null;
        data.blockedReason = null;
      }
    }

    // Metadata
    if (dto.companyName !== undefined) data.companyName = dto.companyName.trim();
    if (dto.taxNumber !== undefined)
      data.taxNumber = dto.taxNumber?.trim() || null;
    if (dto.taxOffice !== undefined) data.taxOffice = dto.taxOffice.trim();
    if (dto.industry !== undefined) data.industry = dto.industry?.trim() || null;
    if (dto.website !== undefined) data.website = dto.website?.trim() || null;
    if (dto.city !== undefined) data.city = dto.city.trim();
    if (dto.district !== undefined) data.district = dto.district.trim();
    if (dto.addressLine !== undefined)
      data.addressLine = dto.addressLine.trim();
    if (dto.postalCode !== undefined)
      data.postalCode = dto.postalCode?.trim() || null;

    if (Object.keys(data).length === 0) return { id, updated: false };

    try {
      const updated = await this.prisma.supplier.update({
        where: { id },
        data,
        select: {
          id: true,
          companyName: true,
          membership: true,
          isActive: true,
          blockedAt: true,
          blockedReason: true,
          taxNumber: true,
        },
      });
      this.logger.log(
        `Admin ${adminId} updated supplier ${id}: ${JSON.stringify(
          Object.keys(data),
        )}`,
      );
      const action =
        dto.isActive === false
          ? "supplier.blocked"
          : dto.isActive === true
            ? "supplier.unblocked"
            : dto.membership !== undefined
              ? "supplier.membership_changed"
              : "supplier.updated";
      this.auditAction(adminId, action, id, {
        fields: Object.keys(data),
        membership: dto.membership,
        blockedReason: dto.blockedReason,
      });
      return updated;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException(
          "Bu vergi numarası başka bir tedarikçide kayıtlı",
        );
      }
      throw err;
    }
  }

  // ----- PATCH supplier user (aktif/pasif) -----

  async updateUser(
    supplierId: string,
    userId: string,
    dto: AdminUpdateSupplierUserDto,
    adminId: string,
  ) {
    const target = await this.prisma.supplierUser.findUnique({
      where: { id: userId },
      select: { id: true, supplierId: true, isManager: true, isActive: true },
    });
    if (!target || target.supplierId !== supplierId) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }

    // Son aktif yöneticiyi pasifleştiremez veya yöneticilikten indiremez.
    const losesManager =
      (target.isManager && dto.isActive === false) ||
      (target.isManager && dto.isManager === false);
    if (losesManager) {
      const otherManagers = await this.prisma.supplierUser.count({
        where: {
          supplierId,
          isManager: true,
          isActive: true,
          id: { not: userId },
        },
      });
      if (otherManagers === 0) {
        throw new ConflictException("En az bir aktif yönetici olmak zorunda");
      }
    }

    const data: Prisma.SupplierUserUpdateInput = {};
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.isManager !== undefined) data.isManager = dto.isManager;
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim() || null;
    if (Object.keys(data).length === 0) return { id: userId, updated: false };

    const updated = await this.prisma.supplierUser.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        isManager: true,
      },
    });
    this.logger.log(
      `Admin ${adminId} updated supplier user ${userId} (${supplierId}): ${JSON.stringify(Object.keys(data))}`,
    );
    this.auditAction(adminId, "supplier.user_updated", supplierId, {
      supplierUserId: userId,
      fields: Object.keys(data),
    });
    return updated;
  }

  // ----- KVKK silme -----

  /** Admin KVKK silme — tedarikçi kullanıcısını anonimleştir + auth sil. */
  async deleteUser(supplierId: string, userId: string, adminId: string) {
    const target = await this.prisma.supplierUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        supplierId: true,
        isManager: true,
        authId: true,
        email: true,
      },
    });
    if (!target || target.supplierId !== supplierId) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }
    if (target.isManager) {
      const others = await this.prisma.supplierUser.count({
        where: {
          supplierId,
          isManager: true,
          isActive: true,
          id: { not: userId },
        },
      });
      if (others === 0) {
        throw new ConflictException("En az bir aktif yönetici olmak zorunda");
      }
    }
    if (target.authId) {
      await this.supabaseAuth.deleteUser(target.authId).catch(() => undefined);
    }
    await this.prisma.supplierUser.update({
      where: { id: userId },
      data: {
        isActive: false,
        authId: null,
        email: `deleted-${userId}@supkeys.local`,
        firstName: "Silinmiş",
        lastName: "Kullanıcı",
        phone: null,
      },
    });
    this.auditAction(adminId, "supplier.user_deleted", supplierId, {
      supplierUserId: userId,
      previousEmail: target.email,
    });
    this.logger.log(`Admin ${adminId} KVKK-deleted supplier user ${userId}`);
    return { success: true };
  }

  // ----- Hesap kurtarma (admin destek) -----

  private async findSupplierUser(supplierId: string, userId: string) {
    const u = await this.prisma.supplierUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        supplierId: true,
        email: true,
        authId: true,
        emailVerifiedAt: true,
      },
    });
    if (!u || u.supplierId !== supplierId) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }
    return u;
  }

  /** E-postayı zorla doğrula. */
  async forceVerifyEmail(supplierId: string, userId: string, adminId: string) {
    const u = await this.findSupplierUser(supplierId, userId);
    if (u.emailVerifiedAt) return { success: true, alreadyVerified: true };
    await this.prisma.supplierUser.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    this.logger.log(`Admin ${adminId} force-verified supplier user ${userId}`);
    this.auditAction(adminId, "supplier.user_email_verified", supplierId, {
      supplierUserId: userId,
    });
    return { success: true };
  }

  /** 2FA'yı sıfırla/kapat. */
  async reset2FA(supplierId: string, userId: string, adminId: string) {
    await this.findSupplierUser(supplierId, userId);
    await this.prisma.supplierUser.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorEnabledAt: null },
    });
    this.logger.log(`Admin ${adminId} reset 2FA for supplier user ${userId}`);
    this.auditAction(adminId, "supplier.user_2fa_reset", supplierId, {
      supplierUserId: userId,
    });
    return { success: true };
  }

  /** E-posta adresini değiştir (Supabase Auth + domain). */
  async changeEmail(
    supplierId: string,
    userId: string,
    newEmailRaw: string,
    adminId: string,
  ) {
    const email = newEmailRaw.toLowerCase().trim();
    const u = await this.findSupplierUser(supplierId, userId);
    if (u.email === email) return { success: true, updated: false };
    const existing = await this.prisma.supplierUser.findUnique({
      where: { email },
    });
    if (existing) throw new ConflictException("Bu e-posta zaten kullanımda");
    if (!u.authId) {
      throw new BadRequestException(
        "Bu hesap Supabase Auth'a bağlı değil — destek ekibiyle iletişime geçin",
      );
    }
    await this.supabaseAuth.updateEmail(u.authId, email);
    await this.prisma.supplierUser.update({
      where: { id: userId },
      data: { email, emailVerifiedAt: new Date() },
    });
    this.logger.log(
      `Admin ${adminId} changed email for supplier user ${userId} → ${email}`,
    );
    this.auditAction(adminId, "supplier.user_email_changed", supplierId, {
      supplierUserId: userId,
      newEmail: email,
    });
    return { success: true, email };
  }

  async list(query: ListAdminSuppliersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SupplierWhereInput = {};
    if (query.membership) where.membership = query.membership;
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { companyName: { contains: term, mode: "insensitive" } },
        { taxNumber: { contains: term, mode: "insensitive" } },
        {
          users: {
            some: { email: { contains: term, mode: "insensitive" } },
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        include: {
          _count: {
            select: {
              users: true,
              bids: true,
              orders: true,
              tenantRelations: { where: { status: "ACTIVE" } },
            },
          },
          users: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              lastLoginAt: true,
            },
          },
        },
        orderBy: parseSupplierSort(query.sort),
        skip,
        take: pageSize,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      // isBlocked tedarikçide isActive=false demektir (blockedAt/Reason detayı).
      items: items.map((s) => ({ ...s, isBlocked: !s.isActive })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async getOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            isActive: true,
            isManager: true,
            emailVerifiedAt: true,
            twoFactorEnabled: true,
            lastLoginAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: {
            users: true,
            bids: true,
            orders: true,
            tenantRelations: { where: { status: "ACTIVE" } },
          },
        },
      },
    });

    if (!supplier) throw new NotFoundException("Tedarikçi bulunamadı");

    const [bidsByStatus, ordersByStatus, totalRevenue, winRatePercent] =
      await Promise.all([
        this.prisma.bid.groupBy({
          by: ["status"],
          where: { supplierId: id },
          _count: { _all: true },
        }),
        this.prisma.order.groupBy({
          by: ["status"],
          where: { supplierId: id },
          _count: { _all: true },
        }),
        this.prisma.order.aggregate({
          where: { supplierId: id, status: "COMPLETED" },
          _sum: { totalAmount: true },
        }),
        this.calculateWinRate(id),
      ]);

    return {
      ...supplier,
      isBlocked: !supplier.isActive,
      analytics: {
        bidsByStatus: bidsByStatus.map((b) => ({
          status: b.status,
          count: b._count._all,
        })),
        ordersByStatus: ordersByStatus.map((o) => ({
          status: o.status,
          count: o._count._all,
        })),
        totalRevenueCompleted: totalRevenue._sum.totalAmount ?? 0,
        winRatePercent,
      },
    };
  }

  /**
   * Kazanma oranı = AWARDED bid'ler / final state'e ulaşmış bid'ler.
   * Final state: SUBMITTED (henüz kazandırma yapılmamış) sayılmaz; sadece
   * AWARDED_FULL/PARTIAL + LOST'a göre. WITHDRAWN/REJECTED/DRAFT dışı.
   */
  private async calculateWinRate(supplierId: string): Promise<number> {
    const [decided, awarded] = await Promise.all([
      this.prisma.bid.count({
        where: {
          supplierId,
          status: { in: ["AWARDED_FULL", "AWARDED_PARTIAL", "LOST"] },
        },
      }),
      this.prisma.bid.count({
        where: {
          supplierId,
          status: { in: ["AWARDED_FULL", "AWARDED_PARTIAL"] },
        },
      }),
    ]);
    if (decided === 0) return 0;
    return Math.round((awarded / decided) * 100);
  }
}
