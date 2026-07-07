import { BadRequestException } from "@nestjs/common";
import {
  isValidEmailLike,
  isValidIbanTr,
  isValidMersis,
  normalizeIban,
} from "@rothern/shared";

export interface CorporateIdentityInput {
  mersisNo?: string;
  tradeRegistryNo?: string;
  kepAddress?: string;
  iban?: string;
  ibanHolder?: string;
}

export interface CorporateIdentityData {
  mersisNo?: string | null;
  tradeRegistryNo?: string | null;
  kepAddress?: string | null;
  iban?: string | null;
  ibanHolder?: string | null;
}

/**
 * Madde 29 — FAZ 3.1 kurumsal kimlik alanlarını doğrular + Prisma update
 * data objesi üretir. Tenant + Supplier servisleri paylaşır. Boş string → null.
 */
export function buildCorporateIdentityData(
  dto: CorporateIdentityInput,
): CorporateIdentityData {
  const data: CorporateIdentityData = {};

  if (dto.mersisNo !== undefined) {
    const v = dto.mersisNo.trim();
    if (!isValidMersis(v)) {
      throw new BadRequestException("MERSİS no boş veya 16 haneli olmalıdır");
    }
    data.mersisNo = v || null;
  }
  if (dto.tradeRegistryNo !== undefined) {
    data.tradeRegistryNo = dto.tradeRegistryNo.trim() || null;
  }
  if (dto.kepAddress !== undefined) {
    const v = dto.kepAddress.trim();
    if (v && !isValidEmailLike(v)) {
      throw new BadRequestException("KEP adresi geçerli bir e-posta olmalıdır");
    }
    data.kepAddress = v || null;
  }
  if (dto.iban !== undefined) {
    const v = dto.iban.trim();
    if (v && !isValidIbanTr(v)) {
      throw new BadRequestException("IBAN geçersiz (TR, 26 hane olmalı)");
    }
    data.iban = v ? normalizeIban(v) : null;
  }
  if (dto.ibanHolder !== undefined) {
    data.ibanHolder = dto.ibanHolder.trim() || null;
  }

  return data;
}
