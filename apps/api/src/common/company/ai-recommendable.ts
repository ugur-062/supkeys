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
 * çıkmak" doğrulamanın karşılığıdır (ücretsiz dönemde doğrulanmış firma zaten
 * efektif en üst kademededir). Bağlantılı firma bu kurala
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
    tierAtLeast(effectiveTier(row.tier, row.membershipEndAt, row.companyVerificationStatus), "SILVER")
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
 * (`notifyHiddenAiMatches`). Neden önerilmediğine göre metin ve CTA değişir
 * (arayüz testi O-056). Metinler paket adı ANMAZ (ücretsiz dönem, sahip kararı
 * 2026-10-07): tek çağrı firma DOĞRULAMASIDIR.
 *  - `verify`      : talebi göremiyor ∧ doğrulanmamış/reddedilmiş → doğrulansın
 *  - `pending`     : talebi göremiyor ∧ doğrulama incelemede → onay bekliyor
 *  - `paidPending` : talebi görebiliyor (saklı paket) ∧ incelemede → onay bekliyor
 *  - `paidVerify`  : talebi görebiliyor (saklı paket) ∧ doğrulanmamış → doğrulansın
 *  - `null`        : talebi göremiyor ∧ DOĞRULANMIŞ — yalnız ücretsiz dönem
 *                    anahtarı kapalıyken oluşur; söylenecek paketsiz bir çağrı
 *                    yok → bildirim gönderilmez.
 */
export type AiHiddenMatchKind = "verify" | "pending" | "paidPending" | "paidVerify";

export function aiHiddenMatchKind(
  row: Pick<AiRecommendableRow, "tier" | "membershipEndAt" | "companyVerificationStatus">,
): AiHiddenMatchKind | null {
  const paid = tierAtLeast(effectiveTier(row.tier, row.membershipEndAt, row.companyVerificationStatus), "SILVER");
  const status = row.companyVerificationStatus;
  if (paid) return status === "PENDING" ? "paidPending" : "paidVerify";
  if (status === "VERIFIED") return null;
  return status === "PENDING" ? "pending" : "verify";
}
