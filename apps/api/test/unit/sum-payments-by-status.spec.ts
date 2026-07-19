/**
 * S3/S4 — ödeme statü-filtreli toplam tek-kaynak (sumPaymentsByStatus).
 * getOne gösterimi (CONFIRMED/AWAITING kovaları) + recordPayment cap
 * (AWAITING+CONFIRMED committed) aynı reducer'ı kullanır.
 */
import { Prisma } from "@rothern/db";
import { sumPaymentsByStatus } from "../../src/common/company/order-payments";

const p = (status: string, amount: string) => ({
  status,
  amount: new Prisma.Decimal(amount),
});

describe("S3/S4 — sumPaymentsByStatus", () => {
  const payments = [
    p("CONFIRMED", "100.50"),
    p("AWAITING_CONFIRMATION", "40.25"),
    p("CONFIRMED", "9.50"),
    p("REJECTED", "999.99"),
  ];

  it("CONFIRMED toplamı (S3 gösterim)", () => {
    expect(sumPaymentsByStatus(payments, ["CONFIRMED"]).toString()).toBe("110");
  });

  it("AWAITING toplamı", () => {
    expect(
      sumPaymentsByStatus(payments, ["AWAITING_CONFIRMATION"]).toString(),
    ).toBe("40.25");
  });

  it("committed = AWAITING+CONFIRMED (S4 cap), REJECTED hariç", () => {
    expect(
      sumPaymentsByStatus(payments, [
        "AWAITING_CONFIRMATION",
        "CONFIRMED",
      ]).toString(),
    ).toBe("150.25");
  });

  it("boş dizi / eşleşmeyen statü → 0", () => {
    expect(sumPaymentsByStatus([], ["CONFIRMED"]).toString()).toBe("0");
    expect(sumPaymentsByStatus(payments, ["FOO"]).toString()).toBe("0");
  });
});
