import { countryName } from "../data/countries";

/**
 * TALEP GÖRÜNÜRLÜK ÜLKESİ — TEK KAYNAK (2026-09-21, kullanıcı kararı:
 * "yurtiçi/uluslararası kavramı yerine tüm alım talepleri görülsün herkese;
 * sadece belirli ülkelerde de açabilsin").
 *
 * `Listing.targetCountries` = talebi hangi ülkelerdeki tedarikçilerin
 * gördüğü. BOŞ = tüm ülkeler (varsayılan). Dolu = yalnız o ülkeler.
 * `isInternational` kolonu artık kural taşımaz; yalnız TÜRETİLİR (eski
 * projeksiyonlar bozulmasın): "yalnız kendi ülkesi" değilse true.
 *
 * Şartlar (teslim şekli, ödeme) ülkeye göre süzülmez: alıcı tek şart koyar,
 * tedarikçi o şarta göre fiyatlar. Adalet teslim NOKTASINDAN gelir — bkz.
 * `sellerDoorPriceWarning`.
 */

/** Yalnız sahibin ülkesi mi seçilmiş? */
export function isDomesticOnly(targetCountries: readonly string[], ownerCountry: string | null | undefined): boolean {
  return targetCountries.length === 1 && !!ownerCountry && targetCountries[0] === ownerCountry;
}

/** Eski `isInternational` kolonu için türetim (kural DEĞİL, gösterim/uyum). */
export function deriveIsInternational(targetCountries: readonly string[], ownerCountry: string | null | undefined): boolean {
  return !isDomesticOnly(targetCountries, ownerCountry);
}

/** İzleyen ülke talebi görebilir mi? Boş liste = herkes. */
export function countryCanSee(targetCountries: readonly string[], viewerCountry: string | null | undefined): boolean {
  if (targetCountries.length === 0) return true;
  return !!viewerCountry && targetCountries.includes(viewerCountry);
}

/** Hedef ülke listesini temizler: büyük harf, tekil, geçerli 2 harf. */
export function normalizeTargetCountries(input: readonly string[] | null | undefined): string[] {
  const out = new Set<string>();
  for (const c of input ?? []) {
    const code = String(c ?? "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) out.add(code);
  }
  return [...out];
}

/**
 * Kart/detay etiketi: "Tüm ülkeler" · "Yalnız Türkiye" · "Türkiye, Almanya"
 * · "Türkiye +3 ülke". `ownerCountry` verilirse tek ülke = sahibin ülkesi
 * "Yalnız …" diye okunur.
 *
 * i18n (Faz 3): bu TÜRKÇE YEDEKTİR. Dil bilen yüzey web'deki `useScopeLabel`
 * (`web.domain.scope.*` + `Intl.DisplayNames` ülke adı); API'de çağrı yeri
 * yoktur. Metin gerekiyorsa önce tüketicinin hook'una bak.
 */
export function scopeLabel(targetCountries: readonly string[], ownerCountry?: string | null): string {
  if (targetCountries.length === 0) return "Tüm ülkeler";
  if (targetCountries.length === 1) {
    const name = countryName(targetCountries[0]!);
    return ownerCountry && targetCountries[0] === ownerCountry ? `Yalnız ${name}` : name;
  }
  if (targetCountries.length <= 2) return targetCountries.map((c) => countryName(c)).join(", ");
  return `${countryName(targetCountries[0]!)} +${targetCountries.length - 1} ülke`;
}

/** Tedarikçinin kapısında teslim: navlun/gümrük fiyata girmez. */
export const SELLER_DOOR_DELIVERY_TERMS: readonly string[] = ["EXW", "FCA", "FAS", "FOB", "DOMESTIC_PICKUP", "DOMESTIC_CARRIER_COLLECT"];

/**
 * Farklı ülkelerden gelen teklifler aynı ölçekte olmaz uyarısı: teslim
 * noktası tedarikçinin kapısıysa VE talep birden fazla ülkeye açıksa.
 */
export function sellerDoorPriceWarning(
  targetCountries: readonly string[],
  ownerCountry: string | null | undefined,
  deliveryTerm: string | null | undefined,
): boolean {
  if (!deliveryTerm || !SELLER_DOOR_DELIVERY_TERMS.includes(deliveryTerm)) return false;
  return !isDomesticOnly(targetCountries, ownerCountry);
}
