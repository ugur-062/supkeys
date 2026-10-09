/**
 * YÖNETİMDE ÜRÜN KATEGORİSİ ETİKETİ.
 *
 * Gizli segmentin altındaki kategori üründe, talepte ve firma profilinde
 * HİÇBİR yüzeyde adıyla gösterilmez (2026-10-09, sahip kararı: "anasayfada
 * olmayan kategori başka yerde de gösterilmesin"). Yönetim ekranı da adı
 * basmaz; ama inceleyen personel kategorinin NEDEN boş göründüğünü bilmeli —
 * "—" yazsaydık ürün kategorisiz sanılır, satıcıya yanlış gerekçeyle düzeltme
 * istenirdi. Eski ürün yayında kalır; satıcı güncel bir kategori seçene dek
 * vitrinde kategorisiz çizilir.
 *
 * KAYNAK: API satırı `hiddenCategory` bayrağını taşır ve gizli kategorinin
 * adını hiç çözmez (`admin-products.service.ts`). Aşağıdaki liste İKİNCİ
 * kattır (bayrağı göndermeyen eski API yanıtı adı da gönderir): admin
 * `@rothern/shared`a bağlı olmadığından `HIDDEN_SEGMENTS`in yerel kopyasıdır
 * (`payment-plan-label.ts` / `system-text.ts` deseni). Kopya kaynaktan
 * ayrışamaz — `__tests__/category-label.test.ts` paylaşılan dosyayı okuyup
 * iki listeyi karşılaştırır.
 */
export const HIDDEN_SEGMENT_PREFIXES: readonly string[] = [
  "10", "42", "43", "44", "45", "46", "48", "49",
  "50", "51", "52", "53", "54", "55", "56", "57",
  "60", "64",
  "70", "77",
  "80", "82", "83", "84", "85", "86",
  "90", "91", "92", "93", "94",
];

const HIDDEN_SET: ReadonlySet<string> = new Set(HIDDEN_SEGMENT_PREFIXES);

export const HIDDEN_CATEGORY_LABEL = "— (gizli segment)";

/** Kod (herhangi seviye, 8 hane) gizli bir segmentin altında mı? */
export function isHiddenSegmentCode(code: string | null | undefined): boolean {
  return !!code && code.length >= 2 && HIDDEN_SET.has(code.slice(0, 2));
}

/** Tabloda/ayrıntıda basılacak metin: gizliyse sabit not, yoksa ad ya da "—". */
export function productCategoryLabel(p: {
  categoryId?: string | null;
  categoryName?: string | null;
  hiddenCategory?: boolean;
}): string {
  if (p.hiddenCategory === true || isHiddenSegmentCode(p.categoryId)) return HIDDEN_CATEGORY_LABEL;
  return p.categoryName?.trim() || "—";
}
