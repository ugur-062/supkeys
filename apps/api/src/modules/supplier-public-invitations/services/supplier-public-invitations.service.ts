import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";
import type { SupplierJwtPayload } from "../../supplier-auth/strategies/supplier-jwt.strategy";
import type { AcceptSupplierInvitationDto } from "../dto/accept-supplier-invitation.dto";

/**
 * Ekip — tedarikçi çalışan davetinin public kabul akışı.
 * Kabul eden kişi anında ACTIVE, mevcut üyelerle tam eşit (rol yok).
 */
@Injectable()
export class SupplierPublicInvitationsService {
  private readonly logger = new Logger(SupplierPublicInvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  async getByToken(token: string) {
    const inv = await this.prisma.supplierUserInvitation.findUnique({
      where: { token },
      include: {
        supplier: {
          select: { companyName: true, isActive: true, isBlocked: true },
        },
      },
    });
    if (!inv) throw new NotFoundException("Davet bulunamadı");
    if (inv.status === "ACCEPTED") {
      throw new ConflictException("Davet zaten kabul edilmiş");
    }
    if (inv.status === "CANCELLED") {
      throw new ConflictException("Davet iptal edilmiş");
    }
    if (inv.expiresAt < new Date()) {
      if (inv.status === "PENDING") {
        await this.prisma.supplierUserInvitation.update({
          where: { id: inv.id },
          data: { status: "EXPIRED" },
        });
      }
      throw new ConflictException("Davet süresi dolmuş");
    }
    if (inv.supplier.isBlocked || !inv.supplier.isActive) {
      throw new ConflictException("Firma hesabı aktif değil");
    }

    return {
      email: inv.email,
      companyName: inv.supplier.companyName,
      expiresAt: inv.expiresAt.toISOString(),
    };
  }

  async accept(token: string, dto: AcceptSupplierInvitationDto) {
    const inv = await this.prisma.supplierUserInvitation.findUnique({
      where: { token },
      include: { supplier: true },
    });
    if (!inv) throw new NotFoundException("Davet bulunamadı");
    if (inv.status === "ACCEPTED") {
      throw new ConflictException("Davet zaten kabul edilmiş");
    }
    if (inv.status === "CANCELLED") {
      throw new ConflictException("Davet iptal edilmiş");
    }
    if (inv.expiresAt < new Date()) {
      await this.prisma.supplierUserInvitation.update({
        where: { id: inv.id },
        data: { status: "EXPIRED" },
      });
      throw new ConflictException("Davet süresi dolmuş");
    }
    if (inv.supplier.isBlocked || !inv.supplier.isActive) {
      throw new ConflictException("Firma hesabı aktif değil");
    }

    const existing = await this.prisma.supplierUser.findUnique({
      where: { email: inv.email },
    });
    if (existing) {
      throw new ConflictException(
        "Bu e-posta başka bir hesaba kayıtlı, davet kabul edilemiyor",
      );
    }

    // Supabase Auth source-of-truth: önce auth.users'a yaz.
    const { authId } = await this.supabaseAuth.createUser(
      inv.email,
      dto.password,
      { role: "supplier_user", supplier_id: inv.supplierId },
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const fresh = await tx.supplierUserInvitation.findUnique({
          where: { token },
        });
        if (!fresh || fresh.status !== "PENDING") {
          throw new ConflictException("Davet artık geçerli değil");
        }

        const user = await tx.supplierUser.create({
          data: {
            email: inv.email,
            authId,
            passwordHash: null,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            phone: dto.phone?.trim() || null,
            isActive: true,
            supplierId: inv.supplierId,
            lastLoginAt: new Date(),
          },
        });

        await tx.supplierUserInvitation.update({
          where: { id: inv.id },
          data: { status: "ACCEPTED", acceptedAt: new Date() },
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
            lastLoginAt: user.lastLoginAt,
          },
          supplier: {
            id: inv.supplier.id,
            companyName: inv.supplier.companyName,
            companyType: inv.supplier.companyType,
            taxNumber: inv.supplier.taxNumber,
            taxOffice: inv.supplier.taxOffice,
            industry: inv.supplier.industry,
            website: inv.supplier.website,
            city: inv.supplier.city,
            district: inv.supplier.district,
            addressLine: inv.supplier.addressLine,
            postalCode: inv.supplier.postalCode,
            membership: inv.supplier.membership,
            isActive: inv.supplier.isActive,
            isBlocked: inv.supplier.isBlocked,
          },
        };
      });
    } catch (err) {
      // DB tx fail — Supabase orphan'ı temizle
      try {
        await this.supabaseAuth.deleteUser(authId);
      } catch (cleanupErr) {
        this.logger.error(
          `Supplier davet kabul tx fail sonrası auth.users cleanup hatası (${authId}): ${
            cleanupErr instanceof Error ? cleanupErr.message : cleanupErr
          }`,
        );
      }
      throw err;
    }
  }
}
