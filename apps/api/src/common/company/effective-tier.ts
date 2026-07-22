import {
  PAID_TIERS,
  TIER_ORDER,
  tierAtLeast,
  type TierName,
} from "@rothern/shared";

/**
 * Efektif tier — INV-TIER-1 TEK KAYNAK (Faz T: 4 kademe STANDART/BRONZ/SILVER/GOLD).
 *
 * Ham `Company.tier` doğrudan yetki/gösterim kararında KULLANILMAZ: paralı
 * kademelerde (BRONZ/SILVER/GOLD) üyelik süresi (`membershipEndAt`) geçmişse
 * firma DB'de hâlâ paketli görünse de efektif olarak STANDART'tır (lazy —
 * 03:00 downgrade cron'unu beklemez; cron kaçarsa süresi bitmiş firma paket
 * yetkisiyle işlem yapamasın). Boundary `< Date.now()` JWT + cron ile birebir
 * (grace yok). Kademe sırası/karşılaştırma @rothern/shared `tierAtLeast`
 * (api+web+admin tek kaynak).
 *
 * Bu fonksiyonu ÇAĞIRAN her yüzey (JWT strategy, /me serializeCompany, profil
 * get, bağlantı-geçerlilik filtresi) aynı sonucu verir → web/api ıraksaması olmaz.
 */
export type EffectiveTier = TierName; // "STANDART" | "BRONZ" | "SILVER" | "GOLD"

export function effectiveTier(
  tier: string,
  membershipEndAt: Date | null,
): EffectiveTier {
  // Bilinmeyen/eski değer → STANDART (fail-closed).
  const known = (tier in TIER_ORDER ? tier : "STANDART") as EffectiveTier;
  if (
    known !== "STANDART" &&
    membershipEndAt != null &&
    membershipEndAt.getTime() < Date.now()
  ) {
    return "STANDART";
  }
  return known;
}

/**
 * Prisma `where` fragment'i: EFEKTİF olarak en az `min` kademesindeki firmalar
 * (INV-TIER-1 tek kaynak — DB-filter tarafı). `effectiveTier` yalnız in-memory
 * çalıştığından, ham `tier` filtresi süresi-dolmuş (lazy) paketliyi de dahil
 * ederdi; bu helper "tier ∈ {≥min paralı kademeler} VE (membershipEndAt yok
 * VEYA gelecekte)" koşulunu tek yerden üretir. Sınır `gte: now` =
 * effectiveTier'ın `< now → STANDART` ile birebir. OR, sibling top-level `OR`
 * ile çakışmasın diye AND'e sarılıdır.
 *
 * Kullanım: `where: { ...tierAtLeastWhere("SILVER"), isActive: true, ... }`.
 */
export function tierAtLeastWhere(min: TierName, now: Date = new Date()) {
  const tiers = PAID_TIERS.filter((t) => tierAtLeast(t, min));
  return {
    tier: { in: [...tiers] },
    AND: [
      { OR: [{ membershipEndAt: null }, { membershipEndAt: { gte: now } }] },
    ],
  };
}

/** Herhangi bir pakette (efektif BRONZ+) — dizin/keşfet/sitemap/duyuru filtresi. */
export function anyPackageWhere(now: Date = new Date()) {
  return tierAtLeastWhere("BRONZ", now);
}
