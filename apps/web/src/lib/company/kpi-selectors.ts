import type { MyBid } from "@/hooks/use-company-listings";
import type { CompanyOrder } from "@/hooks/use-company-orders";

/**
 * KPI SEÇİCİLERİ — TEK KAYNAK (v2 denetimi 4a, 2026-09-03).
 *
 * Aynı sayı üç yerde üç farklı hesapla çıkıyordu: satış panosu "Aktif
 * Tekliflerim 4" ↔ Satış Tekliflerim listesinde 2 · "Kazandığım İşler 4" ↔
 * listede 3 · "Bekleyen Sipariş 0" ↔ Satışlarım "Aktif 1". Kök neden: pano
 * sunucudaki sayımı kullanıyordu, liste kendi statü kümesini yazıyordu;
 * sipariş KPI'ı da listenin "Aktif" kümesinden farklı bir statü kümesi
 * kullanıyordu.
 *
 * Kural: pano, liste başlığı ve rapor AYNI diziden AYNI seçiciyle sayar.
 * Tanımlar buradadır; başka yerde statü kümesi yazılmaz.
 */

/** Teklif hâlâ karar bekliyor: verilmiş ve ilan karara bağlanmamış. */
const OFFER_OPEN_LISTING = new Set(["OPEN", "IN_AWARD", "IN_AWARD_APPROVAL"]);

/** Açık taleplere verdiğim, karar bekleyen teklifler. */
export function selectActiveOffers(bids: MyBid[]): MyBid[] {
  return bids.filter(
    (b) => b.status === "SUBMITTED" && OFFER_OPEN_LISTING.has(b.listing.status),
  );
}

/** Kazandığım işler — KISMİ kazanım DAHİL (etiket bunu söyler). */
export function selectWonOffers(bids: MyBid[]): MyBid[] {
  return bids.filter((b) => b.status === "WON" || b.status === "AWARDED_PARTIAL");
}

/**
 * Canlı sipariş — Satışlarım/Siparişlerim "Aktif" kutusuyla BİREBİR (B4 MECE):
 * DELIVERED "teslim alındı ama kapanmadı" = hâlâ canlı.
 */
const ORDER_ACTIVE = new Set(["PENDING", "ACCEPTED", "CREATED", "IN_DELIVERY", "DELIVERED"]);
const ORDER_TERMINAL_ISSUE = new Set(["CANCELLED", "REJECTED", "DISPUTED"]);

export function selectActiveOrders(orders: CompanyOrder[], role: "seller" | "buyer"): CompanyOrder[] {
  return orders.filter((o) => o.role === role && ORDER_ACTIVE.has(o.status));
}

/** Ödeme bekleyen — statüden bağımsız türetilmiş ödeme durumu; terminal/ihtilaf hariç. */
export function selectAwaitingPayment(
  orders: CompanyOrder[],
  role: "seller" | "buyer",
): CompanyOrder[] {
  return orders.filter(
    (o) => o.role === role && o.paymentSettled === false && !ORDER_TERMINAL_ISSUE.has(o.status),
  );
}

export function selectTerminalIssues(orders: CompanyOrder[], role: "seller" | "buyer"): CompanyOrder[] {
  return orders.filter((o) => o.role === role && ORDER_TERMINAL_ISSUE.has(o.status));
}
