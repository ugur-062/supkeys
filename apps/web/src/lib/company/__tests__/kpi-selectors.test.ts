import { describe, expect, it } from "vitest";
import type { MyBid } from "@/hooks/use-company-listings";
import type { CompanyOrder } from "@/hooks/use-company-orders";
import {
  selectActiveOffers,
  selectActiveOrders,
  selectAwaitingPayment,
  selectWonOffers,
} from "../kpi-selectors";

/**
 * KPI seçicileri — pano, liste ve rapor AYNI tanımı kullanır. Kilit: ilan
 * TİPİ süzülür (satın alma tarafında verilen teklif satış panosuna sayılmaz),
 * karar verilmiş ilandaki SUBMITTED teklif aktif değildir, sipariş "Aktif"
 * kümesi Satışlarım ile birebir.
 */
const bid = (o: Partial<MyBid> & { status: MyBid["status"]; type: "ALIM"; ls: string }) =>
  ({
    id: Math.random().toString(36),
    status: o.status,
    listing: { type: o.type, status: o.ls },
  }) as unknown as MyBid;

const order = (role: "seller" | "buyer", status: string, paymentSettled?: boolean) =>
  ({ id: Math.random().toString(36), role, status, paymentSettled }) as unknown as CompanyOrder;

describe("kpi-selectors", () => {
  it("aktif teklif: SUBMITTED ∧ ilan karara bağlanmamış ∧ doğru tip", () => {
    const bids = [
      bid({ status: "SUBMITTED", type: "ALIM", ls: "OPEN" }),
      bid({ status: "SUBMITTED", type: "ALIM", ls: "IN_AWARD_APPROVAL" }),
      bid({ status: "SUBMITTED", type: "ALIM", ls: "AWARDED" }), // karar verildi → aktif değil
      bid({ status: "DRAFT", type: "ALIM", ls: "OPEN" }),
    ];
    expect(selectActiveOffers(bids)).toHaveLength(2);
  });

  it("kazanılan: WON + AWARDED_PARTIAL (kısmi dahil), tip süzülür", () => {
    const bids = [
      bid({ status: "WON", type: "ALIM", ls: "AWARDED" }),
      bid({ status: "AWARDED_PARTIAL", type: "ALIM", ls: "AWARDED" }),
      bid({ status: "LOST", type: "ALIM", ls: "AWARDED" }),
    ];
    expect(selectWonOffers(bids)).toHaveLength(2);
  });

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
