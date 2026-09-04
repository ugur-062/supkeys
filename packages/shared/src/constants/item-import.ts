import type { AiTenderDraftItem } from "../types/ai-tender-draft";

/**
 * Kalem Excel içe aktarma — TEK KAYNAK (2026-08-22).
 *
 * Şablon ÜRETİCİ (api: xlsx başlıkları) ve AYRIŞTIRICI (api: başlık→alan
 * eşlemesi) ve web önizleme tablosu aynı listeyi okur; başlık adı/sıra/limit
 * tek yerde değişir. AI YOKTUR: şablon deterministik okunur, bütçe yemez, her
 * pakete açık. Serbest belge (PDF/foto/şablon-dışı Excel) AI yolundan gider.
 */

export const ITEM_IMPORT_SHEET = "Kalemler";
export const ITEM_IMPORT_HELP_SHEET = "Nasıl Doldurulur";
export const ITEM_IMPORT_EXAMPLE_SHEET = "Örnek";
/** İlan başına kalem tavanı ile aynı (form-schema MAX_LISTING_ITEMS / DTO ArrayMaxSize). */
export const ITEM_IMPORT_MAX_ROWS = 500;
/** Şablon dosyası tavanı (base64 gövde ile gelir; 25MB body parser'ın çok altında). */
export const ITEM_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
/**
 * CSV için AYRI, çok daha düşük tavan: ExcelJS `csv.read` dosyanın tamamını
 * satır/hücre NESNESİNE açar — dar hücreli 3,7 MB'lık bir CSV ölçümde ~470-860
 * MB heap ve dakikalarca CPU tüketiyordu (tek süreç → tüm kiracılar etkilenir;
 * denetim 2026-08-24 Parça 5, HIGH). Kalem/fiyat şablonları küçüktür: 500 satır
 * × ~200 bayt ≈ 100 KB, 1 MB fazlasıyla yeterli. .xlsx yolu bu tavana tabi
 * DEĞİLDİR (zip-inspect ile açılmış boyut korumalı).
 */
export const ITEM_IMPORT_MAX_CSV_BYTES = 1024 * 1024;

/**
 * İSTEMCİ tarafı dosya tavanı (Dalga B-5, denetim P5).
 *
 * İçe aktarma gövdesi base64 ile gidiyor ve base64 boyutu 4/3 şişiriyor;
 * sunucu gövde sınırı 5 MB (`main.ts` body parser). Yani gerçek dosya tavanı
 * ~3,75 MB, ama arayüz "en fazla 5 MB" yazıyordu ve istemcide HİÇBİR boyut
 * kontrolü yoktu: kullanıcı 4,5 MB'lık dosyayı seçiyor, base64'e çevrilmesini
 * bekliyor ve sonunda açıklamasız bir 413 alıyordu.
 *
 * 3,5 MB, 5 MB gövde sınırının altında güvenli pay bırakır (base64 + JSON
 * zarfı + diğer alanlar).
 */
export const IMPORT_MAX_FILE_BYTES = 3.5 * 1024 * 1024;

export type ItemImportColumnKey =
  | "name"
  | "quantity"
  | "unit"
  | "description"
  | "materialCode"
  | "requiredByDate"
  | "targetUnitPrice";

export interface ItemImportColumn {
  key: ItemImportColumnKey;
  /** Excel başlığı (TR, kullanıcı yüzü). */
  header: string;
  required: boolean;
  /** Şablonun "Nasıl Doldurulur" sayfasındaki açıklama. */
  hint: string;
  width: number;
  kind: "text" | "number" | "money" | "date";
  maxLen?: number;
  /** Başlık eşleşmesinde kabul edilen ek adlar (İngilizce anahtar dahil). */
  aliases: string[];
}

