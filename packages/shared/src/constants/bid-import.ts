/**
 * Teklif fiyatı içe aktarma — TEK KAYNAK (2026-08-22, Faz 2).
 *
 * İki giriş yolu, TEK önizleme sözleşmesi:
 *  - "Excel Şablonu ile Fiyatla": ihaleye ÖZEL şablon (kalemler ön-dolu + gizli
 *    ItemId) → deterministik, AI yok, her pakete açık, confidence="exact".
 *  - "Belgeden Fiyatla (AI)": fiyat listesi/proforma (PDF/foto/Excel) → AI
 *    satırları okur → EŞLEŞTİRME KODDA (kod → ad → benzerlik) → güven rozeti.
 * Her iki uç yalnız önizleme döner; teklif gönderme kullanıcı jesti (placeBid).
 */

export const BID_IMPORT_SHEET = "Teklif";
export const BID_IMPORT_HELP_SHEET = "Nasıl Doldurulur";
/** Gizli sütun başlığı — parser kalemi bununla KESİN eşler. */
export const BID_IMPORT_ITEM_ID_HEADER = "ItemId (değiştirmeyin)";
export const BID_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
/**
 * CSV için AYRI, çok daha düşük tavan: ExcelJS `csv.read` dosyanın tamamını
 * satır/hücre NESNESİNE açar — dar hücreli 3,7 MB'lık bir CSV ölçümde ~470-860
 * MB heap ve dakikalarca CPU tüketiyordu (tek süreç → tüm kiracılar etkilenir;
 * denetim 2026-08-24 Parça 5, HIGH). Kalem/fiyat şablonları küçüktür: 500 satır
 * × ~200 bayt ≈ 100 KB, 1 MB fazlasıyla yeterli. .xlsx yolu bu tavana tabi
 * DEĞİLDİR (zip-inspect ile açılmış boyut korumalı).
 */
export const BID_IMPORT_MAX_CSV_BYTES = 1024 * 1024;

export type BidImportColumnKey =
  | "lineNo"
  | "name"
  | "quantity"
  | "unit"
  | "materialCode"
  | "itemId"
  | "unitPrice"
  | "currency"
  | "deliveryTime"
  | "note";

export interface BidImportColumn {
  key: BidImportColumnKey;
  header: string;
  /** Kullanıcı doldurur (kilit açık); aksi halde kilitli/ön-dolu. */
  editable: boolean;
  hidden?: boolean;
  width: number;
  aliases: string[];
}

export const BID_IMPORT_COLUMNS: BidImportColumn[] = [
  { key: "lineNo", header: "#", editable: false, width: 5, aliases: ["sira", "sıra", "no"] },
  { key: "name", header: "Kalem", editable: false, width: 40, aliases: ["kalem adı", "ürün", "urun", "name"] },
  { key: "quantity", header: "Miktar", editable: false, width: 10, aliases: ["quantity", "qty", "adet"] },
  { key: "unit", header: "Birim", editable: false, width: 8, aliases: ["unit"] },
  { key: "materialCode", header: "Malzeme Kodu", editable: false, width: 16, aliases: ["kod", "stok kodu", "materialcode"] },
  { key: "itemId", header: BID_IMPORT_ITEM_ID_HEADER, editable: false, hidden: true, width: 30, aliases: ["itemid", "item id", "kalem id"] },
  {
    key: "unitPrice",
    header: "Birim Fiyat (KDV hariç)",
    editable: true,
    width: 22,
    aliases: ["unitprice", "birim fiyat", "fiyat", "price"],
  },
  { key: "currency", header: "Para Birimi", editable: true, width: 12, aliases: ["currency", "döviz", "doviz", "pb"] },
  {
    key: "deliveryTime",
    header: "Teslim Süresi",
    editable: true,
    width: 18,
    aliases: ["deliverytime", "teslim", "teslim suresi", "termin"],
  },
  { key: "note", header: "Not", editable: true, width: 30, aliases: ["note", "açıklama", "aciklama"] },
];

export function normalizeBidImportHeader(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\*/g, " ")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchBidImportColumn(rawHeader: unknown): BidImportColumnKey | null {
  const h = normalizeBidImportHeader(rawHeader);
  if (!h) return null;
  for (const c of BID_IMPORT_COLUMNS) {
    if (normalizeBidImportHeader(c.header) === h) return c.key;
    if (c.aliases.some((a) => normalizeBidImportHeader(a) === h)) return c.key;
  }
  return null;
}

/** Eşleşme güveni — önizlemede rozet: exact ●●● · high ●●○ · medium ●○○ · none —. */
export type BidImportConfidence = "exact" | "high" | "medium" | "none";

/** Önizleme satırı = ihale kalemi (her kalem için TAM BİR satır; eşleşmeyen kalem none). */
export interface BidImportMatch {
  itemId: string;
  lineNo: number;
  itemName: string;
  itemQuantity: string;
  itemUnit: string;
  /** Belgede/şablonda bulunan kaynak satır metni (AI: "Çelik boru 2\" — 185,00 TRY"). */
  source: string | null;
  unitPrice: number | null;
  /** Teklif para birimi kodu (TRY/USD/…); null = teklifin ana birimi. */
  currency: string | null;
  /** BidDeliveryTime kodu veya null. */
  deliveryTime: string | null;
  note: string | null;
  confidence: BidImportConfidence;
  /** Satır aktarılamaz (şablonda bozuk değer). */
  errors: string[];
  /** Aktarılır ama kullanıcı baksın (KDV, miktar uyumsuz, toplamdan türetildi…). */
  warnings: string[];
}

/** AI yolunda hiçbir kaleme bağlanamayan belge satırları — kullanıcı elle eşleyebilir. */
export interface BidImportDocRow {
  id: string;
  text: string;
  unitPrice: number | null;
  currency: string | null;
  deliveryTime: string | null;
}

export interface BidImportResult {
  mode: "template" | "ai";
  listingId: string;
  matches: BidImportMatch[];
  unmatchedDocRows: BidImportDocRow[];
  /** Belge düzeyi uyarılar (TR metin). */
  notices: string[];
  /** Belgede fiyatların KDV dahil görünüp görünmediği (AI yolu; null = belirsiz). */
  pricesIncludeVat: boolean | null;
  /** Belgede baskın para birimi (AI yolu). */
  docCurrency: string | null;
  matchedCount: number;
  /** AI yolu: seçilen girdi yolu + uyarılar (tender-extract ile aynı). */
  route?: "text" | "pdf_vision" | "image_vision";
  downgraded?: boolean;
  warned?: boolean;
}
