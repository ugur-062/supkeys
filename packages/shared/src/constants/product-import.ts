/**
 * ÜRÜN İÇE AKTARMA — sütun sözleşmesi (Faz 4).
 *
 * `item-import.ts` ile aynı desen ama AYRI: ilan kalemi ile vitrindeki ürün
 * farklı şeyler. Kalemde miktar ve teslim tarihi var (o bir işlem satırı),
 * üründe kategori, anahtar kelime, fiyat modu ve MOQ var (o kalıcı bir
 * katalog kaydı). Tek sütun kümesinde birleştirmek ikisini de bozardı.
 *
 * AI YOK: deterministik, bütçe yemez, her pakete açık. Hiçbir şey YAZMAZ —
 * yalnız önizleme döner; kullanıcı onaylar.
 *
 * ── GÖRSEL BU DOSYADA YOK ─────────────────────────────────────────────────
 * Excel'de görsel taşınamaz. İçe aktarılan ürün TASLAK olarak düşer ve
 * yayımlamak için en az bir görsel gerekir (`productPublishBlockers`).
 * Yani toplu yükleme kataloğu hızlı kurar, yayımlama yine bilinçli kalır.
 */

export const PRODUCT_IMPORT_SHEET = "Ürünler";
export const PRODUCT_IMPORT_HELP_SHEET = "Nasıl Doldurulur";
export const PRODUCT_IMPORT_EXAMPLE_SHEET = "Örnek";

/** Tek yüklemede en fazla ürün. Katalog tavanı (5000) ayrı ve serviste. */
export const PRODUCT_IMPORT_MAX_ROWS = 500;

export type ProductImportColumnKey =
  | "name"
  | "code"
  | "description"
  | "categoryId"
  | "unit"
  | "brand"
  | "mpn"
  | "keywords"
  | "priceMode"
  | "price"
  | "currency"
  | "moq";

export interface ProductImportColumn {
  key: ProductImportColumnKey;
  header: string;
  required: boolean;
  hint: string;
  width: number;
  kind: "text" | "number" | "money";
  maxLen?: number;
  aliases: string[];
}

/** Fiyat modu — Excel'de TÜRKÇE yazılır, koda burada çevrilir. */
export const PRICE_MODE_LABELS: Record<string, "FIXED" | "TIERED" | "ON_REQUEST"> = {
  sabit: "FIXED",
  "sabit fiyat": "FIXED",
  fixed: "FIXED",
  kademeli: "TIERED",
  tiered: "TIERED",
  "teklif": "ON_REQUEST",
  "teklif isteyin": "ON_REQUEST",
  "fiyat sorunuz": "ON_REQUEST",
  on_request: "ON_REQUEST",
};

