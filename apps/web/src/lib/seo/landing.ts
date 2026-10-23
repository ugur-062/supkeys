import { pastEndLastPage, type SearchParamsLike } from "@/lib/public/filter-param-utils";
import { buildListingFilterQuery, parseListingFilters } from "@/lib/public/listing-filter-params";
import { buildProductFilterQuery, parseProductFilters } from "@/lib/public/product-filter-params";

/**
 * LİSTE / AÇILIŞ SAYFASI SEO KURALLARI — TEK KAYNAK (2026-09-27 SEO denetimi).
 *
 * Sayfa metası, ItemList JSON-LD'si ve sitemap AYNI eşiği ve AYNI kanonik
 * sayfa numarasını okur; ayrışsalardı sitemap'te olup `noindex` taşıyan ya da
 * kanoniği başka sayfayı gösteren adresler üretirdik.
 */

/**
 * Şehir/ülke açılış sayfasının İNDEKSLENME eşiği: en az bu kadar ürün. Dünya
 * şehir listesiyle (33,7 bin şehir) tek ürünlük binlerce "ince" sayfa doğuyordu
 * — alan otoritesini aşındırır. Altında sayfa DURUR (ziyaretçiye dürüst liste)
 * ama `noindex` alır ve sitemap'e girmez. Kategori sayfası bu kurala tabi değil
 * (yalnız görünür segmentler; boş segment zaten 404).
 */
export const MIN_LANDING_PRODUCTS = 3;

/** Açılış sayfası indekslenebilir mi — sayfa `noindex`i ve sitemap süzgeci aynı fonksiyondan. */
export function landingIndexable(count: number): boolean {
  return count >= MIN_LANDING_PRODUCTS;
}

/**
 * KANONİK SAYFA NUMARASI (Google önerisi, 2026-09-27 — önceki "sayfalama iniş
 * adresinde kanonik" kararını tersine çevirir): yalnız `?sayfa=N` (N>1) taşıyan
 * adres KENDİ kanoniğidir; başka süzgeç, arama, sıralama ya da sayfa başına
 * adet varsa varyant TABANA işaret eder (1 döner) — süzgeçli 2. sayfa, tabanın
 * 2. sayfası değildir. Görünüm tercihi (`gorunum=liste`) içeriği değiştirmez,
 * sayılmaz. Açılış sayfasında yoldaki süzgeç (kategori/şehir/ülke) sorguda
 * zaten yoktur.
 */
export function canonicalProductListPage(sp: SearchParamsLike): number {
  const state = parseProductFilters(sp);
  const rest = buildProductFilterQuery({ ...state, view: undefined, page: 1 });
  return rest === "" ? state.page : 1;
}

/** Alım talebi dizini için aynı kural (`durum=hepsi` arşiv görünümü de süzgeçtir). */
export function canonicalListingListPage(sp: SearchParamsLike): number {
  const state = parseListingFilters(sp);
  const rest = buildListingFilterQuery({ ...state, page: 1 });
  return rest === "" ? state.page : 1;
}

/**
 * SON SAYFANIN ÖTESİ İNDEKSLENMEZ (2026-10-10). `?sayfa=N` son sayfadan
 * büyükken sayfa 200 döner ve "Bu sayfada sonuç yok" çizer (gövde:
 * `pastEndLastPage`); metası ise `index, follow` ve KENDİ kanoniğini
 * (`?sayfa=N`) basıyordu — var olmayan bir sayfa arama motoruna gerçek sayfa
 * diye sunuluyordu. Bu işlev `true` dönerse çağıran `buildMetadata({ noindex })`
 * geçer (gövde durur; `noindex` sayfa kendi adresini söylemeyi sürdürür).
 *
 * `page`: KANONİK sayfa numarası (`canonicalProductListPage` /
 * `canonicalListingListPage`) — yalnız `?sayfa=N` taşıyan adreste N, süzgeçli
 * varyantta 1 (o zaten tabana işaret eder, bu kural onu ilgilendirmez).
 * Gerçek `?sayfa=N` sayfası (N ≤ son sayfa) kendi kanoniğiyle indekslenir —
 * kural yalnız son sayfanın ÖTESİNİ kapatır. `pageLimit`: ucun kabul ettiği en
 * büyük sayfa; ötesi son kabul edilen sayfanın içeriğini başka bir adreste
 * yineler, o da indekslenmez.
 *
 * Son sayfa hesabı gövdeyle AYNI işlevden (`pastEndLastPage`) — ayrışamazlar.
 * Toplam ya da sayfa boyu bilinmiyorsa (≤ 0) karar verilmez (`false`): boş
 * liste çağıranın kendi kuralıdır (kategori 404, şehir eşiği, boş dizin).
 *
 * BUGÜN UYGULAYAN: yalnız sektör sayfası (`/urunler/kategori/<kod>-<ad>`; toplam
 * ve sayfa boyu `resolveSegmentLanding`in zaten yaptığı okumadan gelir). Ürün
 * dizini, şehir / ülke açılış sayfaları ve talep dizini aynı açığı taşır ve bu
 * işlevi HENÜZ çağırmaz (metaları toplamı / sayfa boyunu ayrıca okumak zorunda).
 */
export function listPagePastEnd(
  page: number,
  list: { total: number; pageSize: number },
  pageLimit?: number,
): boolean {
  return pastEndLastPage({ itemCount: 0, total: list.total, page, pageSize: list.pageSize }, pageLimit) != null;
}

/**
 * Kanonik adrese 308 atan açılış sayfaları SORGUYU KORUR (`?sayfa=2` düşerse
 * 2. sayfa 1. sayfayı açar). Next `searchParams` nesnesinden sorgu dizesi.
 */
export function queryStringOf(sp: SearchParamsLike | undefined): string {
  if (!sp) return "";
  if (sp instanceof URLSearchParams) {
    const s = sp.toString();
    return s ? `?${s}` : "";
  }
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    for (const one of Array.isArray(v) ? v : [v]) out.append(k, one);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}
