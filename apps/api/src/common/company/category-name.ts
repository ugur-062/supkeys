import { slugifyText } from "@rothern/shared";
import type { Locale } from "@rothern/i18n";
import { currentLocale } from "../i18n/locale-context";

/**
 * Kategori adı — okuyucunun dilinde (i18n Faz 4, 2026-09-23).
 *
 * Tek kaynak: `categories.nameTr` (Türkçe, seed) + `nameEn`/`nameRu`
 * (`category-names.i18n.tsv`, Gemini Pro toplu çevirisi). Çeviri yoksa
 * Türkçeye düşer — eksik ad hiçbir yerde boş çıkmaz.
 *
 * Kural: kategori SATIRI seçilirken `...CATEGORY_NAME_SELECT`, satır yanıta
 * dönüşürken `categoryName(row)` ya da toplu `localizeCategoryRows(rows)`
 * (nameTr'yi yerinde localize eder; `nameTr` okuyan eski kod değişmeden
 * doğru dili basar). ADRES slug'ı HER ZAMAN Türkçe addan (`categorySlug`) —
 * `/en/urunler/kategori/<kod>-<tr-slug>` = `/urunler/kategori/<kod>-<tr-slug>`;
 * çevrilmiş addan slug üretmek dile göre değişen adres ve 308 zinciri demekti
 * (talep slug'ıyla aynı karar, Faz 1e kapanışı).
 */
export const CATEGORY_NAME_SELECT = { nameTr: true, nameEn: true, nameRu: true } as const;

export interface CategoryNameRow {
  nameTr: string;
  nameEn?: string | null;
  nameRu?: string | null;
}

export function categoryName(row: CategoryNameRow, locale: Locale = currentLocale()): string {
  if (locale === "en") return row.nameEn?.trim() || row.nameTr;
  if (locale === "ru") return row.nameRu?.trim() || row.nameTr;
  return row.nameTr;
}

/** Satır dizisini okuyucunun diline çevirir: `nameTr` ← yerel ad, `nameEn`/`nameRu` yanıttan düşer. */
export function localizeCategoryRows<T extends CategoryNameRow>(
  rows: T[],
  locale: Locale = currentLocale(),
): Omit<T, "nameEn" | "nameRu">[] {
  return rows.map((r) => {
    const { nameEn: _en, nameRu: _ru, ...rest } = r;
    return { ...rest, nameTr: categoryName(r, locale) };
  });
}

/** Adres parçası — dilden bağımsız (Türkçe ad). Web `categoryHref` bunu kullanır. */
export function categorySlug(nameTr: string): string {
  return slugifyText(nameTr);
}