export const PRODUCT_IMPORT_COLUMNS: ProductImportColumn[] = [
  {
    key: "name",
    header: "Ürün Adı",
    required: true,
    hint: 'Zorunlu. En fazla 200 karakter. Ör: Dağıtım Panosu 400A IP54',
    width: 40,
    kind: "text",
    maxLen: 200,
    aliases: ["name", "urun adi", "ürün", "baslik", "başlık"],
  },
  {
    key: "code",
    header: "Stok Kodu",
    required: false,
    hint: "Firma içi kodunuz. Boş bırakılabilir. AYNI kod ikinci kez yüklenirse mevcut ürün GÜNCELLENİR.",
    width: 18,
    kind: "text",
    maxLen: 50,
    aliases: ["code", "stok kodu", "sku", "urun kodu", "ürün kodu"],
  },
  {
    key: "description",
    header: "Açıklama",
    required: false,
    hint: "Vitrinde yayımlamak için en az 100 karakter gerekir. Kısa açıklama taslak olarak kalır.",
    width: 60,
    kind: "text",
    maxLen: 5000,
    aliases: ["description", "aciklama", "detay"],
  },
  {
    key: "categoryId",
    header: "Kategori Kodu",
    required: false,
    hint: "8 haneli Ariba/UNSPSC kodu (ör. 39122215). Bilmiyorsanız boş bırakın, panelden seçersiniz. Kategoriye özel özellikler bu koda göre gelir.",
    width: 16,
    kind: "text",
    maxLen: 8,
    aliases: ["categoryid", "kategori", "kategori kodu", "unspsc"],
  },
  {
    key: "unit",
    header: "Birim",
    required: true,
    hint: "Zorunlu. adet, kg, m, paket, ton… Tanınmayan birim serbest metin olarak korunur.",
    width: 12,
    kind: "text",
    maxLen: 20,
    aliases: ["unit", "birim", "olcu", "ölçü"],
  },
  {
    key: "brand",
    header: "Marka",
    required: false,
    hint: "Ürünün markası.",
    width: 18,
    kind: "text",
    maxLen: 100,
    aliases: ["brand", "marka"],
  },
  {
    key: "mpn",
    header: "Üretici Parça No",
    required: false,
    hint: "MPN — üreticinin parça numarası.",
    width: 20,
    kind: "text",
    maxLen: 100,
    aliases: ["mpn", "parca no", "parça no", "uretici kodu"],
  },
  {
    key: "keywords",
    header: "Anahtar Kelimeler",
    required: false,
    hint: "Virgülle ayırın, en fazla 15. Ör: dağıtım panosu, elektrik panosu, ip54",
    width: 40,
    kind: "text",
    maxLen: 800,
    aliases: ["keywords", "anahtar kelime", "etiket", "etiketler"],
  },
  {
    key: "priceMode",
    header: "Fiyat Tipi",
    required: false,
    hint: 'Sabit · Kademeli · Teklif isteyin. Boş bırakılırsa "Teklif isteyin" olur — bu bir eksiklik değil, açık beyandır. Kademeli fiyat tablosu Excel ile girilemez; panelden eklersiniz.',
    width: 16,
    kind: "text",
    maxLen: 30,
    aliases: ["pricemode", "fiyat tipi", "fiyat modu"],
  },
  {
    key: "price",
    header: "Birim Fiyat",
    required: false,
    hint: 'Yalnız "Sabit" seçtiyseniz doldurun. Nokta/virgül ondalık kabul edilir.',
    width: 14,
    kind: "money",
    aliases: ["price", "fiyat", "birim fiyat"],
  },
  {
    key: "currency",
    header: "Para Birimi",
    required: false,
    hint: "TRY, USD, EUR, GBP… Boşsa TRY.",
    width: 12,
    kind: "text",
    maxLen: 3,
    aliases: ["currency", "para birimi", "kur"],
  },
  {
    key: "moq",
    header: "Min. Sipariş",
    required: false,
    hint: "Minimum sipariş miktarı (birim cinsinden).",
    width: 14,
    kind: "number",
    aliases: ["moq", "min siparis", "minimum siparis", "asgari"],
  },
];

/** Başlık eşleştirme — `item-import` ile AYNI katlama kuralı. */
export function normalizeProductHeader(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\*/g, "")
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/[çÇ]/g, "c")
    .replace(/[ğĞ]/g, "g")
    .replace(/[ıİiI]/g, "i")
    .replace(/[öÖ]/g, "o")
    .replace(/[şŞ]/g, "s")
    .replace(/[üÜ]/g, "u")
    .replace(/\s+/g, " ");
}

export function matchProductColumn(
  rawHeader: unknown,
): ProductImportColumnKey | null {
  const n = normalizeProductHeader(rawHeader);
  if (!n) return null;
  for (const c of PRODUCT_IMPORT_COLUMNS) {
    if (normalizeProductHeader(c.header) === n) return c.key;
    if (c.aliases.some((a) => normalizeProductHeader(a) === n)) return c.key;
  }
  return null;
}

export interface ProductImportRow {
  /** Excel satır numarası — hata mesajında kullanıcıya gösterilir. */
  rowNumber: number;
  name: string;
  code: string | null;
  description: string | null;
  categoryId: string | null;
  unit: string;
  brand: string | null;
  mpn: string | null;
  keywords: string[];
  priceMode: "FIXED" | "TIERED" | "ON_REQUEST";
  price: number | null;
  currency: string | null;
  moq: number | null;
  /** Bu satırdaki sorunlar — satır yine önizlemede görünür. */
  issues: string[];
}

export interface ProductImportResult {
  rows: ProductImportRow[];
  /** Dosya genelinde uyarılar (kırpılan satır, tanınmayan sütun…). */
  notices: string[];
}
