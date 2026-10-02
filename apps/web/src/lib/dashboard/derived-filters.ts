/**
 * TÜRETİLMİŞ KÜME SÜZGEÇLERİ — Şirketim › Bekleyen İşler satırlarının
 * durumla ifade edilemeyen kümeleri (arayüz testi O-035, yeniden doğrulama).
 *
 * "51 siparişin teslim tarihi geçti" / "4 talebiniz kapanmak üzere" satırları
 * eskiden en dar ÜST kümeye (yalnız `?status=`) bağlanıyordu ve 200 sipariş /
 * 35 talep açıyordu. Kümenin kendisi listelerde ek bir adres parametresiyle
 * süzülür; tanımlar backend `ActionCenterService` ile BİREBİR:
 *
 * - Sipariş `?due=overdue`: teslim edilmemiş ve beklenen teslim tarihi
 *   geçmiş. Alıcıda PENDING/ACCEPTED/CREATED/IN_DELIVERY; satıcıda PENDING
 *   sayılmaz (henüz kabul etmediği siparişin teslimi gecikmiş sayılmaz).
 * - Talep `?closing=nobids`: OPEN, teklifsiz, kapanışa ≤ 3 gün.
 * - Talep `?closing=soon`: OPEN, teklifli, kapanışa ≤ 2 gün (iki küme ayrık).
 * - Talep `?bids=1`: teklif gelmiş talepler ("Gelen Teklifler" KPI'ı; KPI
 *   teklif SAYAR, liste talep gösterir — sayılar bu yüzden eşit değildir).
 * - Sipariş `?payment=overdue`: DELIVERED/COMPLETED, tam ödenmemiş
 *   (`paymentSettled === false`), vade (`paymentDueDate`) geçmiş.
 *   `?payment=open`: aynı evren, vadesi yok ya da henüz gelmemiş (iki küme
 *   ayrık). Vade ve "ödendi" kuralı backend'de liste ile aksiyon merkezi
 *   arasında ORTAK (`paymentDueDate`, `isOrderFullyPaid`).
 * - Talep `?ai=1`: AI tedarikçi önerisi bekleyen talep (liste ucunun
 *   `aiSuggestionsPending` alanı; backend `PENDING_AI_SUGGESTION_RUN_WHERE`).
 *
 * "Teklifli" = sahibin gördüğü teklif (`bidCount`, geri çekilen/taslak hariç)
 * — backend satırı da aynı kümeyi kullanır.
 */

const DAY_MS = 86_400_000;

export type OrderDueFilter = "overdue";
export const ORDER_DUE_VALUES: readonly OrderDueFilter[] = ["overdue"];

/** Henüz teslim edilmemiş sipariş durumları (`ActionCenterService` overdueDel). */
const UNDELIVERED: Record<"buyer" | "seller", ReadonlySet<string>> = {
  buyer: new Set(["PENDING", "ACCEPTED", "CREATED", "IN_DELIVERY"]),
  seller: new Set(["ACCEPTED", "CREATED", "IN_DELIVERY"]),
};

export function parseOrderDue(raw: string | null): OrderDueFilter | null {
  return (ORDER_DUE_VALUES as readonly string[]).includes(raw ?? "")
    ? (raw as OrderDueFilter)
    : null;
}

export function matchesOrderDue(
  o: { status: string; role: "buyer" | "seller"; expectedDeliveryDate?: string | null },
  due: OrderDueFilter | null,
  now: number,
): boolean {
  if (!due) return true;
  return (
    UNDELIVERED[o.role].has(o.status) &&
    !!o.expectedDeliveryDate &&
    new Date(o.expectedDeliveryDate).getTime() < now
  );
}

export type OrderPaymentFilter = "overdue" | "open";
export const ORDER_PAYMENT_VALUES: readonly OrderPaymentFilter[] = ["overdue", "open"];

/** Ödeme satırlarının evreni (`ActionCenterService` paymentPhase). */
const PAYMENT_PHASE: ReadonlySet<string> = new Set(["DELIVERED", "COMPLETED"]);

export function parseOrderPayment(raw: string | null): OrderPaymentFilter | null {
  return (ORDER_PAYMENT_VALUES as readonly string[]).includes(raw ?? "")
    ? (raw as OrderPaymentFilter)
    : null;
}

export function matchesOrderPayment(
  o: { status: string; paymentSettled?: boolean; paymentDueDate?: string | null },
  payment: OrderPaymentFilter | null,
  now: number,
): boolean {
  if (!payment) return true;
  if (!PAYMENT_PHASE.has(o.status) || o.paymentSettled !== false) return false;
  const overdue = !!o.paymentDueDate && new Date(o.paymentDueDate).getTime() < now;
  return payment === "overdue" ? overdue : !overdue;
}

export type TenderClosingFilter = "nobids" | "soon";
export const TENDER_CLOSING_VALUES: readonly TenderClosingFilter[] = ["nobids", "soon"];

/** Pencereler backend satırlarıyla aynı: teklifsiz 3 gün, teklifli 2 gün. */
const CLOSING_WINDOW_DAYS: Record<TenderClosingFilter, number> = { nobids: 3, soon: 2 };

export function parseTenderClosing(raw: string | null): TenderClosingFilter | null {
  return (TENDER_CLOSING_VALUES as readonly string[]).includes(raw ?? "")
    ? (raw as TenderClosingFilter)
    : null;
}

export function matchesTenderClosing(
  t: { status: string; bidCount: number; bidsCloseAt: string | null },
  closing: TenderClosingFilter | null,
  now: number,
): boolean {
  if (!closing) return true;
  if (t.status !== "OPEN" || !t.bidsCloseAt) return false;
  if ((closing === "nobids") !== (t.bidCount === 0)) return false;
  const closes = new Date(t.bidsCloseAt).getTime();
  return closes > now && closes <= now + CLOSING_WINDOW_DAYS[closing] * DAY_MS;
}

export function matchesTenderHasBids(t: { bidCount: number }, hasBids: boolean): boolean {
  return !hasBids || t.bidCount > 0;
}

export function matchesTenderAiPending(
  t: { aiSuggestionsPending?: boolean },
  aiPending: boolean,
): boolean {
  return !aiPending || t.aiSuggestionsPending === true;
}
