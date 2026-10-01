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

/**
 * AI'ın bulduğu ama alıcıya GÖSTERİLMEYEN firmaya giden çağrının türü
 * (`notifyHiddenAiMatches`). Neden önerilmediğine göre metin ve CTA değişir —
 * yalnız doğrulama durumuna bakmak Silver+ ∧ incelemedeki firmaya "Ücretsiz
 * pakettesiniz, talebi göremiyorsunuz, Silver'a geçin" diyordu (arayüz testi
 * O-056). Paketli firma talebi ZATEN görür; ona yalnız doğrulama anlatılır.
 *  - `verify`         : ücretsiz ∧ doğrulanmamış → önce ücretsiz doğrulama
 *  - `upgrade`        : ücretsiz ∧ doğrulanmış/incelemede → Silver
 *  - `paidPending`    : paketli ∧ doğrulama incelemede → talebi görebilir, onay bekliyor
 *  - `paidVerify`     : paketli ∧ doğrulanmamış/reddedilmiş → talebi görebilir, doğrulansın
 */
export type AiHiddenMatchKind = "verify" | "upgrade" | "paidPending" | "paidVerify";

export function aiHiddenMatchKind(
  row: Pick<AiRecommendableRow, "tier" | "membershipEndAt" | "companyVerificationStatus">,
): AiHiddenMatchKind {
  const paid = tierAtLeast(effectiveTier(row.tier, row.membershipEndAt), "SILVER");
  const status = row.companyVerificationStatus;
  if (paid) return status === "PENDING" ? "paidPending" : "paidVerify";
  return status === "VERIFIED" || status === "PENDING" ? "upgrade" : "verify";
}
