import {
  TR_PROVINCES,
  citySlug as sharedCitySlug,
  cityCompanyPath as sharedCityCompanyPath,
  cityProductPath as sharedCityProductPath,
} from "@rothern/shared";

/**
 * ŞEHİR AÇILIŞ SAYFALARININ ADRES ŞEMASI (2026-09-09, Parça 3 — coğrafi SEO).
 *
 * "İstanbul'da çelik boru tedarikçisi" gibi aramalar B2B'de hacmin büyük
 * bölümünü taşır ve bunlar SORGU PARAMETRESİYLE karşılanamaz: `?sehir=` bir
 * süzgeç varyantıdır, kanoniği listenin köküne işaret eder ve indekslenmez.
 * Her ilin KENDİ adresi olmalı ki kendi başlığı, kendi açıklaması ve kendi
 * kanoniği olsun.
 *
 * Slug'da KOD YOK (kategori adresinin tersine): il adları tekildir ve
 * katlanmış hâlleri de tekil kalır — `city.test.ts` 81 ilin çakışmadığını
 * doğrular. Kategoride kod öndeydi çünkü ADLAR tekil değildi.
 *
 * Kaynak `@rothern/shared` `TR_PROVINCES`: firmanın `city` alanı serbest
 * metin ama il adları oradan doğrulanır — uydurma bir "şehir" sayfası
 * üretilmez.
 */

/*
 * UYGULAMA `@rothern/shared` `helpers/public-paths.ts`te (SEO Parça 5): API
 * yayın anında şehir sayfasının adresini de üretip motorlara bildiriyor;
 * iki kopya olsaydı "Iğdır" gibi bir ilde sessizce ayrışırdı.
 */
export const citySlug = sharedCitySlug;

/** Slug → kanonik il adı. Tanınmayan slug `null` — sayfa 404 verir. */
export function cityFromSlug(slug: string): string | null {
  // Ham il adı da ("İstanbul") katlanarak tanınır (arayüz testi D-323):
  // `toLowerCase` "İ"yi "i̇"ye (noktalı) çeviriyordu, eşleşme kaçıyordu.
  const s = citySlug(slug);
  return TR_PROVINCES.find((p) => citySlug(p.name) === s)?.name ?? null;
}

/**
 * Yol parçası → ham değer, BİR KEZ çözülmüş (arayüz testi D-323). Next
 * dinamik parçayı yüzde kodlu verebiliyor (`%C4%B0stanbul`); bu değer API
 * çağrısında yeniden kodlanınca (`%25C4%25B0…`) şehir bulunamıyor, sayfa
 * 404 veriyordu. Bozuk kodlamada (tek başına `%`) değer olduğu gibi döner.
 */
export function decodeCityParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Tüm iller, slug'larıyla — `generateStaticParams` ve bağlantı şeritleri. */
export function allCitySlugs(): { name: string; slug: string }[] {
  return TR_PROVINCES.map((p) => ({ name: p.name, slug: citySlug(p.name) }));
}

export const cityProductPath = sharedCityProductPath;
export const cityCompanyPath = sharedCityCompanyPath;
