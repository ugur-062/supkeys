import {
  PAID_TIERS,
  TIER_ORDER,
  tierAtLeast,
  type TierName,
} from "@rothern/shared";

/**
 * Efektif tier — INV-TIER-1 TEK KAYNAK (üç paket 2026-09-06: STANDART/SILVER/GOLD).
 *
 * Ham `Company.tier` doğrudan yetki/gösterim kararında KULLANILMAZ: paralı
 * kademelerde (SILVER/GOLD) üyelik süresi (`membershipEndAt`) geçmişse
 * firma DB'de hâlâ paketli görünse de efektif olarak STANDART'tır (lazy —
 * 03:00 downgrade cron'unu beklemez; cron kaçarsa süresi bitmiş firma paket
 * yetkisiyle işlem yapamasın). Boundary `< Date.now()` JWT + cron ile birebir
 * (grace yok). Kademe sırası/karşılaştırma @rothern/shared `tierAtLeast`
 * (api+web+admin tek kaynak).
 *
 * Bu fonksiyonu ÇAĞIRAN her yüzey (JWT strategy, /me serializeCompany, profil
 * get, bağlantı-geçerlilik filtresi) aynı sonucu verir → web/api ıraksaması olmaz.
 */
export type EffectiveTier = TierName; // "STANDART" | "SILVER" | "GOLD"

/**
 * ÜCRETSİZ DÖNEM ANAHTARI (sahip kararı 2026-10-07) — TEK KAYNAK.
 *
 * `VERIFIED_HAS_FULL_ACCESS = true` iken Rothern tamamen ücretsizdir: firma
 * doğrulaması (`companyVerificationStatus = VERIFIED`) tek başına bütün
 * hakları açar; doğrulanmış her firmanın EFEKTİF kademesi "GOLD"dur (limitler,
 * kotalar, AI bütçesi, koltuk, iki panel). Doğrulanmamış firma (UNVERIFIED /
 * PENDING / REJECTED) saklanan kademesiyle kalır — yani bugünkü ücretsiz
 * (STANDART) sınırlar; elinde süresi dolmamış saklı paketi olan firma onu
 * kaybetmez (kimse erişim yitirmez).
 *
 * Anahtar açıkken ayrıca: paket satın alma / yükseltme uçları 410 döner
 * (`assertPackagePurchaseOpen`), üyelik zamanlayıcısı ve paket satan e-posta
 * adımları hiçbir şey yapmaz, yetki reddi metinleri paket değil DOĞRULAMA ister
 * (`entitlement-required.ts`).
 *
 * Ücretli pakete dönüş: bu değeri `false` yap. DB kolonları (`tier`,
 * `membershipEndAt`, `MembershipPeriod`), enum değerleri ve kademe makinesi
 * yerinde durur; `false` iken hesap yalnız saklı kademe + süreye bakar (eski
 * davranış). Kaldırılan ekranlar ve paket adı geçen metinler git geçmişinden
 * geri alınır. Nesne olarak dışa açılır ki testler `jest.replaceProperty` ile
 * çevirebilsin (sözleşme: `free-period.spec.ts`).
 */
export const FREE_PERIOD: { VERIFIED_HAS_FULL_ACCESS: boolean } = {
  VERIFIED_HAS_FULL_ACCESS: true,
};

/** Ücretsiz dönem açık mı? (anahtarın tek okuma noktası) */
export function isFreePeriod(): boolean {
  return FREE_PERIOD.VERIFIED_HAS_FULL_ACCESS;
}

/** Ücretsiz dönemde doğrulanmış firmanın efektif kademesi (en üst kademe). */
export const FREE_PERIOD_VERIFIED_TIER: EffectiveTier = "GOLD";

/**
 * `verificationStatus` ZORUNLU: efektif kademe artık doğrulama durumuna da
 * bağlı; argümanı atlayan çağrı derlenmez (her çağrı noktası select'ine
 * `companyVerificationStatus` eklemek zorunda).
 */
export function effectiveTier(
  tier: string,
  membershipEndAt: Date | null,
  verificationStatus: string | null | undefined,
): EffectiveTier {
  if (isFreePeriod() && verificationStatus === "VERIFIED") {
    return FREE_PERIOD_VERIFIED_TIER;
  }
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

/** `effectiveTier` için gereken üç kolon — select'lerde tek kaynak. */
export const EFFECTIVE_TIER_SELECT = {
  tier: true,
  membershipEndAt: true,
  companyVerificationStatus: true,
} as const;

/** `EFFECTIVE_TIER_SELECT` ile okunan satırdan efektif kademe. */
export function effectiveTierOf(row: {
  tier: string;
  membershipEndAt: Date | null;
  companyVerificationStatus: string | null | undefined;
}): EffectiveTier {
  return effectiveTier(row.tier, row.membershipEndAt, row.companyVerificationStatus);
}

/**
 * Prisma `where` fragment'i: EFEKTİF olarak en az `min` kademesindeki firmalar
 * (INV-TIER-1 tek kaynak — DB-filter tarafı). `effectiveTier` yalnız in-memory
 * çalıştığından, ham `tier` filtresi süresi-dolmuş (lazy) paketliyi de dahil
 * ederdi; bu helper "tier ∈ {≥min paralı kademeler} VE (membershipEndAt yok
 * VEYA gelecekte)" koşulunu tek yerden üretir. Sınır `gte: now` =
 * effectiveTier'ın `< now → STANDART` ile birebir.
 *
 * ÜCRETSİZ DÖNEM: anahtar açıkken koşul "… VEYA companyVerificationStatus =
 * VERIFIED" olur (doğrulanmış firma en üst kademede sayılır — `effectiveTier`
 * ile birebir).
 *
 * Tek anahtarlı (`AND`) döner: sibling top-level `OR` ile çakışmaz. Çağıran
 * kendi `AND`'ini yazıyorsa spread ETMEZ, `AND: [tierAtLeastWhere(..), …]` yazar.
 *
 * Kullanım: `where: { ...tierAtLeastWhere("SILVER"), isActive: true, ... }`.
 */
export function tierAtLeastWhere(min: TierName, now: Date = new Date()) {
  const tiers = PAID_TIERS.filter((t) => tierAtLeast(t, min));
  const stored = {
    tier: { in: [...tiers] },
    OR: [{ membershipEndAt: null }, { membershipEndAt: { gte: now } }],
  };
  return {
    AND: [
      isFreePeriod()
        ? { OR: [{ companyVerificationStatus: "VERIFIED" as const }, stored] }
        : stored,
    ],
  };
}

/** Herhangi bir pakette (efektif SILVER+; üç paket 2026-09-06) — dizin/keşfet/sitemap/duyuru filtresi. */
export function anyPackageWhere(now: Date = new Date()) {
  return tierAtLeastWhere("SILVER", now);
}
