import { tApi } from "../../../common/i18n/i18n.service";
import {
  BID_DELIVERY_TIMES,
  BID_DELIVERY_TIME_LABELS,
  MAX_MONEY,
  MIN_MONEY,
  MONEY_DECIMALS,
  type BidDeliveryTime,
  type BidImportConfidence,
  type BidImportDocRow,
  type BidImportMatch,
} from "@rothern/shared";

/**
 * Teklif fiyatı EŞLEŞTİRME MOTORU (Faz 2, 2026-08-22) — saf fonksiyonlar,
 * AI'dan BAĞIMSIZ: model yalnız belge satırlarını okur; hangi satırın hangi
 * ihale kalemine ait olduğuna BU KOD karar verir (model önerisi yalnız ipucu).
 *
 *  1. Malzeme kodu tam eşleşme (katlanmış)        → exact
 *  2. Ad tam eşleşme (katlanmış)                  → exact
 *  3. Bigram Dice benzerliği ≥ 0.85               → high
 *  4. Benzerlik ≥ 0.60 (veya model ipucu + ≥0.35) → medium (önizlemede "emin misiniz?")
 *     Belge kalemlerden FARKLI DİLDEYSE (Almanca proforma ↔ Türkçe kalem;
 *     2026-09-27) harf benzerliği anlamı ölçemez → model ipucu tek başına
 *     medium (kullanıcı onaylar); gerçek metin eşleşmesi yine önce gelir.
 *  5. Aksi                                        → eşleşmedi (kalem boş, belge satırı "unmatched")
 * Her kalem en çok bir belge satırı alır (en yüksek skor kazanır; çakışan
 * düşük skor serbest kalır). Sağlık kontrolleri: toplam÷miktar türetme, miktar
 * uyumsuzluğu, KDV, para birimi, teslim metni → BidDeliveryTime.
 */

export interface MatchItem {
  id: string;
  lineNo: number;
  name: string;
  quantity: string; // Decimal string
  unit: string;
  materialCode: string | null;
}

/** AI'dan gelen (sanitize edilmiş) belge satırı. */
export interface DocRow {
  text: string;
  code: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
  quantity: number | null;
  unit: string | null;
  currency: string | null;
  deliveryText: string | null;
  /** Modelin ipucu: hangi ihale kalemi (lineNo) — doğrulanmadan kullanılmaz. */
  hintLineNo: number | null;
}

export const SIM_HIGH = 0.85;
export const SIM_MEDIUM = 0.6;
export const SIM_HINT_MIN = 0.35;

