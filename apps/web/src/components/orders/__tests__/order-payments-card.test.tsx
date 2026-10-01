// @vitest-environment jsdom
import type { CompanyOrderDetail } from "@/hooks/use-company-orders";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { roles: ["SATIN_ALMACI", "SATISCI"] } }),
}));
vi.mock("@/components/providers/confirm-dialog", () => ({
  useConfirm: () => vi.fn(async () => true),
}));
vi.mock("@/hooks/use-company-orders", () => {
  const mut = () => ({ mutateAsync: vi.fn(), isPending: false });
  return { useRecordPayment: mut, usePaymentDecision: mut };
});

import { OrderPaymentsCard } from "../order-payments-card";

function order(over: Partial<CompanyOrderDetail> = {}): CompanyOrderDetail {
  return {
    id: "o1",
    number: "ORD-1",
    amount: "21000",
    currency: "TRY",
    status: "ACCEPTED",
    role: "buyer",
    counterparty: "Karşı A.Ş.",
    counterpartyCompanyId: "c1",
    listingId: "l1",
    listingTitle: "Talep",
    listingType: "ALIM",
    listingNumber: "ROT-1",
    createdAt: new Date().toISOString(),
    counterpartyProfile: { city: null, industry: null, email: null, phone: null, rothernId: null },
    paymentTiming: "BEFORE_DELIVERY",
    requireGuaranteeLetter: false,
    paymentOpen: false,
    paymentTotals: { confirmed: "0", pending: "0", remaining: "21000" },
    payments: [],
    items: [],
    acceptedAt: null,
    acceptedNote: null,
    bankAccountHolder: null,
    bankIban: null,
    expectedDeliveryDate: null,
    invoiceNumber: null,
    deliveryStartedAt: null,
    deliveryNote: null,
    deliveredAt: null,
    completedAt: null,
    completedNote: null,
    rejectedAt: null,
    rejectedReason: null,
    cancelledAt: null,
    cancelReason: null,
    ...over,
  } as CompanyOrderDetail;
}

describe("OrderPaymentsCard — arayüz testi webB-07", () => {
  it("D-105: iptal edilen siparişte 'Kalan' yok; onaylı ödeme varsa iade notu", () => {
    render(
      <OrderPaymentsCard
        order={order({
          status: "CANCELLED",
          paymentTotals: { confirmed: "5000", pending: "0", remaining: "16000" },
        })}
      />,
    );
    expect(screen.queryByText("Kalan")).not.toBeInTheDocument();
    expect(screen.getByText(/iadesi taraflar arasında/)).toBeInTheDocument();
  });

  it("O-029: akreditifte bayat 'satıcı onayladıktan sonra eklenebilir' metni yok", () => {
    render(<OrderPaymentsCard order={order({ paymentCategory: "LETTER_OF_CREDIT" })} />);
    expect(screen.queryByText(/onayladıktan sonra eklenebilir/)).not.toBeInTheDocument();
    expect(screen.getByText("Henüz ödeme kaydı yok.")).toBeInTheDocument();
    expect(screen.getByText(/banka kanalından/)).toBeInTheDocument();
  });

  it("O-029: ödeme bankadan alındı işaretlendikten sonra akreditif bilgi bandı kalkar", () => {
    render(
      <OrderPaymentsCard
        order={order({
          status: "DELIVERED",
          paymentCategory: "LETTER_OF_CREDIT",
          lcPaidAt: new Date().toISOString(),
        })}
      />,
    );
    expect(screen.queryByText(/banka kanalından/)).not.toBeInTheDocument();
  });
});
