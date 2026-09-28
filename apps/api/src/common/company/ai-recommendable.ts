import type { Prisma } from "@rothern/db";
import { tierAtLeast } from "@rothern/shared";
import { anyPackageWhere, effectiveTier } from "./effective-tier";

/**
 * AI TEDARİKÇİ ÖNERİSİNE GİREBİLEN ÜYE — TEK KAYNAK (2026-09-28, kullanıcı:
 * "firma gidip özellikle o şirketi davet ederse ayrı; ama gidip ücretsizi
 * bedavaya davet edip alım talebine sokmak saçma, doğrulanmamış firma").
 *
 * Bağlantısız üye AI önerisine (kalemler paneli, yayın sonrası tur, keşif
 * penceresi) ve AI yoluyla doğrudan talep davetine YALNIZ efektif SILVER+ ∧
 * doğrulanmış ∧ aktif ∧ askıda değilse girer. "Alıcıların AI önerilerinde
 * çıkmak" Silver'ın ve doğrulamanın karşılığıdır. Bağlantılı firma bu kurala
 * GİRMEZ (alıcı zaten tanıyor); alıcının elle yaptığı davet de (bağlantı
 * seçicisi, `addInvitations`) bu kuraldan etkilenmez.
 */
export function aiRecommendableWhere(now: Date = new Date()): Prisma.CompanyWhereInput {
  return {
    ...anyPackageWhere(now),
    companyVerificationStatus: "VERIFIED",
    isActive: true,
    isBlocked: false,
  };
}

export interface AiRecommendableRow {
  tier: string;
  membershipEndAt: Date | null;
  companyVerificationStatus: string;
  isActive: boolean;
  isBlocked: boolean;
}

/** `aiRecommendableWhere` ile birebir (bellek içi okuma). */
export function isAiRecommendable(row: AiRecommendableRow): boolean {
  return (
    row.isActive &&
    !row.isBlocked &&
    row.companyVerificationStatus === "VERIFIED" &&
    tierAtLeast(effectiveTier(row.tier, row.membershipEndAt), "SILVER")
  );
}

/** Kural için gereken kolonlar (Prisma `select`). */
export const AI_RECOMMENDABLE_SELECT = {
  tier: true,
  membershipEndAt: true,
  companyVerificationStatus: true,
  isActive: true,
  isBlocked: true,
} as const;
