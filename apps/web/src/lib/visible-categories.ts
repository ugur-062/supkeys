import { isHiddenCategory, visibleCategoryIds } from "@rothern/shared";

/**
 * GİZLİ KATEGORİ KURALI — web'in TEK süzgeci (2026-10-09, sahip kararı:
 * "anasayfada olmayan kategori talepte, üründe ya da başka yerde de
 * gösterilmesin"). Kaynak `@rothern/shared` `HIDDEN_CATEGORY_PREFIXES`
 * (`isHiddenCategory`); buradaki yardımcılar yalnız API'den gelen
 * `{ id, name }` / `{ code, name }` nesnelerini aynı kurala indirir.
 *
 * KURALIN BİRİMİ KOD ÖNEKİDİR (2026-10-10): tümüyle gizli segment (2 hane),
 * görünür segmentin gizli ailesi (4 hane) ya da görünür ailenin gizli sınıfı
 * (6 hane). "Gizli mi" sorusu kodun TAMAMIYLA sorulur; kod önce segmente
 * yuvarlanıp sonra sınanmaz (`46101500` gizli, segmenti `46000000` görünür).
 * Ata zinciri saklayan firma beyanı ayrıca `visibleCompanyCategorySelection`
 * ister (gizli seçimin görünür atası geride kalmasın).
 *
 * Eski kayıt (gizli dalda saklanmış ürün, talep, firma beyanı) DURUR;
 * yalnız gizli kategorisi hiçbir okumada görünmez: ad, çip, kırıntı, bağlantı,
 * süzgeç seçeneği, sayı, meta açıklaması, JSON-LD, OG kartı. API aynı süzgeci
 * uygular; web İKİNCİ kattır (eski API yanıtı, önbellekteki sayfa, kendi
 * ürettiği bağlantı). Eşleştirme ve bildirim saklanan kodların tamamını
 * kullanır — bu modül yalnız GÖSTERİM ve SUNUM içindir.
 *
 * Görünür kategorisi kalmayan kayıtta çağıran "kategori yok" yolunu izler:
 * boş satır, sahipsiz ayraç ya da 404'e giden bağlantı çizilmez.
 */
type CategoryRefLike = { id: string } | { code: string };

function codeOf(ref: CategoryRefLike): string {
  return "id" in ref ? ref.id : ref.code;
}

/** Gizli bir önekin altındaki kategori nesneleri düşer; sıra korunur. */
export function visibleCategoryRefs<T extends CategoryRefLike>(refs: readonly T[] | null | undefined): T[] {
  return (refs ?? []).filter((ref) => !!ref && !isHiddenCategory(codeOf(ref)));
}

/** Tek kategori nesnesi için aynı kural: yoksa ya da gizliyse `null`. */
export function visibleCategoryRef<T extends CategoryRefLike>(ref: T | null | undefined): T | null {
  return ref && !isHiddenCategory(codeOf(ref)) ? ref : null;
}

/**
 * LİSTE SATIRI: çizilecek kategoriler + "+N kategori" sayacı.
 *
 * Panel satırları ilk birkaç kategoriyi adıyla, kalanını yalnız SAYI olarak
 * (`extraCategoryCount`) taşır; sayıyı API ham kod listesinden üretir. Satırda
 * gizli bir kategori geldiyse API o yanıtta gizlileri süzmemiş demektir —
 * sayacın içinde de gizli kod olabilir ve kaçının gizli olduğu buradan
 * bilinemez. O durumda sayaç SIFIRLANIR: gizli kategoriyi "+1" diye saymak da
 * onu göstermektir. Süzen API'de (güncel) liste ve sayaç aynen geçer.
 */
export function visibleRowCategories<T extends CategoryRefLike>(
  categories: readonly T[] | null | undefined,
  extraCount: number | null | undefined,
): { categories: T[]; extraCount: number } {
  const all = categories ?? [];
  const visible = visibleCategoryRefs(all);
  const trusted = visible.length === all.length;
  return { categories: visible, extraCount: trusted ? Math.max(0, extraCount ?? 0) : 0 };
}

/**
 * KATEGORİ KIRILIMI SATIRLARI — pano grafikleri ("Ana kategori bazlı
 * tasarrufum", "Kategori bazlı kazanma oranı").
 *
 * Kural (2026-10-09): gizli segmentin tutarı API'de mevcut "diğer" kovasına
 * gider, satır ASLA gizli adla gelmez. Web yalnız ETİKETİ alır; toplamı ve
 * oranı yeniden kuramaz (payda API'de), o yüzden kovalama burada yapılamaz.
 * Burası ikinci kattır ve yalnız gizli olduğunu KANITLAYABİLDİĞİ satırı düşürür:
 *   - satır segment kodunu taşıyorsa (`id`) ve kod gizliyse,
 *   - etiketin kendisi ham bir kodsa (API adı bulamayınca kodu basar) ve gizliyse.
 * Kanıt yoksa satır aynen geçer — ada bakarak tahmin yürütülmez.
 */
export function visibleBreakdownRows<T extends { label: string; id?: string | null }>(
  rows: readonly T[] | null | undefined,
): T[] {
  return (rows ?? []).filter((row) => {
    if (isHiddenCategory(row.id)) return false;
    const label = row.label?.trim() ?? "";
    return !(/^\d{8}$/.test(label) && isHiddenCategory(label));
  });
}

/**
 * Seçili kimliklerden ÇİZİLEBİLİR olanlar — sıra korunur (`useCategoriesByIds`
 * tüketicileri: çip listesi, sektör kartı).
 *
 * `rows` henüz gelmediyse (ilk yükleme ya da hata) gizli olmayan her kimlik
 * yerinde kalır: çağıran onlara "yükleniyor" çipi ya da hata satırı çizer.
 * `rows` geldiyse yalnız SATIRI OLAN kimlikler kalır: katalogda artık
 * bulunmayan ya da gizli segmentteki kimlik sonsuza dek "…" çipi olarak
 * asılı kalmaz, hiç çizilmez (arayüz denetimi 2026-10-09 W-09/W-10).
 *
 * Kanca modülünde DEĞİL: testlerin çoğu `@/hooks/use-categories`i bütünüyle
 * taklit eder; saf yardımcı orada dursaydı her taklide eklenmesi gerekirdi.
 */
export function resolvedCategoryIds(
  ids: readonly string[],
  rows: readonly { id: string }[] | null | undefined,
): string[] {
  const visible = visibleCategoryIds(ids);
  if (!rows) return visible;
  const known = new Set(rows.map((r) => r.id));
  return visible.filter((id) => known.has(id));
}
