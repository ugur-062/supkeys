/**
 * URL süzgeç yardımcıları — ürün, talep ve firma dizinlerinin ORTAK parse
 * ilkelleri (PROMPT 4). Üç şema ayrı dosyada yaşar (alanları farklı), ama
 * "virgüllü liste", "sayı", "tekil/çoklu okuma" tek yerde: ayrışsalardı bir
 * listede `İstanbul, İzmir` çalışıp ötekinde çalışmazdı.
 */
import { citySlug, isHiddenCategory, knownCityName } from "@rothern/shared";

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
 * Virgüllü liste parametrelerinin API tavanı (`PublicProductQueryDto` /
 * `PublicListQueryDto` / `PublicDirectoryQueryDto`: `city`, `cert`
 * `@MaxLength(400)`). Ana liste çağrısı 404 dışındaki 4xx'te kesinti sayılıp
 * hata attığı için (`marketplace-api.ts` getJson) elle uzatılmış bir URL
 * (`?sehir=<401+ karakter>`) eskiden boş liste, şimdi hata sayfası çizerdi —
 * ayrıştırıcı tavanı aşan girdiyi API'ye hiç göndermez.
 */
export const FILTER_LIST_MAX_LENGTH = 400;

/**
 * Listeyi virgülle birleşik uzunluğu `max`'ı aşmayacak şekilde keser: sıra
 * korunur, sığmayan ilk girdiden itibaren gerisi düşer (tek başına sığmayan
 * dev girdi de düşer).
 */
export function capJoinedList(items: string[], max = FILTER_LIST_MAX_LENGTH): string[] {
  const out: string[] = [];
  let length = 0;
  for (const item of items) {
    const next = length + (out.length ? 1 : 0) + item.length;
    if (next > max) break;
    out.push(item);
    length = next;
  }
  return out;
}

/**
 * Şehir listesi → KALICI ADRES (gözden geçirme, arayüz testi D-336): facet
 * anahtarı kalıcı adres ("izmir"), eski/dış bağlantılar ise ham ad taşıyor
 * (`?il=İzmir`, `?sehir=İstanbul`). Ham değer öylece kalsaydı facet'teki
 * "İzmir 12" işaretsiz kalır, yanına işaretli bir "İzmir 0" kopyası eklenirdi.
 * Tanınan Türk ili katlanıp kalıcı adrese çevrilir; tanınmayan değer (yabancı
 * şehrin adresi "de-munich") olduğu gibi kalır. Tekrarlar düşer; birleşik
 * değer API tavanını (`FILTER_LIST_MAX_LENGTH`) aşmaz.
 */
export function cityListParam(v?: string): string[] {
  return capJoinedList([
    ...new Set(
      listParam(v).map((c) => {
        const province = knownCityName(c);
        return province ? citySlug(province) : c;
      }),
    ),
  ]);
}

/**
 * `?kategori=` KODU — DÖRT şemanın (ürün, talep, firma dizini, Açık Talepler)
 * ortak sınaması: 8 haneli kod VE görünür kategori.
 *
 * GİZLİ bir önekin (segment, aile ya da sınıf — `isHiddenCategory`) altındaki
 * kod (2026-10-09, sahip kararı: "anasayfada olmayan kategori başka yerde de
 * gösterilmesin") HİÇ VERİLMEMİŞ sayılır: liste süzülmez, aktif
 * çip / işaretli seçenek çizilmez, kod API'ye gitmez. Aksi hâlde elle yazılan
 * ya da eski bir bağlantıdan gelen `?kategori=77000000` listeyi gizli
 * segmente daraltıp adını (ya da ham kodunu) aktif süzgeç olarak basıyordu.
 * Görünür segmentin gizli dalı da aynıdır: `?kategori=46101500` süzgeç değil,
 * `?kategori=46000000` / `46181500` süzgeçtir (2026-10-10).
 * Herkese açık ve panel yüzeyleri aynı ayrıştırıcıları okuduğu için tek geçiş
 * noktası burasıdır; API de aynı kodu süzgeç yokmuş gibi yanıtlar.
 */
export function isVisibleCategoryCode(code: string | null | undefined): code is string {
  return !!code && /^\d{8}$/.test(code) && !isHiddenCategory(code);
}

/** Tek değerli `?kategori=`: geçerli ve görünürse kod, değilse `undefined`. */
export function categoryParam(v?: string): string | undefined {
  return isVisibleCategoryCode(v) ? v : undefined;
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
