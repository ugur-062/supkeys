/**
 * YÖNETİMDE ÜRÜN KATEGORİSİ ETİKETİ.
 *
 * Gizli bir dalın altındaki kategori üründe, talepte ve firma profilinde
 * HİÇBİR yüzeyde adıyla gösterilmez (2026-10-09, sahip kararı: "anasayfada
 * olmayan kategori başka yerde de gösterilmesin"). Yönetim ekranı da adı
 * basmaz; ama inceleyen personel kategorinin NEDEN boş göründüğünü bilmeli —
 * "—" yazsaydık ürün kategorisiz sanılır, satıcıya yanlış gerekçeyle düzeltme
 * istenirdi. Eski ürün yayında kalır; satıcı güncel bir kategori seçene dek
 * vitrinde kategorisiz çizilir.
 *
 * GİZLİLİĞİN BİRİMİ KOD ÖNEKİDİR (2026-10-10): tümüyle gizli segment (ilk 2
 * hane) ya da GÖRÜNÜR bir segmentin gizli ailesi (ilk 4) / sınıfı (ilk 6). 46
 * "İş Güvenliği ve Yangın Ekipmanları" adıyla açık; altındaki silah ve kolluk
 * dalları gizli. Not bu yüzden iki biçimlidir: segmenti gizli olan koda
 * "— (gizli segment)", görünür segmentin gizli dalındaki koda
 * "— (gizli kategori)" — ikincisine "gizli segment" demek yanlış olurdu
 * (segmenti sitede görünüyor).
 *
 * KAYNAK: API satırı `hiddenCategory` bayrağını taşır ve gizli kategorinin
 * adını hiç çözmez (`admin-products.service.ts`). Aşağıdaki listeler İKİNCİ
 * kattır (bayrağı göndermeyen eski API yanıtı adı da gönderir): admin
 * `@rothern/shared`a bağlı olmadığından `HIDDEN_SEGMENTS` ve
 * `HIDDEN_BRANCH_PREFIXES`in yerel kopyasıdır (`payment-plan-label.ts` /
 * `system-text.ts` deseni). Kopya kaynaktan ayrışamaz —
 * `__tests__/category-label.test.ts` paylaşılan dosyayı okuyup iki listeyi de
 * karşılaştırır.
 */
export const HIDDEN_SEGMENT_PREFIXES: readonly string[] = [
  "10", "42", "43", "44", "45", "48", "49",
  "50", "51", "52", "53", "54", "55", "56", "57",
  "60", "64",
  "70", "77",
  "80", "82", "83", "84", "85", "86",
  "90", "91", "92", "93", "94",
];

/** Görünür segmentin gizli aileleri (4 hane) ve sınıfları (6 hane). */
export const HIDDEN_BRANCH_PREFIXES: readonly string[] = [
  "4610", "4611", "4612", "4613", "4614", "4615",
  "4620", "4622",
  "461825",
];

const HIDDEN_SET: ReadonlySet<string> = new Set([...HIDDEN_SEGMENT_PREFIXES, ...HIDDEN_BRANCH_PREFIXES]);
const HIDDEN_LENGTHS: readonly number[] = [...new Set([...HIDDEN_SET].map((p) => p.length))].sort((a, b) => a - b);

/** Kodun SEGMENTİ gizli (ilk iki hane). */
export const HIDDEN_SEGMENT_LABEL = "— (gizli segment)";
/** Segment görünür; kodun ailesi ya da sınıfı gizli. Düzeyi bilinmeyen gizli kod için de bu yazılır. */
export const HIDDEN_CATEGORY_LABEL = "— (gizli kategori)";

/**
 * Kodu kapsayan gizli önek ("77" · "4610" · "461825"); görünürse `null`.
 * Girdi 8 haneli kod ya da kodun baş kısmıdır. Uzunluk düzeyi söyler:
 * 2 segment, 4 aile, 6 sınıf. (`@rothern/shared` `hiddenCategoryPrefixOf` aynası.)
 */
export function hiddenPrefixOfCode(code: string | null | undefined): string | null {
  if (!code) return null;
  for (const length of HIDDEN_LENGTHS) {
    if (code.length < length) break;
    const prefix = code.slice(0, length);
    if (HIDDEN_SET.has(prefix)) return prefix;
  }
  return null;
}

/** Kod (herhangi seviye) gizli bir önekin — segment, aile ya da sınıf — altında mı? */
export function isHiddenCategoryCode(code: string | null | undefined): boolean {
  return hiddenPrefixOfCode(code) !== null;
}

/** Tabloda/ayrıntıda basılacak metin: gizliyse sabit not, yoksa ad ya da "—". */
export function productCategoryLabel(p: {
  categoryId?: string | null;
  categoryName?: string | null;
  hiddenCategory?: boolean;
}): string {
  const prefix = hiddenPrefixOfCode(p.categoryId);
  if (prefix) return prefix.length === 2 ? HIDDEN_SEGMENT_LABEL : HIDDEN_CATEGORY_LABEL;
  // API "gizli" diyor ama yerel kopya kodu tanımıyor (API daha yeni): düzey
  // bilinmez → her düzeyde doğru olan not.
  if (p.hiddenCategory === true) return HIDDEN_CATEGORY_LABEL;
  return p.categoryName?.trim() || "—";
}

/**
 * KOD ARAMASINDA "SONUÇ YOK"UN NEDENİ (Kategoriler sayfası). API gizli bir
 * daldaki kod aramasını boş döndürür ve nedeni işaretler: `hiddenPrefix`
 * (kodu kapsayan gizli önek) ya da eski biçimde `hiddenSegment` (ilk iki
 * hane). Eski biçim görünür segmentin gizli ailesinde YANILTIR ("46 segmenti
 * gizli" — değil); o durumda düzey, yazılan koddan yerel kopyayla bulunur.
 * Neden yoksa `null` (düz "Sonuç yok").
 */
export function hiddenSearchReason(
  res: { hiddenPrefix?: string | null; hiddenSegment?: string | null } | null | undefined,
  query: string,
): string | null {
  const flagged = res?.hiddenPrefix || res?.hiddenSegment;
  if (!flagged) return null;
  const typed = /^[\d\s.\-]+$/.test(query) ? query.replace(/\D/g, "") : "";
  const prefix = res?.hiddenPrefix || hiddenPrefixOfCode(typed) || flagged;
  const level = prefix.length >= 6 ? "sınıfı" : prefix.length >= 4 ? "ailesi" : "segmenti";
  return `Sonuç yok — ${prefix} ${level} katalog sadeleştirmesiyle gizli; bu koddaki kategoriler seçicilerde ve aramada görünmez.`;
}