export const ITEM_IMPORT_COLUMNS: ItemImportColumn[] = [
  {
    key: "name",
    header: "Kalem Adı",
    required: true,
    hint: "Zorunlu. En fazla 200 karakter. Ör: Çelik boru 2\" DN50",
    width: 36,
    kind: "text",
    maxLen: 200,
    aliases: ["name", "kalem", "urun", "ürün", "ürün adı", "malzeme", "malzeme adı", "açıklama kısa"],
  },
  {
    key: "quantity",
    header: "Miktar",
    required: true,
    hint: "Zorunlu. Sayı; en fazla 3 ondalık (0,001 – 1.000.000.000). Ör: 120 veya 12,5",
    width: 12,
    kind: "number",
    aliases: ["quantity", "qty", "adet", "miktarı"],
  },
  {
    key: "unit",
    header: "Birim",
    required: true,
    hint: "Zorunlu. En fazla 20 karakter. Ör: adet, kg, m, m², lt, paket, koli, ton",
    width: 10,
    kind: "text",
    maxLen: 20,
    aliases: ["unit", "birimi", "ölçü birimi"],
  },
  {
    key: "description",
    header: "Açıklama",
    required: false,
    hint: "İsteğe bağlı. Teknik özellik/şartname notu, en fazla 2000 karakter.",
    width: 40,
    kind: "text",
    maxLen: 2000,
    aliases: ["description", "aciklama", "teknik özellik", "özellik", "not"],
  },
  {
    key: "materialCode",
    header: "Malzeme Kodu",
    required: false,
    hint: "İsteğe bağlı. Stok/ERP kodunuz, en fazla 50 karakter.",
    width: 16,
    kind: "text",
    maxLen: 50,
    aliases: ["materialcode", "material code", "kod", "stok kodu", "ürün kodu", "malzeme kod"],
  },
  {
    key: "requiredByDate",
    header: "Termin (GG.AA.YYYY)",
    required: false,
    hint: "İsteğe bağlı. Kalemin en geç teslim tarihi. GG.AA.YYYY ya da Excel tarih hücresi.",
    width: 20,
    kind: "date",
    aliases: ["requiredbydate", "termin", "teslim tarihi", "istenen teslim", "termin tarihi"],
  },
  {
    key: "targetUnitPrice",
    header: "Hedef Birim Fiyat (KDV hariç)",
    required: false,
    hint: "İsteğe bağlı. Bütçe/hedef birim fiyatınız (KDV hariç). Tedarikçiler GÖRMEZ.",
    width: 26,
    kind: "money",
    aliases: ["targetunitprice", "hedef fiyat", "hedef birim fiyat", "bütçe", "butce"],
  },
];

/**
 * Şablonda yer alan sütunlar. Tek küme: satış ilanı (taban/hemen-al sütunları)
 * 2026-09-04'te sistemden kaldırıldı; imza çağrı yerleri bozulmasın diye
 * korunuyor.
 */
export function itemImportColumnsFor(_opts?: Record<string, unknown>): ItemImportColumn[] {
  return ITEM_IMPORT_COLUMNS;
}

/**
 * Başlık normalizasyonu — TR-katlanmış, küçük harf, '*' ve parantez içi
 * (ör. "(GG.AA.YYYY)", "(KDV hariç)") atılır, boşluk tekilleştirilir.
 * `foldSearchText`'e bağımlı değil: shared içinde kendi kendine yeter.
 */
export function normalizeImportHeader(raw: unknown): string {
  const s = String(raw ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\*/g, " ")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

/** Başlık metnini sütun anahtarına çevirir (eşleşme yoksa null). */
export function matchImportColumn(rawHeader: unknown): ItemImportColumnKey | null {
  const h = normalizeImportHeader(rawHeader);
  if (!h) return null;
  for (const c of ITEM_IMPORT_COLUMNS) {
    if (normalizeImportHeader(c.header) === h) return c.key;
    if (c.aliases.some((a) => normalizeImportHeader(a) === h)) return c.key;
  }
  return null;
}

/** İçe aktarılan kalem (AI taslak kalemi + birim kodu). */
export interface ItemImportItem extends AiTenderDraftItem {
  /**
   * Serbest metin birimden türetilen kanonik kod (Faz 1). Tanınmazsa `null`
   * ve satır YİNE DE geçerlidir — kullanıcı `notices` ile uyarılır. Birim
   * listesi bilinçli olarak kapalı değil.
   */
  unitCode?: string | null;
}

export interface ItemImportRow {
  /** Excel satır numarası (1-tabanlı, başlık dahil) — kullanıcıya "satır 7" diye gösterilir. */
  rowNumber: number;
  item: ItemImportItem;
  /** Boşsa satır geçerli; doluysa satır aktarılamaz (mesajlar TR). */
  errors: string[];
}

/** POST …/item-import/parse yanıtı (api → web sözleşmesi). */
export interface ItemImportResult {
  sheetName: string;
  /** Eşleşen sütunlar (anahtar listesi) — web bunlara göre tablo çizer. */
  columns: ItemImportColumnKey[];
  rows: ItemImportRow[];
  validCount: number;
  invalidCount: number;
  /** ITEM_IMPORT_MAX_ROWS aşıldıysa kesilen satır sayısı. */
  truncated: number;
}
