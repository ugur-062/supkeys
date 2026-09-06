import { SetMetadata } from "@nestjs/common";
import type { TierName } from "@rothern/shared";

export const COMPANY_TIER_KEY = "company_min_tier";

/**
 * Üç paket (2026-09-06): `CompanyPaidTierGuard` bu metadata'yı okur.
 * Verilmezse SILVER (herhangi bir paket). Satınalma paneli özellikleri
 * (raporlar, şablonlar, onay akışı, talep AI'ı) `@RequireTier("GOLD")`.
 */
export const RequireTier = (tier: TierName) => SetMetadata(COMPANY_TIER_KEY, tier);