export function foldText(s: string | null | undefined): string {
  return String(s ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    // Tırnak/inç varyantları tek biçime: “ ” ″ '' → "
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/''/g, '"')
    .replace(/\b(inc|inch)\b/g, '"')
    // Harf = HER yazı (2026-09-27): eskiden yalnız a-z kalıyordu — Kiril/Çince
    // kalem adı boş metne iniyor, aynı dildeki belgeyle bile eşleşmiyordu.
    .replace(/[^\p{L}\p{N}"%./+-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/\s+/g, " ");
  if (t.length < 2) {
    if (t) m.set(t, 1);
    return m;
  }
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/**
 * Benzerlik (0..1) = max(Dice bigram, token kapsama). Dice kısa ürün adlarında
 * token-sırasına dayanıklıdır; kapsama ise belge satırı ihale kalemini EK
 * niteleyicilerle genişlettiğinde ("Dirsek 90° 2\" dikişsiz") puanı düşürmez:
 * kalemin TÜM token'ları (≥2 token) belge metninde geçiyorsa 1.0.
 */
export function similarity(a: string, b: string): number {
  const fa = foldText(a);
  const fb = foldText(b);
  if (!fa || !fb) return 0;
  if (fa === fb) return 1;
  const ga = bigrams(fa);
  const gb = bigrams(fb);
  let inter = 0;
  for (const [g, c] of ga) inter += Math.min(c, gb.get(g) ?? 0);
  const total = [...ga.values()].reduce((s, c) => s + c, 0) + [...gb.values()].reduce((s, c) => s + c, 0);
  const dice = total === 0 ? 0 : (2 * inter) / total;
  const ta = fa.split(" ").filter(Boolean);
  if (ta.length < 2) {
    // Tek kelimelik kalem adı ("ABB", "Vida"): belge satırında TOKEN olarak
    // geçiyorsa en az medium ("emin misiniz?") — Dice tek başına çok düşük
    // kalır (kısa ad ⊂ uzun satır). Kısa/genel kelimeler (<3) hariç.
    const only = ta[0] ?? "";
    if (only.length >= 3 && fb.split(" ").includes(only)) return Math.max(dice, SIM_MEDIUM);
    return dice;
  }
  const tb = new Set(fb.split(" ").filter(Boolean));
  const hit = ta.filter((t) => tb.has(t)).length;
  const containment = hit / ta.length;
  // Kısmi kapsama tek başına yeterli değil (genel kelimeler) — yalnız TAM kapsama tavan.
  return Math.max(dice, containment === 1 ? 1 : containment * 0.7);
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  "₺": "TRY",
  tl: "TRY",
  try: "TRY",
  $: "USD",
  usd: "USD",
  "€": "EUR",
  eur: "EUR",
  "£": "GBP",
  gbp: "GBP",
  chf: "CHF",
  jpy: "JPY",
  "¥": "JPY",
  aed: "AED",
  cny: "CNY",
  rub: "RUB",
  "₽": "RUB",
  "руб": "RUB",
  "руб.": "RUB",
  "₼": "AZN",
  "₩": "KRW",
};

/** "₺", "TL", "usd", "EUR " → ISO kodu; tanınmazsa null. */
export function normalizeCurrency(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const k = s.toLocaleLowerCase("tr-TR");
  return CURRENCY_SYMBOLS[k] ?? (/^[A-Za-z]{3}$/.test(s) ? s.toUpperCase() : null);
}

/**
 * Teslim metni → BidDeliveryTime kodu. Kod/etiket birebir; serbest metin
 * ("stoktan", "hemen", "15 gün", "3 hafta", "2 ay") merdivene yuvarlanır.
 */
export function normalizeDeliveryTime(v: unknown): string | null {
  if (v == null) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  if ((BID_DELIVERY_TIMES as readonly string[]).includes(raw.toUpperCase())) return raw.toUpperCase();
  const f = foldText(raw);
  for (const code of BID_DELIVERY_TIMES) {
    if (foldText(BID_DELIVERY_TIME_LABELS[code as BidDeliveryTime]) === f) return code;
  }
  if (/stok|hemen|mevcut|derhal|immediate|in stock|auf lager|sofort|в наличии|со склада|немедленно/.test(f)) return "STOKTAN";
  // Birim sözcükleri TR/EN/DE/RU (belge tedarikçinin dilinde gelir).
  const m = f.match(
    /(\d+)\s*(?:-|ila|to|bis|до)?\s*(\d+)?\s*(gun|gün|is gunu|hafta|ay|week|day|month|tag|woche|monat|ден|дн|недел|месяц|мес)/,
  );
  if (m) {
    const n = m[2] ? +m[2] : +m[1]!;
    const unit = m[3]!;
    // Önek kontrolü: "day" içindeki "ay" AY sayılmasın (eskiden 15 gün → 450 gün).
    const days = /^(hafta|week|woche|недел)/.test(unit) ? n * 7 : /^(ay|month|monat|мес)/.test(unit) ? n * 30 : n;
    if (days <= 0) return "STOKTAN";
    if (days <= 14) return "W1_2";
    if (days <= 28) return "W3_4";
    if (days <= 56) return "W5_8";
    if (days <= 90) return "M2_3";
    return "M3_PLUS";
  }
  return null;
}

export function validUnitPrice(n: number | null): { value: number | null; error: string | null } {
  if (n == null) return { value: null, error: null };
  if (!Number.isFinite(n)) return { value: null, error: tApi("api.companyListings.bidImport.birimFiyatSayiDegil") };
  if (n < MIN_MONEY || n > MAX_MONEY) return { value: null, error: tApi("api.companyListings.bidImport.birimFiyatAraligi") };
  const r = Math.round(n * 100) / 100;
  if (Math.abs(r - n) > 1e-9) {
    // 2 ondalığa yuvarla (belgeden 3+ ondalık gelebilir) — uyarı değil, sessiz.
    return { value: r, error: null };
  }
  return { value: n, error: null };
}

export function confidenceOf(
  score: number,
  exact: boolean,
  hinted: boolean,
  /** Belge ile kalemler farklı dilde — ipucu benzerlik eşiği aranmadan medium. */
  crossLanguage = false,
): BidImportConfidence {
  if (exact) return "exact";
  if (score >= SIM_HIGH) return "high";
  if (score >= SIM_MEDIUM) return "medium";
  if (hinted && (score >= SIM_HINT_MIN || crossLanguage)) return "medium";
  return "none";
}

type Script = "latin" | "cyrillic" | "cjk" | "arabic" | "other";

/** Metinlerin baskın yazısı (harf sayımına göre). */
export function dominantScript(texts: readonly string[]): Script | null {
  const n: Record<Script, number> = { latin: 0, cyrillic: 0, cjk: 0, arabic: 0, other: 0 };
  for (const t of texts) {
    for (const ch of t) {
      if (!/\p{L}/u.test(ch)) continue;
      if (/\p{Script=Latin}/u.test(ch)) n.latin++;
      else if (/\p{Script=Cyrillic}/u.test(ch)) n.cyrillic++;
      else if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(ch)) n.cjk++;
      else if (/\p{Script=Arabic}/u.test(ch)) n.arabic++;
      else n.other++;
    }
  }
  const best = (Object.entries(n) as [Script, number][]).sort((a, b) => b[1] - a[1])[0]!;
  return best[1] > 0 ? best[0] : null;
}

/**
 * Belge satırları kalemlerden farklı dilde mi: model açıkça söylediyse o
 * (`docLanguage` ≠ `itemsLanguage`), ayrıca yazı farkı (Kiril ↔ Latin) her
 * durumda farklı dil sayılır.
 */
export function isCrossLanguage(
  items: readonly { name: string }[],
  rows: readonly { text: string }[],
  declared?: boolean | null,
): boolean {
  if (declared) return true;
  const a = dominantScript(items.map((i) => i.name));
  const b = dominantScript(rows.map((r) => r.text));
  return a != null && b != null && a !== b;
}

/**
 * Belge satırlarını ihale kalemlerine eşler. Sonuç: her kalem için bir
 * BidImportMatch (eşleşmeyen = none) + unmatched belge satırları.
 */
export function matchDocRows(
  items: MatchItem[],
  rows: DocRow[],
  opts: {
    allowedCurrencies: string[];
    primaryCurrency: string | null;
    /** Belgenin baskın birimi — birimsiz satırlara uygulanır (izinliyse). */
    docCurrency?: string | null;
    crossLanguage?: boolean | null;
  },
): { matches: BidImportMatch[]; unmatched: BidImportDocRow[] } {
  type Cand = { itemIdx: number; rowIdx: number; score: number; exact: boolean; hinted: boolean };
  const cands: Cand[] = [];
  const byLine = new Map(items.map((it, i) => [it.lineNo, i] as const));
  const cross = isCrossLanguage(items, rows, opts.crossLanguage);

  items.forEach((it, i) => {
    const code = foldText(it.materialCode);
    rows.forEach((r, j) => {
      let score = similarity(it.name, r.text);
      let exact = false;
      if (code && r.code && foldText(r.code) === code) {
        exact = true;
        score = 1;
      } else if (foldText(it.name) === foldText(r.text)) {
        exact = true;
        score = 1;
      } else if (code && foldText(r.text).includes(code) && code.length >= 3) {
        // Kod belge metninin içinde geçiyor ("BRU-200 Çelik boru") → yüksek.
        score = Math.max(score, SIM_HIGH);
      }
      const hinted = r.hintLineNo != null && byLine.get(r.hintLineNo) === i;
      if (hinted) score = Math.max(score, similarity(it.name, r.text)); // ipucu skoru düşürmez
      const conf = confidenceOf(score, exact, hinted, cross);
      if (conf !== "none") cands.push({ itemIdx: i, rowIdx: j, score: exact ? 2 : score, exact, hinted });
    });
  });

  // Açgözlü: en yüksek skor önce; kalem ve satır en çok bir kez kullanılır.
  cands.sort((a, b) => b.score - a.score);
  const usedItem = new Set<number>();
  const usedRow = new Set<number>();
  const chosen = new Map<number, Cand>();
  for (const c of cands) {
    if (usedItem.has(c.itemIdx) || usedRow.has(c.rowIdx)) continue;
    usedItem.add(c.itemIdx);
    usedRow.add(c.rowIdx);
    chosen.set(c.itemIdx, c);
  }

  const matches: BidImportMatch[] = items.map((it, i) => {
    const c = chosen.get(i);
    const base: BidImportMatch = {
      itemId: it.id,
      lineNo: it.lineNo,
      itemName: it.name,
      itemQuantity: it.quantity,
      itemUnit: it.unit,
      source: null,
      unitPrice: null,
      currency: null,
      deliveryTime: null,
      note: null,
      confidence: "none",
      errors: [],
      warnings: [],
    };
    if (!c) return base;
    const r = rows[c.rowIdx]!;
    const out = { ...base, source: r.text, confidence: confidenceOf(c.exact ? 1 : c.score, c.exact, c.hinted, cross) };
    applyDocRowValues(out, r, it, opts);
    return out;
  });

  // Eşleşmeyen satırlar da otomatik eşleşmeyle AYNI fiyat/birim kurallarından
  // geçer: kullanıcı önizlemede elle bir kaleme bağladığında ham belge değeri
  // (yuvarlanmamış fiyat, izinsiz birim) forma sızmasın (derin denetim MU-23).
  const unmatched: BidImportDocRow[] = rows
    .map((r, j) => ({ r, j }))
    .filter(({ j }) => !usedRow.has(j))
    .map(({ r, j }) => {
      const warnings: string[] = [];
      const price = docRowPrice(r, warnings);
      const currency = docRowCurrency(r, opts, warnings);
      const deliveryTime = normalizeDeliveryTime(r.deliveryText);
      return {
        id: `doc-${j}`,
        text: r.text,
        unitPrice: price,
        currency,
        deliveryTime,
        warnings,
      };
    });

  return { matches, unmatched };
}

function derivedUnitPrice(r: DocRow): { value: number | null; derived: boolean } {
  if (r.unitPrice != null && Number.isFinite(r.unitPrice)) return { value: r.unitPrice, derived: false };
  if (r.totalPrice != null && r.quantity != null && r.quantity > 0) {
    return { value: r.totalPrice / r.quantity, derived: true };
  }
  return { value: null, derived: false };
}

/**
 * Belge satırı fiyatı: toplam÷miktar türetme, MONEY_DECIMALS yuvarlama, sınır
 * denetimi (+ uyarılar). Eşleşen ve eşleşmeyen satır AYNI kuraldan geçer.
 */
function docRowPrice(r: DocRow, warnings: string[]): number | null {
  const d = derivedUnitPrice(r);
  const v = validUnitPrice(d.value == null ? null : Math.round(d.value * 10 ** MONEY_DECIMALS) / 10 ** MONEY_DECIMALS);
  if (v.error) warnings.push(v.error);
  if (d.derived && v.value != null) warnings.push(tApi("api.companyListings.bidImport.toplamdanTuretildi"));
  if (r.unitPrice != null && r.totalPrice != null && r.quantity != null && r.quantity > 0) {
    const calc = r.unitPrice * r.quantity;
    if (Math.abs(calc - r.totalPrice) / Math.max(r.totalPrice, 1) > 0.02) {
      warnings.push(tApi("api.companyListings.bidImport.toplamUyusmuyor"));
    }
  }
  return v.value;
}

/**
 * Belge satırı para birimi: izinli kod AÇIKÇA döner (talebin ana birimi
 * dahil); null YALNIZ satırda birim yoksa / kabul edilmiyorsa (+ uyarı) ve
 * istemci bunu teklif birimi sayar. Eskiden ana birim null'a çevriliyordu;
 * tedarikçi teklif birimini ana birimden farklı seçince "185 TRY" satırı
 * 185 USD olarak forma yazılıyordu (derin denetim MU-23 gözden geçirme).
 * Satırda birim yoksa belgenin baskın birimi (izinliyse) kullanılır.
 */
function docRowCurrency(
  r: DocRow,
  opts: { allowedCurrencies: string[]; docCurrency?: string | null },
  warnings: string[],
): string | null {
  const allowed = (c: string) => opts.allowedCurrencies.length === 0 || opts.allowedCurrencies.includes(c);
  const cur = normalizeCurrency(r.currency);
  if (!cur) {
    const docCur = normalizeCurrency(opts.docCurrency ?? null);
    return docCur && allowed(docCur) ? docCur : null;
  }
  if (allowed(cur)) return cur;
  warnings.push(tApi("api.companyListings.bidImport.satirParaBirimiKabulEdilmiyor", { currency: cur }));
  return null;
}

/** Belge satırının değerlerini eşleşen kaleme yazar + sağlık uyarıları. */
export function applyDocRowValues(
  m: BidImportMatch,
  r: DocRow,
  it: MatchItem,
  opts: { allowedCurrencies: string[]; docCurrency?: string | null },
): void {
  m.unitPrice = docRowPrice(r, m.warnings);
  if (r.quantity != null && Number.isFinite(r.quantity)) {
    const q = Number(it.quantity);
    if (Number.isFinite(q) && q > 0 && Math.abs(q - r.quantity) / q > 0.001) {
      m.warnings.push(
        tApi("api.companyListings.bidImport.miktarFarkli", {
          docQuantity: String(r.quantity),
          itemQuantity: String(it.quantity),
        }),
      );
    }
  }
  if (r.unit && foldText(r.unit) !== foldText(it.unit)) {
    m.warnings.push(
      tApi("api.companyListings.bidImport.birimFarkli", { docUnit: r.unit, itemUnit: it.unit }),
    );
  }
  m.currency = docRowCurrency(r, opts, m.warnings);
  m.deliveryTime = normalizeDeliveryTime(r.deliveryText);
  if (r.deliveryText && !m.deliveryTime) m.warnings.push(tApi("api.companyListings.bidImport.teslimAnlasilamadi", { text: r.deliveryText }));
}
