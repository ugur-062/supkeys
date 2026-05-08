import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AddressType, Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CreateAddressDto } from "../dto/create-address.dto";
import { ListAddressesDto } from "../dto/list-addresses.dto";
import { UpdateAddressDto } from "../dto/update-address.dto";

const TR_TYPE_LABEL: Record<AddressType, string> = {
  FATURA: "Fatura",
  ILETISIM: "İletişim",
  TESLIMAT: "Teslimat",
};

/**
 * Tender oluşturma anında snapshot olarak kullanılacak tip.
 * `tender.billingAddressSnapshot` ve `deliveryAddressSnapshot` JSON kolonlarına yazılır.
 */
export interface TenantAddressSnapshot {
  id: string;
  type: AddressType;
  title: string;
  country: string;
  state: string | null;
  city: string;
  district: string;
  fullAddress: string;
  postalCode: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  snapshotAt: string;
}

@Injectable()
export class TenantAddressesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- LIST ----------

  async list(tenantId: string, query: ListAddressesDto) {
    const where: Prisma.TenantAddressWhereInput = { tenantId };
    if (query.type) where.type = query.type as AddressType;
    if (query.activeOnly === "true") where.isActive = true;

    return this.prisma.tenantAddress.findMany({
      where,
      orderBy: [{ type: "asc" }, { isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async getOne(tenantId: string, id: string) {
    const address = await this.prisma.tenantAddress.findUnique({
      where: { id },
    });
    if (!address) throw new NotFoundException("Adres bulunamadı");
    if (address.tenantId !== tenantId)
      throw new ForbiddenException("Bu adrese erişim yetkiniz yok");
    return address;
  }

  // ---------- CREATE ----------

  async create(tenantId: string, dto: CreateAddressDto) {
    // FATURA için tax info zorunlu
    if (dto.type === "FATURA") {
      if (!dto.taxOffice?.trim() || !dto.taxNumber?.trim()) {
        throw new BadRequestException(
          "Fatura adresi için Vergi Dairesi ve Vergi Numarası zorunludur",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.tenantAddress.count({
        where: { tenantId, type: dto.type as AddressType },
      });
      const isFirstOfType = existingCount === 0;
      const shouldDefault = isFirstOfType || dto.isDefault === true;

      // Mevcut default'ları kaldır (yeni adres default olacaksa)
      if (shouldDefault && !isFirstOfType) {
        await tx.tenantAddress.updateMany({
          where: {
            tenantId,
            type: dto.type as AddressType,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      return tx.tenantAddress.create({
        data: {
          tenantId,
          type: dto.type as AddressType,
          title: dto.title.trim(),
          country: dto.country.trim(),
          state: dto.state?.trim() || null,
          city: dto.city.trim(),
          district: dto.district.trim(),
          fullAddress: dto.fullAddress.trim(),
          postalCode: dto.postalCode?.trim() || null,
          taxOffice: dto.taxOffice?.trim() || null,
          taxNumber: dto.taxNumber?.trim() || null,
          contactName: dto.contactName?.trim() || null,
          contactPhone: dto.contactPhone?.trim() || null,
          contactEmail: dto.contactEmail?.trim() || null,
          notes: dto.notes?.trim() || null,
          isActive: true,
          isDefault: shouldDefault,
        },
      });
    });
  }

  // ---------- UPDATE ----------

  async update(tenantId: string, id: string, dto: UpdateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.tenantAddress.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException("Adres bulunamadı");
      if (existing.tenantId !== tenantId)
        throw new ForbiddenException("Bu adrese erişim yetkiniz yok");

      // FATURA için tax info zorunlu kalmaya devam etmeli
      if (existing.type === "FATURA") {
        const newTaxOffice =
          dto.taxOffice !== undefined ? dto.taxOffice : existing.taxOffice;
        const newTaxNumber =
          dto.taxNumber !== undefined ? dto.taxNumber : existing.taxNumber;
        if (
          !newTaxOffice ||
          !newTaxOffice.trim() ||
          !newTaxNumber ||
          !newTaxNumber.trim()
        ) {
          throw new BadRequestException(
            "Fatura adresi için Vergi Dairesi ve Vergi Numarası zorunludur",
          );
        }
      }

      // isDefault=true geliyor + zaten değilse → diğerlerini false yap
      if (dto.isDefault === true && !existing.isDefault) {
        await tx.tenantAddress.updateMany({
          where: {
            tenantId,
            type: existing.type,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }

      // isDefault=false → mevcut default ise blokla
      if (dto.isDefault === false && existing.isDefault) {
        throw new ConflictException(
          "Default adresi kaldırmak için önce başka bir adresi default yapın",
        );
      }

      // isActive=false → son aktif veya default ise blokla
      if (dto.isActive === false && existing.isActive) {
        if (existing.isDefault) {
          throw new ConflictException(
            "Default adres pasifleştirilemez. Önce başka bir adresi default yapın.",
          );
        }
        const otherActiveCount = await tx.tenantAddress.count({
          where: {
            tenantId,
            type: existing.type,
            isActive: true,
            id: { not: id },
          },
        });
        if (otherActiveCount === 0) {
          throw new ConflictException(
            `Son aktif ${TR_TYPE_LABEL[existing.type]} adresi pasifleştirilemez`,
          );
        }
      }

      const data: Prisma.TenantAddressUpdateInput = {};
      if (dto.title !== undefined) data.title = dto.title.trim();
      if (dto.country !== undefined) data.country = dto.country.trim();
      if (dto.state !== undefined) data.state = dto.state?.trim() || null;
      if (dto.city !== undefined) data.city = dto.city.trim();
      if (dto.district !== undefined) data.district = dto.district.trim();
      if (dto.fullAddress !== undefined)
        data.fullAddress = dto.fullAddress.trim();
      if (dto.postalCode !== undefined)
        data.postalCode = dto.postalCode?.trim() || null;
      if (dto.taxOffice !== undefined)
        data.taxOffice = dto.taxOffice?.trim() || null;
      if (dto.taxNumber !== undefined)
        data.taxNumber = dto.taxNumber?.trim() || null;
      if (dto.contactName !== undefined)
        data.contactName = dto.contactName?.trim() || null;
      if (dto.contactPhone !== undefined)
        data.contactPhone = dto.contactPhone?.trim() || null;
      if (dto.contactEmail !== undefined)
        data.contactEmail = dto.contactEmail?.trim() || null;
      if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
      if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;

      return tx.tenantAddress.update({ where: { id }, data });
    });
  }

  // ---------- SET DEFAULT ----------

  async setDefault(tenantId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.tenantAddress.findUnique({ where: { id } });
      if (!target) throw new NotFoundException("Adres bulunamadı");
      if (target.tenantId !== tenantId)
        throw new ForbiddenException("Bu adrese erişim yetkiniz yok");
      if (!target.isActive) {
        throw new ConflictException(
          "Pasif adres default yapılamaz. Önce aktifleştirin.",
        );
      }
      if (target.isDefault) return target; // zaten default

      await tx.tenantAddress.updateMany({
        where: { tenantId, type: target.type, isDefault: true },
        data: { isDefault: false },
      });
      return tx.tenantAddress.update({
        where: { id },
        data: { isDefault: true },
      });
    });
  }

  // ---------- DELETE ----------

  async remove(tenantId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.tenantAddress.findUnique({ where: { id } });
      if (!target) throw new NotFoundException("Adres bulunamadı");
      if (target.tenantId !== tenantId)
        throw new ForbiddenException("Bu adrese erişim yetkiniz yok");

      if (target.isDefault) {
        throw new ConflictException(
          "Default adres silinemez. Önce başka bir adresi default yapın.",
        );
      }
      if (target.isActive) {
        const otherActiveCount = await tx.tenantAddress.count({
          where: {
            tenantId,
            type: target.type,
            isActive: true,
            id: { not: id },
          },
        });
        if (otherActiveCount === 0) {
          throw new ConflictException(
            `Son aktif ${TR_TYPE_LABEL[target.type]} adresi silinemez`,
          );
        }
      }

      await tx.tenantAddress.delete({ where: { id } });
      return { success: true };
    });
  }

  // ---------- SNAPSHOT (tender service için) ----------

  async getAddressSnapshot(
    tenantId: string,
    addressId: string,
  ): Promise<TenantAddressSnapshot> {
    const address = await this.prisma.tenantAddress.findUnique({
      where: { id: addressId },
    });
    if (!address || address.tenantId !== tenantId) {
      throw new NotFoundException("Adres bulunamadı");
    }
    if (!address.isActive) {
      throw new BadRequestException("Pasif adres ihalede kullanılamaz");
    }
    return {
      id: address.id,
      type: address.type,
      title: address.title,
      country: address.country,
      state: address.state,
      city: address.city,
      district: address.district,
      fullAddress: address.fullAddress,
      postalCode: address.postalCode,
      taxOffice: address.taxOffice,
      taxNumber: address.taxNumber,
      contactName: address.contactName,
      contactPhone: address.contactPhone,
      contactEmail: address.contactEmail,
      snapshotAt: new Date().toISOString(),
    };
  }
}

export function formatAddressSnapshotText(
  snapshot: TenantAddressSnapshot,
): string {
  const lines = [
    snapshot.title,
    snapshot.fullAddress,
    `${snapshot.district} / ${snapshot.city}${
      snapshot.postalCode ? ` · ${snapshot.postalCode}` : ""
    }`,
    snapshot.country,
  ];
  if (snapshot.taxOffice) lines.push(`Vergi Dairesi: ${snapshot.taxOffice}`);
  if (snapshot.taxNumber) lines.push(`VKN: ${snapshot.taxNumber}`);
  if (snapshot.contactName)
    lines.push(
      `İletişim: ${snapshot.contactName}${
        snapshot.contactPhone ? ` · ${snapshot.contactPhone}` : ""
      }`,
    );
  return lines.filter(Boolean).join("\n");
}
