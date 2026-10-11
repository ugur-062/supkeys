/**
 * Firma tam yetkili mi (satınalma yetkisi verilebilir mi) — admin aynası.
 *
 * ÜCRETSİZ DÖNEM (sahip kararı 2026-10-07): doğrulanmış her firma tam yetkili
 * sayılır; doğrulanmamış firma temel sınırlarda kalır; önceden tanımlanmış,
 * süresi geçmemiş tam yetki korunur. Otorite API'dir
 * (`apps/api/src/common/company/effective-tier.ts` —
 * `FREE_PERIOD.VERIFIED_HAS_FULL_ACCESS` + `effectiveTier`); admin paylaşılan pakete
 * bağlı olmadığı için kural burada yansıtılır. API firma detayında efektif
 * değeri ayrı alanla (`effectiveTier`) verirse o okunur; vermezse ham alan +
 * doğrulama durumundan türetilir.
 *
 * Ücretli üyelik döndüğünde bu sabit API'deki anahtarla BİRLİKTE kapatılır.
 */
export const FREE_PERIOD_VERIFIED_HAS_FULL_ACCESS = true;

/** En üst yetki kademesinin API kodu (iç tanımlayıcı; ekrana basılmaz). */
const FULL_ACCESS_CODE = "GOLD";

export function hasFullAccess(
  c: {
    tier: string;
    effectiveTier?: string | null;
    membershipEndAt?: string | null;
    companyVerificationStatus?: string | null;
  },
  now: number = Date.now(),
): boolean {
  // API efektif değeri verdiyse otorite odur (kural yeniden türetilmez).
  if (c.effectiveTier) return c.effectiveTier === FULL_ACCESS_CODE;
  if (
    c.tier === FULL_ACCESS_CODE &&
    (!c.membershipEndAt || new Date(c.membershipEndAt).getTime() >= now)
  ) {
    return true;
  }
  return (
    FREE_PERIOD_VERIFIED_HAS_FULL_ACCESS &&
    c.companyVerificationStatus === "VERIFIED"
  );
}
