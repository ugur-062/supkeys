import { describe, expect, it } from "vitest";
import type { CompanyOrder } from "@/hooks/use-company-orders";
import { selectActiveOrders, selectAwaitingPayment } from "../kpi-selectors";

/**
 * KPI seçicileri — pano, liste ve rapor AYNI tanımı kullanır. Kilit: sipariş
 * "Aktif" kümesi Satışlarım ile birebir. (Teklif sayaçları sunucuda —
 * `listMyBids` `counts`, API `service-misc.spec` "listMyBids SAYFALI".)
 */
const order = (role: "seller" | "buyer", status: string, paymentSettled?: boolean) =>
  ({ id: Math.random().toString(36), role, status, paymentSettled }) as unknown as CompanyOrder;

describe("kpi-selectors", () => {
  it("aktif sipariş: PENDING…DELIVERED (DELIVERED canlı), rol süzülür; ödeme bekleyen türetilmiş", () => {
    const orders = [
      order("seller", "PENDING", false),
      order("seller", "DELIVERED", false),
      order("seller", "COMPLETED", true),
      order("seller", "CANCELLED", false),
      order("buyer", "IN_DELIVERY", false),
    ];
    expect(selectActiveOrders(orders, "seller")).toHaveLength(2);
    expect(selectAwaitingPayment(orders, "seller")).toHaveLength(2); // CANCELLED hariç
    expect(selectActiveOrders(orders, "buyer")).toHaveLength(1);
  });
});
