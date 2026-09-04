/**
 * Pazarlık çalışma masası — kalem fiyatlarını hedef toplama dağıtma matematiği.
 *
 * Tüm hesap BigInt tabanlı KESİN ondalık aritmetikle yapılır: sunucu teklif
 * toplamını Prisma Decimal ile birebir hesapladığı için istemcide float
 * (0.1+0.2) sapması "hedefe ulaştın" derken sunucunun 400 dönmesine yol
 * açabilirdi. Buradaki karşılaştırmalar sunucununkiyle bit-bit aynıdır.
 *
 * Yön tek: açık eksiltme pazarlığında toplam hedefin ALTINA/eşitine iner.
 */

/** İç ölçek: tüm tutarlar 10^12 ile çarpılmış BigInt olarak taşınır. */
const S = 12;
const ONE = 10n ** BigInt(S);

/** "12.34" | 12.34 → 12.34×10^S (BigInt). Bilinmeyen biçimde 0 döner. */
function parseDec(v: string | number | null | undefined): bigint {
  if (v == null) return 0n;
  const s = String(v).trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return 0n;
  const [, sign, int, fracRaw = ""] = m;
  const frac = (fracRaw + "0".repeat(S)).slice(0, S);
  const n = BigInt(int) * ONE + BigInt(frac);
  return sign === "-" ? -n : n;
}

