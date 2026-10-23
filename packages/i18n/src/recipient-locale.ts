import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";

/**
 * KAYITSIZ ALICININ DİLİ — tek kaynak (2026-09-27, kullanıcı kararı "ülkeden
 * türet"). Kayıtlı kullanıcıya her zaman `CompanyUser.locale` ile yazılır;
 * bu kural yalnız henüz hesabı OLMAYAN alıcı içindir: dış talep daveti, AI ile
 * bulunan tedarikçi, "tedarikçini davet et", ekip daveti varsayılanı.
 *
 * Eşleme:
 *  - Türkçe: TR, KKTC (XN) ve Azerbaycan (Azerbaycan Türkçesi Türkçeye çok
 *    yakın; Türkiye kökenli platform).
 *  - Rusça: Rusçanın resmî/eş resmî olduğu RU, BY, KZ, KG ve iş dili olarak
 *    yaygın olduğu UZ, TJ, TM, AM.
 *  - Geri kalan her ülke İngilizce — Ukrayna, Gürcistan, Moldova ve Baltıklar
 *    BİLİNÇLİ olarak İngilizce (Rusça siyasi olarak hassas / AB üyesi).
 *
 * Ülke bilinmiyorsa e-posta ya da web sitesi uzantısı (ccTLD) denenir; genel
 * uzantı (.com, .net…) hiçbir şey söylemez — o durumda çağıranın yedeği
 * (davet edenin dili) kullanılır, İngilizce DEĞİL: davetlerin çoğu yurtiçi ve
 * Türk firmalarının çoğu .com kullanır.
 */

const TR_COUNTRIES = new Set(["TR", "XN", "AZ"]);
const RU_COUNTRIES = new Set(["RU", "BY", "KZ", "KG", "UZ", "TJ", "TM", "AM"]);

/** Ülke kodu (ISO 3166-1 alpha-2; KKTC `XN`, Kosova `XK`) → dil. Bilinmeyen/boş → null. */
export function localeForCountry(country: string | null | undefined): Locale | null {
  const cc = (country ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  if (TR_COUNTRIES.has(cc)) return "tr";
  if (RU_COUNTRIES.has(cc)) return "ru";
  return "en";
}

/** Uzantı → ülke; yalnız dil kararını DEĞİŞTİREN uzantılar (genel uzantılar yok). */
const TLD_COUNTRY: Record<string, string> = {
  tr: "TR",
  az: "AZ",
  ru: "RU",
  su: "RU",
  "рф": "RU",
  by: "BY",
  kz: "KZ",
  kg: "KG",
  uz: "UZ",
  tj: "TJ",
  tm: "TM",
  am: "AM",
};

/**
 * E-posta adresi ya da web sitesinin ülke uzantısından dil. Yalnız dili
 * belirleyen uzantılar (Türkçe/Rusça ülkeler) sonuç verir; `.de`, `.com`
 * gibi uzantılar null döner — İngilizceye karar vermek ülke bilgisinin işi
 * (`.de` Almanca demek, ama Almanca dilimiz yok; genel uzantı yurtiçi de
 * olabilir).
 */
export function localeForDomain(emailOrUrl: string | null | undefined): Locale | null {
  const raw = (emailOrUrl ?? "").trim().toLowerCase();
  if (!raw) return null;
  let host = raw.includes("@") ? raw.slice(raw.lastIndexOf("@") + 1) : raw;
  host = host.replace(/^[a-z]+:\/\//, "").split(/[/?#:]/)[0] ?? "";
  const tld = host.split(".").filter(Boolean).pop();
  if (!tld) return null;
  return localeForCountry(TLD_COUNTRY[tld] ?? null);
}

/**
 * Alıcının dili, öncelik sırasıyla: açık seçim (ekranda satır başına) →
 * ülke → e-posta uzantısı → site uzantısı → yedek (davet edenin dili).
 */
export function recipientLocale(input: {
  explicit?: string | null;
  country?: string | null;
  email?: string | null;
  website?: string | null;
  fallback?: Locale | null;
}): Locale {
  if (isLocale(input.explicit)) return input.explicit;
  return (
    localeForCountry(input.country) ??
    localeForDomain(input.email) ??
    localeForDomain(input.website) ??
    input.fallback ??
    DEFAULT_LOCALE
  );
}
