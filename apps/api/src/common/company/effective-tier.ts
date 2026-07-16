/**
 * Efektif tier — INV-TIER-1 TEK KAYNAK.
 *
 * Ham `Company.tier` doğrudan yetki/gösterim kararında KULLANILMAZ: üyelik süresi
 * (`membershipEndAt`) geçmişse firma DB'de hâlâ PAKET görünse de efektif olarak
 * STANDARD'dır (lazy — 03:00 downgrade cron'unu beklemez; cron kaçarsa/uyursa
 * süresi bitmiş firma premium yetkiyle işlem yapamasın). Boundary `< Date.now()`
 * JWT + cron ile birebir (grace yok).
 *
 * Bu fonksiyonu ÇAĞIRAN her yüzey (JWT strategy, /me serializeCompany, profil
 * get, bağlantı-geçerlilik filtresi) aynı sonucu verir → web/api ıraksaması olmaz.
 */
export type EffectiveTier = "STANDARD" | "PAKET";

export function effectiveTier(
  tier: string,
  membershipEndAt: Date | null,
): EffectiveTier {
  if (
    tier === "PAKET" &&
    membershipEndAt != null &&
    membershipEndAt.getTime() < Date.now()
  ) {
    return "STANDARD";
  }
  return tier === "PAKET" ? "PAKET" : "STANDARD";
}