/** 10^S ölçekli BigInt → ondalık string (sondaki sıfırlar kırpılır). */
function formatDec(n: bigint): string {
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const int = abs / ONE;
  const frac = (abs % ONE).toString().padStart(S, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

/** İki ondalık string/number'ı kesin karşılaştırır. */
export function cmpDecimal(a: string | number, b: string | number): -1 | 0 | 1 {
  const d = parseDec(a) - parseDec(b);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}

/** Kesin ondalık toplama (string döner). */
export function decAdd(a: string | number, b: string | number): string {
  return formatDec(parseDec(a) + parseDec(b));
}

/** Kesin ondalık çıkarma: a − b (string döner). */
export function decSub(a: string | number, b: string | number): string {
  return formatDec(parseDec(a) - parseDec(b));
}

/** `decimals` haneli en küçük birim fiyat adımı: 2 → "0.01". */
export function unitStep(decimals: number): string {
  const d = Math.min(Math.max(decimals, 0), 6);
  return d === 0 ? "1" : `0.${"0".repeat(d - 1)}1`;
}

export interface DistributeItem {
  id: string;
  quantity: string | number;
  /** Mevcut birim fiyat (taşınan teklif / formdaki değer). */
  unitPrice: string | number;
  /** Kilitli kalemin fiyatına dokunulmaz. */
  locked?: boolean;
}

export interface DistributeResult {
  /** Hedefe ulaşıldı mı (toplam ≤ hedef). */
  ok: boolean;
  /** Kalem id → yeni birim fiyat (ondalık string, `decimals` hanede). */
  prices: Record<string, string>;
  /** Yeni kesin toplam (ondalık string). */
  achievedTotal: string;
  /** ok=false ise hedefe kapatılamayan fark (pozitif ondalık string). */
  remaining: string;
}

/** Kalemlerin kesin toplamı: Σ birimFiyat × miktar (ondalık string). */
export function exactTotal(
  items: { quantity: string | number; unitPrice: string | number }[],
): string {
  let sum2S = 0n; // 2S ölçekli (fiyat×miktar çarpımı)
  for (const it of items) {
    sum2S += parseDec(it.unitPrice) * parseDec(it.quantity);
  }
  return formatDec2S(sum2S);
}

/** 2S ölçekli toplamı string'e çevirir (S ölçeğine indirip formatlar; kesin). */
function formatDec2S(n2S: bigint): string {
  // fiyat ≤ S hane, miktar ≤ S hane → çarpım ≤ 2S hane. S haneye inerken
  // kalan kısım yalnız S+ haneli kesir olabilir; formatlamada koru.
  const neg = n2S < 0n;
  const abs = neg ? -n2S : n2S;
  const TWO = ONE * ONE;
  const int = abs / TWO;
  const frac = (abs % TWO).toString().padStart(2 * S, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

/**
 * Kalan indirim tutarını kilitsiz kalemlere satır-tutarı ağırlığıyla dağıtır;
 * alt sınıra (en küçük pozitif adım) çarpan kalemin artığı kalanlara
 * aktarılır. Birim fiyatlar `decimals` haneye HEDEFİ SAĞLAYAN yöne (aşağı)
 * yuvarlanır, yuvarlama artığı adım adım geri eklenir (toplam hedefe en yakın
 * geçerli değerde biter). Fiyatlar hiçbir kalemde orijinalin üstüne çıkmaz ve
 * pozitif kalır.
 */
export function distributeToTarget(opts: {
  items: DistributeItem[];
  targetTotal: string | number;
  /** Birim fiyat hane sayısı (ilan `decimalPlaces`), varsayılan 2. */
  decimals?: number;
}): DistributeResult {
  const d = Math.min(Math.max(opts.decimals ?? 2, 0), 6);
  const step = 10n ** BigInt(S - d); // birim fiyat adım büyüklüğü (S ölçek)

  interface Row {
    id: string;
    qty: bigint; // S ölçek, > 0
    orig: bigint; // orijinal fiyat (S ölçek)
    cur: bigint; // güncel fiyat
    floor: bigint; // alt sınır (bu değerin altına inilemez)
    mutable: boolean;
  }

  const rows: Row[] = [];
  for (const it of opts.items) {
    const qty = parseDec(it.quantity);
    const price = parseDec(it.unitPrice);
    if (qty <= 0n) continue;
    // Alt sınır: en küçük pozitif adım — gönderimde birim fiyat > 0 şartı var.
    rows.push({
      id: it.id,
      qty,
      orig: price,
      cur: price,
      floor: step,
      mutable: !it.locked && price > 0n,
    });
  }

  const target2S = parseDec(opts.targetTotal) * ONE;
  const total2S = () => rows.reduce((s, r) => s + r.cur * r.qty, 0n);

  // Faz 1 — orantılı dağıtım: gereken kesinti satır tutarı ağırlığıyla pay
  // edilir; sınıra çarpan kalem sabitlenir, artık sonraki turda kalanlara
  // gider. Her turda en az bir kalem sabitlenir ya da ihtiyaç biter → ≤ n tur.
  for (let guard = 0; guard < rows.length + 1; guard++) {
    const need = total2S() - target2S;
    if (need <= 0n) break;
    const active = rows.filter((r) => r.mutable && r.cur > r.floor);
    if (active.length === 0) break;
    const activeLine = active.reduce((s, r) => s + r.cur * r.qty, 0n);
    if (activeLine <= 0n) break;
    let clamped = false;
    for (const r of active) {
      const share = (need * (r.cur * r.qty)) / activeLine; // 2S ölçek
      const cutPerUnit = share / r.qty; // S ölçek
      // Hedefi sağlayan yöne yuvarla: kesintiyi adımın KATINA YUKARI çek
      // (fiyat aşağı iner) — yuvarlama artığı Faz 2'de geri eklenir.
      let next = floorToStep(r.cur - cutPerUnit, step);
      if (next < r.floor) {
        next = r.floor;
        clamped = true;
      }
      r.cur = next;
    }
    if (!clamped) break; // kimse sınıra çarpmadıysa ikinci tura gerek yok
  }

  // Faz 2 — ince ayar. Önce hedef hâlâ aşılmışsa (kalan bölme artıkları)
  // adım adım ek kesinti; sonra fazla kesilmişse (yuvarlama) hedefi AŞMADAN
  // geri ekleme. Geri ekleme orijinal fiyatı geçemez. Büyük miktarlı kalem
  // kaba, küçük miktarlı kalem ince taneli düzeltme sağlar — iki geçiş.
  const byQtyDesc = [...rows].sort((a, b) => (a.qty > b.qty ? -1 : 1));
  for (const r of byQtyDesc) {
    if (!r.mutable) continue;
    const over = total2S() - target2S;
    if (over <= 0n) break;
    const stepLine = step * r.qty; // bir adımın toplam etkisi (2S)
    const wantSteps = (over + stepLine - 1n) / stepLine; // ceil
    const canSteps = (r.cur - r.floor) / step;
    const k = wantSteps < canSteps ? wantSteps : canSteps;
    r.cur -= k * step;
  }
  for (const pass of [byQtyDesc, [...byQtyDesc].reverse()]) {
    for (const r of pass) {
      if (!r.mutable) continue;
      const room = target2S - total2S(); // hedefe kalan boşluk (≥0 beklenir)
      if (room <= 0n) break;
      const stepLine = step * r.qty;
      const wantSteps = room / stepLine; // floor — hedef AŞILMAZ
      const canSteps = (r.orig - r.cur) / step; // orijinali geçme
      const k = wantSteps < canSteps ? wantSteps : canSteps;
      if (k > 0n) r.cur += k * step;
    }
  }

  const finalTotal = total2S();
  const prices: Record<string, string> = {};
  for (const r of rows) prices[r.id] = formatDec(r.cur);
  const over = finalTotal - target2S;
  return {
    ok: over <= 0n,
    prices,
    achievedTotal: formatDec2S(finalTotal),
    remaining: over > 0n ? formatDec2S(over) : "0",
  };
}

/**
 * Tüm kilitsiz kalemlere aynı indirim yüzdesini uygular. Fiyatlar aşağı
 * yuvarlanır, en küçük pozitif adıma klamplanır; kilitli kalem ve fiyatsız
 * (opt-out) kalem atlanır. Kalem id → yeni birim fiyat döner.
 */
export function applyPercentToItems(opts: {
  items: DistributeItem[];
  percent: number | string; // ör. 5 ya da "2.5" → %
  decimals?: number;
}): Record<string, string> {
  const d = Math.min(Math.max(opts.decimals ?? 2, 0), 6);
  const step = 10n ** BigInt(S - d);
  // Yüzdeyi de kesin işle ("5.5" gibi) — float çarpanı sapardı.
  const pct = parseDec(opts.percent);
  const HUNDRED = 100n * ONE;
  const out: Record<string, string> = {};
  for (const it of opts.items) {
    if (it.locked) continue;
    const price = parseDec(it.unitPrice);
    if (price <= 0n) continue;
    let next = floorToStep((price * (HUNDRED - pct)) / HUNDRED, step);
    if (next < step) next = step;
    out[it.id] = formatDec(next);
  }
  return out;
}

function floorToStep(v: bigint, step: bigint): bigint {
  const r = v % step;
  return r === 0n ? v : r > 0n ? v - r : v - r - step;
}
