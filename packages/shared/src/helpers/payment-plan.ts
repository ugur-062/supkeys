/**
 * Ödeme planı — Faz 2 modeli. Kategoriler DB enum'larıyla birebir aynı
 * (@rothern/db'ye bağımlılık almamak için string literal tekrarlanır).
 *
 * Zamanlama (teslim öncesi/sonrası) kullanıcıya SORULMAZ; plandan türetilir:
 * alıcının teslimden ÖNCE aksiyonu olan kategoriler (peşin ödeme, akreditif
 * açtırma) BEFORE, ödeme aracı teslimde/sonrasında olanlar AFTER.
 */
export const PAYMENT_CATEGORIES = [
  "ADVANCE", // peşin (+yüzde; %100 = tam peşin, %<100 YALNIZ yurtiçi)
  "DEFERRED", // vadeli — teslimden N gün sonra (sabit vade ZORUNLU)
  "OPEN_ACCOUNT", // açık hesap — teslim sonrası, vadesiz
  "MAL_MUKABILI", // mal mukabili — teslim alınca öde; vade OPSİYONEL (dış ticaret)
  "CHEQUE", // çek — vade günlü
  "SENET", // senet/bono — vade günlü kıymetli evrak (yurtiçi)
  "LETTER_OF_CREDIT", // akreditif — Sight/Usance (+Teyitli)
  "CASH_AGAINST_DOCS", // vesaik mukabili — belge karşılığı ödeme (dış ticaret)
  "CUSTOM", // özel — serbest not zorunlu
] as const;
export type PaymentCategory = (typeof PAYMENT_CATEGORIES)[number];

/**
 * Yalnız ULUSLARARASI ihalede seçilebilen dış-ticaret ödeme şekilleri —
 * yurtiçi ihalede akreditif/vesaik/mal mukabili kaldırıldı (2026-08-02).
 * UI seçenekten düşürür; backend buildPaymentPlan reddeder (UI kilidi ≠ API
 * kilidi tuzağına karşı çift taraflı).
 */
export const INTERNATIONAL_ONLY_PAYMENT_CATEGORIES: readonly PaymentCategory[] =
  ["MAL_MUKABILI", "LETTER_OF_CREDIT", "CASH_AGAINST_DOCS"];

export const LC_TYPES = ["SIGHT", "USANCE"] as const;
export type LcSubType = (typeof LC_TYPES)[number];

export type DerivedPaymentTiming = "BEFORE_DELIVERY" | "AFTER_DELIVERY";

/** Plandan zamanlama türet — Listing.paymentTiming buna göre yazılır.
 *  Vesaik mukabili: alıcı belge karşılığı (mal yoldayken) öder → BEFORE_DELIVERY
 *  penceresi (ACCEPTED'dan itibaren açık, sevkiyat sırasında ödeme yapılabilir). */
export function derivePaymentTiming(
  category: PaymentCategory,
): DerivedPaymentTiming {
  return category === "ADVANCE" ||
    category === "LETTER_OF_CREDIT" ||
    category === "CASH_AGAINST_DOCS"
    ? "BEFORE_DELIVERY"
    : "AFTER_DELIVERY";
}

/** Vade günü bu planda ZORUNLU mu? (Kısmi peşinde opsiyoneldir — kapsam dışı.) */
export function paymentPlanRequiresDays(
  category: PaymentCategory,
  lcType?: LcSubType | null,
): boolean {
  if (
    category === "DEFERRED" ||
    category === "CHEQUE" ||
    category === "SENET"
  ) {
    return true;
  }
  return category === "LETTER_OF_CREDIT" && lcType === "USANCE";
}

/** Teminat mektubu önerilir mi? Yalnız peşinde — LC'de garanti zaten bankada. */
export function paymentPlanSuggestsGuarantee(
  category: PaymentCategory,
): boolean {
  return category === "ADVANCE";
}

/**
 * Gönderim ÖNCESİ peşin ŞARTI ve YÜZDESİ (KURAL — hesap değil). ADVANCE'ta
 * advancePercent; diğer kategorilerde null (peşin şartı yok).
 *
 * `?? 100` = FAIL-CLOSED BACKSTOP (sessiz iş varsayımı DEĞİL). Yazma kapısı artık
 * ADVANCE'ta advancePercent'i ZORUNLU kılıyor (create-listing.dto @ValidateIf +
 * buildPaymentPlan throw) → yeni null üretilmez. Bu backstop yalnız stray/legacy
 * null içindir: onu %100'e (en katı peşin kapısı) düşürmek, `advanceDueDecimal`'da
 * null→Decimal(0) (peşin şartı YOK = ödemesiz sevk) fail-OPEN'ından güvenlidir.
 * Bu yüzden KALDIRILMAZ (Grup 4 kararı; ölçüm: 0 legacy null ama defense-in-depth).
 *
 * NOT (INV-MONEY-1): tutar HESABI burada DEĞİL — shared bir kural kütüphanesidir,
 * para motoru değil. Decimal tutar (`total × pct / 100`, ROUND_HALF_UP) API
 * katmanında yapılır (Prisma.Decimal). Float `Math.round` para hesabı kaldırıldı.
 */
export function advancePercentFor(
  category: PaymentCategory,
  advancePercent: number | null | undefined,
): number | null {
  if (category !== "ADVANCE") return null;
  return advancePercent ?? 100;
}

/** Akreditif siparişi mi? Adım seti ve ödeme akışı LC'de tamamen farklıdır. */
export function isLetterOfCredit(category: PaymentCategory): boolean {
  return category === "LETTER_OF_CREDIT";
}

/** Teslimden sonra vadesi hesaplanan (vade günlü) ödeme kategorileri —
 *  DEFERRED/CHEQUE/SENET, kısmi peşin kalanı (ADVANCE + paymentDays) ve mal
 *  mukabili (opsiyonel vade girildiyse). paymentDueDate paymentDays yoksa null
 *  döndürdüğünden, vadesiz mal mukabili/açık hesapta hatırlatma sessizce kapalı. */
export const DUE_DATE_CATEGORIES: readonly PaymentCategory[] = [
  "DEFERRED",
  "CHEQUE",
  "SENET",
  "ADVANCE", // kısmi peşinde kalan vadeli olabilir
  "MAL_MUKABILI", // teslim alınca öde; vade girildiyse takip et
];

/**
 * Vadeli ödeme günü olan siparişte vade tarihi = teslim tarihi + paymentDays.
 * Yalnız DUE_DATE_CATEGORIES için anlamlı; değilse null. deliveredAt yoksa
 * (henüz teslim edilmedi) null.
 */
export function paymentDueDate(
  category: PaymentCategory,
  paymentDays: number | null | undefined,
  deliveredAt: Date | null | undefined,
): Date | null {
  if (!deliveredAt || !paymentDays) return null;
  if (!DUE_DATE_CATEGORIES.includes(category)) return null;
  const d = new Date(deliveredAt);
  d.setDate(d.getDate() + paymentDays);
  return d;
}
