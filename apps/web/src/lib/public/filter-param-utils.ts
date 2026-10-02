/**
 * URL süzgeç yardımcıları — ürün, talep ve firma dizinlerinin ORTAK parse
 * ilkelleri (PROMPT 4). Üç şema ayrı dosyada yaşar (alanları farklı), ama
 * "virgüllü liste", "sayı", "tekil/çoklu okuma" tek yerde: ayrışsalardı bir
 * listede `İstanbul, İzmir` çalışıp ötekinde çalışmazdı.
 */
import { citySlug, knownCityName } from "@rothern/shared";

export type SearchParamsLike = Record<string, string | string[] | undefined> | URLSearchParams;

export function getParam(sp: SearchParamsLike, k: string): string | undefined {
  if (sp instanceof URLSearchParams) return sp.get(k) ?? undefined;
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
}

export function getAllParams(sp: SearchParamsLike, k: string): string[] {
  if (sp instanceof URLSearchParams) return sp.getAll(k);
  const v = sp[k];
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

/** Negatif olmayan tam sayı; yoksa undefined. */
export function numParam(v?: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : undefined;
}

/** Virgüllü liste → dizi (boşlar düşer, tavan 10). */
export function listParam(v?: string): string[] {
  return (v ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10);
}

/**
 * Şehir listesi → KALICI ADRES (gözden geçirme, arayüz testi D-336): facet
 * anahtarı kalıcı adres ("izmir"), eski/dış bağlantılar ise ham ad taşıyor
 * (`?il=İzmir`, `?sehir=İstanbul`). Ham değer öylece kalsaydı facet'teki
 * "İzmir 12" işaretsiz kalır, yanına işaretli bir "İzmir 0" kopyası eklenirdi.
 * Tanınan Türk ili katlanıp kalıcı adrese çevrilir; tanınmayan değer (yabancı
 * şehrin adresi "de-munich") olduğu gibi kalır. Tekrarlar düşer.
 */
export function cityListParam(v?: string): string[] {
  return [
    ...new Set(
      listParam(v).map((c) => {
        const province = knownCityName(c);
        return province ? citySlug(province) : c;
      }),
    ),
  ];
}

/** `sayfa` → 1 tabanlı sayfa (1'den küçük/geçersiz → 1). */
export function pageParam(v?: string): number {
  const n = numParam(v);
  return n && n > 1 ? n : 1;
}

/**
 * SON SAYFANIN ÖTESİ (arayüz testi webA-05, yeniden doğrulama): `?sayfa=N`
 * son sayfadan büyükse uç boş liste döner ama toplam doludur. Boş durum
 * "Bu kriterlerle ... bulunamadı" demesin — kriterler eşleşiyor, yalnız bu
 * sayfa boş. Böyle bir sayfada gidilecek SON sayfa numarasını, değilse
 * `null` döner. `pageLimit` herkese açık ucun kabul ettiği en büyük sayfa.
 */
export function pastEndLastPage(
  page: { itemCount: number; total: number; page: number; pageSize: number },
  pageLimit?: number,
): number | null {
  if (page.itemCount > 0 || page.total <= 0 || page.pageSize <= 0) return null;
  const last = Math.ceil(page.total / page.pageSize);
  const capped = pageLimit ? Math.min(last, pageLimit) : last;
  return page.page > capped ? Math.max(1, capped) : null;
}
