/**
 * Teklif formunun mevcut tekliften tohumlanan kalem fiyatı (taslak devam,
 * eleme sonrası yeniden teklif, pazarlık yeni turu).
 *
 * Arayüz testi son tur S-SELL: kapalı zarf turunda kalem bazlı farklı para
 * birimiyle (madde 9 — ör. ana birim TRY, kalem USD) verilen teklif, alıcı
 * yeni turu AÇIK EKSİLTME (pazarlık) olarak açınca aynen taşınıyordu. Formda
 * USD fiyat "₺" sütununa ham yazılıyor (2,75 $ → "2,75 ₺"), çalışma masası
 * 1.375 $'ı ₺ gibi toplayıp sahte "indirim" gösteriyordu; gönderim kalem
 * birimini (USD) taşıdığı için sunucu her denemeyi 400 ile reddediyordu
 * (pazarlıkta tek birim — kalem birimi yalnız kapalı zarf ALIM'da). Kalem
 * birimi denetimi bulunmayan masada tedarikçi bütün tur boyunca teklif
 * veremiyordu.
 *
 * Kural: kalem birimi bu talepte kullanılamıyorsa (`allowItemCurrency`
 * false) yabancı birimli kalem, teklifin kayıtlı çevrim damgasıyla
 * (`fxToBase` — sunucunun `bid.amount`ı hesapladığı AYNI damga) ana birime
 * çevrilir ve kalem birimi düşer. Yuvarlama YUKARI: değiştirilmeden
 * gönderilen fiyat, önceki teklifin altına kuruş farkıyla "kendiliğinden"
 * inmesin — indirim tedarikçinin kendi kararı kalsın. Damga yoksa (eski
 * kayıt) fiyat boş bırakılır; tedarikçi ana birimde kendisi girer (yanlış
 * birimde sessiz fiyat yerine).
 */

/** Para alanlarının ondalık hanesi (DB Decimal(18,2)). */
const MONEY_DECIMALS = 2;

export interface SeedBidItem {
  unitPrice: string | number;
  /** Kalem birimi (null/"" = teklifin ana birimi). */
  currency?: string | null;
  /** Kalem birimi → teklifin ana birimi damgası. */
  fxToBase?: string | number | null;
}

export interface SeededItemPrice {
  /** Ham normalize fiyat ("1500.50" | "1500" | ""). */
  price: string;
  /** Formdaki kalem birimi ("" = ana birim). */
  currency: string;
  /** Yabancı birimli kalem ana birime çevrildi mi (bilgi notu için). */
  converted: boolean;
}

const SCALE = 12;
const ONE = 10n ** BigInt(SCALE);

function parseDec(v: string | number): bigint | null {
  const s = typeof v === "number" ? v.toFixed(SCALE) : String(v).trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const [, int, fracRaw = ""] = m;
  return BigInt(int) * ONE + BigInt((fracRaw + "0".repeat(SCALE)).slice(0, SCALE));
}

/**
 * Ham fiyat metni — kesirli fiyat 2 haneyle ("1500.5" → "1500.50"; Decimal
 * `toString` sondaki sıfırı atıyor, alan "1.500,5" gösteriyordu), tam sayı
 * olduğu gibi ("1500").
 */
export function normalizeSeedPrice(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return n === 0 ? "0" : "";
  const s = String(v).trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return Number.isInteger(n) ? String(n) : n.toFixed(MONEY_DECIMALS);
  const [, int, frac = ""] = m;
  const trimmed = frac.replace(/0+$/, "");
  if (!trimmed) return String(BigInt(int));
  return `${BigInt(int)}.${trimmed.padEnd(MONEY_DECIMALS, "0")}`;
}

/** a × b, `MONEY_DECIMALS` haneye YUKARI yuvarlanmış (kesin BigInt). */
function mulCeilMoney(a: bigint, b: bigint): string {
  const product = a * b; // ölçek 10^(2·SCALE)
  const unit = 10n ** BigInt(2 * SCALE - MONEY_DECIMALS);
  const cents = (product + unit - 1n) / unit;
  const int = cents / 100n;
  const frac = (cents % 100n).toString().padStart(MONEY_DECIMALS, "0");
  return frac === "00" ? String(int) : `${int}.${frac}`;
}

export function seedBidItemPrice(
  item: SeedBidItem,
  opts: { bidCurrency: string; allowItemCurrency: boolean },
): SeededItemPrice {
  const foreign =
    !!item.currency && item.currency !== opts.bidCurrency ? item.currency : "";
  if (!foreign || opts.allowItemCurrency) {
    return {
      price: normalizeSeedPrice(item.unitPrice),
      currency: foreign,
      converted: false,
    };
  }
  const unit = parseDec(item.unitPrice);
  const fx = item.fxToBase != null ? parseDec(item.fxToBase) : null;
  if (unit == null || fx == null || fx <= 0n) {
    return { price: "", currency: "", converted: true };
  }
  return { price: mulCeilMoney(unit, fx), currency: "", converted: true };
}
