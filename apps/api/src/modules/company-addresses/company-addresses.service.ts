import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CompanyAddressType, Prisma } from "@rothern/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import { runTenantTx } from "../../common/prisma/tenant-tx";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { UpsertAddressDto } from "./dto/company-address.dto";

/**
 * Adres defteri (fatura + teslimat). INV-AUDIT-1: CRUD audit izi bırakır
 * (teslimat adresi değişimi sevkiyat-yönlendirme delili); yalnız başarılı
 * mutasyon loglanır, silme-kilidi retleri loglanmaz. log() fail-safe.
 */
@Injectable()
export class CompanyAddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Ortak audit metadata'sı — adres satırının kimlik/rota alanları (PII'siz özet). */
  private addressMeta(a: {
    type: CompanyAddressType;
    title: string;
    city: string | null;
    country: string;
    isDefault: boolean;
  }) {
    return {
      type: a.type,
      title: a.title,
      city: a.city,
      country: a.country,
      isDefault: a.isDefault,
    };
  }

  list(companyId: string) {
    return this.prisma.companyAddress.findMany({
      where: { companyId },
      orderBy: [{ type: "asc" }, { isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  async create(user: AuthenticatedCompanyUser, dto: UpsertAddressDto) {
    const type = dto.type as CompanyAddressType;
    const address = await runTenantTx(this.prisma, async (tx) => {
      const created = await tx.companyAddress.create({
        data: {
          companyId: user.companyId,
          type,
          title: dto.title.trim(),
          contactName: dto.contactName?.trim() || null,
          phone: dto.phone?.trim() || null,
          country: dto.country?.trim() || "TR",
          city: dto.city?.trim() || null,
          district: dto.district?.trim() || null,
          addressLine: dto.addressLine.trim(),
          postalCode: dto.postalCode?.trim() || null,
          taxOffice: dto.taxOffice?.trim() || null,
          taxNumber: dto.taxNumber?.trim() || null,
          isDefault: dto.isDefault ?? false,
        },
      });
      if (created.isDefault) {
        await this.clearOtherDefaults(tx, user.companyId, type, created.id);
      }
      return created;
    });
    await this.audit.log({
      action: "company.address.created",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_address",
      entityId: address.id,
      metadata: this.addressMeta(address),
    });
    return address;
  }

  async update(
    user: AuthenticatedCompanyUser,
    id: string,
    dto: UpsertAddressDto,
  ) {
    const before = await this.requireOwn(user.companyId, id);
    const type = dto.type as CompanyAddressType;
    const updated = await runTenantTx(this.prisma, async (tx) => {
      const u = await tx.companyAddress.update({
        where: { id },
        data: {
          type,
          title: dto.title.trim(),
          contactName: dto.contactName?.trim() || null,
          phone: dto.phone?.trim() || null,
          country: dto.country?.trim() || "TR",
          city: dto.city?.trim() || null,
          district: dto.district?.trim() || null,
          addressLine: dto.addressLine.trim(),
          postalCode: dto.postalCode?.trim() || null,
          taxOffice: dto.taxOffice?.trim() || null,
          taxNumber: dto.taxNumber?.trim() || null,
          isDefault: dto.isDefault ?? false,
        },
      });
      if (u.isDefault) {
        await this.clearOtherDefaults(tx, user.companyId, type, u.id);
      }
      return u;
    });
    const changedFields = (
      [
        "type",
        "title",
        "contactName",
        "phone",
        "country",
        "city",
        "district",
        "addressLine",
        "postalCode",
        "taxOffice",
        "taxNumber",
        "isDefault",
      ] as const
    ).filter((k) => before[k] !== updated[k]);
    await this.audit.log({
      action: "company.address.updated",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_address",
      entityId: updated.id,
      metadata: { ...this.addressMeta(updated), changedFields },
    });
    return updated;
  }

  async remove(user: AuthenticatedCompanyUser, id: string) {
    const before = await this.requireOwn(user.companyId, id);
    // AKTİF ilanda kullanılan adres silinemez — Listing.deliveryAddressId/
    // billingAddressId düz String (FK yok); silinirse açık ilan sarkan id'ye
    // işaret eder ve teklifçiler teslimat adresini göremez olurdu.
    const activeUse = await this.prisma.listing.count({
      where: {
        companyId: user.companyId,
        status: { in: ["DRAFT", "IN_APPROVAL", "OPEN", "IN_AWARD", "IN_AWARD_APPROVAL"] },
        OR: [{ deliveryAddressId: id }, { billingAddressId: id }],
      },
    });
    if (activeUse > 0) {
      throw new BadRequestException(
        `Bu adres ${activeUse} aktif ilanda kullanılıyor — önce ilanlardaki adresi değiştirin`,
      );
    }
    // B2 (kör-nokta denetimi): guard yalnız İLANLARI sayıyordu, TEKLİFLERİ değil.
    // SATIS ilanına verilen teklifin deliveryAddressId'si (onDelete:SetNull) bu
    // adrese işaret eder; SUBMITTED teklif henüz award edilmedi → adres silinirse
    // bid adressiz kalır, award'da orderDeliverySnapshot null döner → sipariş
    // teslim-adressiz doğar (satıcı adressiz sipariş görür). Yalnız SUBMITTED
    // kilitler: WON/AWARDED_PARTIAL zaten award anında order'a snapshot'landı
    // (order sabit); DRAFT submit'te resolveBidDeliveryAddress ile yeniden çözülür.
    const bidUse = await this.prisma.listingBid.count({
      where: {
        bidderCompanyId: user.companyId,
        status: "SUBMITTED",
        deliveryAddressId: id,
      },
    });
    if (bidUse > 0) {
      throw new BadRequestException(
        `Bu adres ${bidUse} gönderilmiş teklifte kullanılıyor — teklif sonuçlanana kadar silinemez`,
      );
    }
    await runTenantTx(this.prisma, async (tx) => {
      // Sonuçlanmış (AWARDED/iptal) ilanlardaki sarkan referansları temizle
      // (sipariş adresi zaten award anında snapshot'landı).
      await tx.listing.updateMany({
        where: { companyId: user.companyId, deliveryAddressId: id },
        data: { deliveryAddressId: null },
      });
      await tx.listing.updateMany({
        where: { companyId: user.companyId, billingAddressId: id },
        data: { billingAddressId: null },
      });
      // deleteMany + companyId: requireOwn sonrası TOCTOU penceresini kapatır.
      await tx.companyAddress.deleteMany({
        where: { id, companyId: user.companyId },
      });
    });
    await this.audit.log({
      action: "company.address.deleted",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_address",
      entityId: id,
      metadata: this.addressMeta(before),
    });
    return { ok: true };
  }

  /** Firma-sahipliği doğrular; audit metadata'sı (before) için tam satır döner. */
  private async requireOwn(companyId: string, id: string) {
    const a = await this.prisma.companyAddress.findUnique({
      where: { id },
    });
    if (!a || a.companyId !== companyId) {
      throw new NotFoundException("Adres bulunamadı");
    }
    return a;
  }

  /** Aynı tipte diğer adreslerin varsayılanını kaldır (tek varsayılan). */
  private async clearOtherDefaults(
    tx: Prisma.TransactionClient,
    companyId: string,
    type: CompanyAddressType,
    keepId: string,
  ) {
    await tx.companyAddress.updateMany({
      where: { companyId, type, id: { not: keepId }, isDefault: true },
      data: { isDefault: false },
    });
  }
}
