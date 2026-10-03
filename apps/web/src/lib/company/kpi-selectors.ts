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

/*
 * TEKLİF sayaçları (karar bekleyen / kazanılan) artık SUNUCUDA sayılır
 * (arayüz testi O-005): `GET company/listings/my-bids` → `counts`
 * (`company-listings.service.ts` `listMyBids`, `MY_BID_UNDECIDED_LISTING`).
 * Eskiden burada en yeni 200 teklifin listesinden sayılıyordu; 200'ü aşan
 * firmada pano ve liste yanlış sayı gösteriyordu. Tekliflerim özeti ve
 * Şirketim KPI'ları aynı `counts`u okur.
 */

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
