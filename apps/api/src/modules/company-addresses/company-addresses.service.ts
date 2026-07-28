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
    // KULLANIMDAKİ ADRESİN YERİ DEĞİŞTİRİLEMEZ (2026-07-28): silme guard'ı
    // (bkz. remove) aktif ilan/SUBMITTED teklif kullanıyorsa adresi kilitliyor,
    // ama AYNI kural güncellemede yoktu — ilan teslimat adresini id ile CANLI
    // okuduğundan (award anına kadar snapshot yok) adres, teklifler toplandıktan
    // SONRA başka bir ile taşınabiliyordu; tedarikçiler artık geçersiz bir
    // noktaya göre fiyatlamış oluyordu. Yer/vergi alanları kilitli, iletişim
    // alanları (başlık, ilgili kişi, telefon, varsayılan) serbest — yazım
    // düzeltmesi mümkün kalsın.
    const LOCKED_FIELDS = [
      "country",
      "city",
      "district",
      "addressLine",
      "postalCode",
      "taxOffice",
      "taxNumber",
    ] as const;
    const norm = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
    const incoming: Record<(typeof LOCKED_FIELDS)[number], string | null> = {
      country: dto.country?.trim() || "TR",
      city: norm(dto.city),
      district: norm(dto.district),
      addressLine: dto.addressLine.trim(),
      postalCode: norm(dto.postalCode),
      taxOffice: norm(dto.taxOffice),
      taxNumber: norm(dto.taxNumber),
    };
    const locationChanged = LOCKED_FIELDS.some(
      (k) => (before[k] ?? null) !== incoming[k],
    );
    if (locationChanged) {
      await this.assertNotInActiveUse(
        user.companyId,
        id,
        "adres bilgileri değiştirilemez",
      );
    }
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
    await this.assertNotInActiveUse(user.companyId, id, "silinemez");
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

  /**
   * "Adres şu an bağlayıcı bir sürecin parçası mı?" — TEK KAYNAK: hem silme
   * hem yer-değiştiren güncelleme buradan geçer (aynı kural iki yolda
   * ayrışmasın diye; ayrışmıştı, güncelleme korumasızdı).
   *
   * İki dal:
   *  1) Aktif ilan — Listing.deliveryAddressId/billingAddressId düz String
   *     (FK yok); adres silinirse açık ilan sarkan id'ye işaret eder, yeri
   *     değişirse teklifçilerin fiyatladığı nokta altlarından kayar.
   *  2) SUBMITTED teklif — teklifin deliveryAddressId'si (onDelete:SetNull)
   *     bu adrese bakar; henüz award edilmediği için order'a snapshot'lanmadı.
   *     WON/AWARDED_PARTIAL kilitlenmez (award anında snapshot alındı, order
   *     sabit); DRAFT da kilitlenmez (submit'te yeniden çözülür).
   */
  private async assertNotInActiveUse(
    companyId: string,
    id: string,
    what: string,
  ) {
    const activeUse = await this.prisma.listing.count({
      where: {
        companyId,
        status: {
          in: ["DRAFT", "IN_APPROVAL", "OPEN", "IN_AWARD", "IN_AWARD_APPROVAL"],
        },
        OR: [{ deliveryAddressId: id }, { billingAddressId: id }],
      },
    });
    if (activeUse > 0) {
      throw new BadRequestException(
        `Bu adres ${activeUse} aktif ilanda kullanılıyor — ${what}; önce ilanlardaki adresi değiştirin`,
      );
    }
    const bidUse = await this.prisma.listingBid.count({
      where: {
        bidderCompanyId: companyId,
        status: "SUBMITTED",
        deliveryAddressId: id,
      },
    });
    if (bidUse > 0) {
      throw new BadRequestException(
        `Bu adres ${bidUse} gönderilmiş teklifte kullanılıyor — teklif sonuçlanana kadar ${what}`,
      );
    }
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
