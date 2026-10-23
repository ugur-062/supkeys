// @vitest-environment jsdom
import type { CompanyOrderDetail } from "@/hooks/use-company-orders";
import { render, screen, within } from "@testing-library/react";
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
    expect(screen.queryByText("Bildirilmemiş")).not.toBeInTheDocument();
    expect(screen.getByText(/iadesi taraflar arasında/)).toBeInTheDocument();
  });

  // FX-00 yeniden doğrulama: kartın üçüncü hücresi (toplam − onaylı − bekleyen)
  // da "Kalan" yazıyordu; Özet kartının "Kalan"ı ise onaylıya göre borç
  // (D-127) — aynı etiket iki farklı tutar. Hücre artık "Bildirilmemiş".
  it("bekleyen bildirim varken kartın üçüncü hücresi 'Kalan' değil 'Bildirilmemiş'", () => {
    render(
      <OrderPaymentsCard
        order={order({
          amount: "2000",
          paymentTotals: { confirmed: "0", pending: "1200.5", remaining: "799.5" },
        })}
      />,
    );
    expect(screen.queryByText("Kalan")).not.toBeInTheDocument();
    expect(screen.getByText("Bildirilmemiş")).toBeInTheDocument();
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

  it("NEW-4: teslim sonrası ayıp ihbarlı DISPUTED'ta 'teslim alındıktan sonra açılır' yazmaz; neden söylenir", () => {
    render(
      <OrderPaymentsCard
        order={order({
          status: "DISPUTED",
          paymentTiming: "AFTER_DELIVERY",
          deliveredAt: new Date().toISOString(),
          defectNotifiedAt: new Date().toISOString(),
        } as Partial<CompanyOrderDetail>)}
      />,
    );
    expect(screen.queryByText(/teslim alındıktan sonra açılır/)).not.toBeInTheDocument();
    expect(screen.getByText(/Ayıp ihbarı açıkken ödeme kaydı yapılamaz/)).toBeInTheDocument();
    expect(screen.getByText("Henüz ödeme kaydı yok.")).toBeInTheDocument();
  });

  it("NEW-4: teslim öncesi vadeli siparişte eski metin korunur", () => {
    render(<OrderPaymentsCard order={order({ paymentTiming: "AFTER_DELIVERY" })} />);
    expect(screen.getByText(/teslim alındıktan sonra açılır/)).toBeInTheDocument();
    expect(screen.queryByText(/Ayıp ihbarı açıkken/)).not.toBeInTheDocument();
  });
});

describe("OrderPaymentsCard — mobil denetim (g07/g08)", () => {
  it("toplamlar telefonda satır satır (tek sütun), sm'den üç sütun; tutar bölünmez", () => {
    render(
      <OrderPaymentsCard
        order={order({
          amount: "2345670",
          paymentTotals: { confirmed: "0", pending: "123456.78", remaining: "2222213.22" },
        })}
      />,
    );
    const label = screen.getByText("Bildirilmemiş");
    const cell = label.parentElement!;
    expect(cell.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["flex", "justify-between", "sm:block", "sm:text-center"]),
    );
    const value = within(cell).getByText("2.222.213,22 ₺");
    expect(value.className.split(/\s+/)).toContain("whitespace-nowrap");
    const grid = cell.parentElement!;
    expect(grid.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["grid-cols-1", "sm:grid-cols-3", "divide-y", "sm:divide-y-0"]),
    );
  });

  it("'Ödemeyi Yaptım' telefonda başlığın altında tek satır (sıkışıp iki satıra kırılmaz)", () => {
    render(<OrderPaymentsCard order={order({ paymentOpen: true })} />);
    const btn = screen.getByRole("button", { name: /Ödemeyi Yaptım/ });
    expect(btn.className.split(/\s+/)).toEqual(expect.arrayContaining(["whitespace-nowrap", "shrink-0"]));
    expect(btn.parentElement!.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["flex-col", "sm:flex-row"]),
    );
  });

  it("satıcının onay bekleyen ödeme satırı sarar; düğmeler asistan düğmesinin payını bırakır", () => {
    render(
      <OrderPaymentsCard
        order={order({
          role: "seller",
          paymentTotals: { confirmed: "0", pending: "123456.78", remaining: "0" },
          payments: [
            {
              id: "p1",
              amount: "123456.78",
              status: "AWAITING_CONFIRMATION",
              method: null,
              note: "bildirim dili kontrolü",
              createdAt: new Date().toISOString(),
            },
          ],
        } as unknown as Partial<CompanyOrderDetail>)}
      />,
    );
    const reject = screen.getByRole("button", { name: /tutarındaki ödemeyi reddet/i });
    const confirm = screen.getByRole("button", { name: /tutarındaki ödemeyi aldım/i });
    // Onay ve ret aynı bölünmez çiftte: sarınca ret tek başına alt satıra düşmez.
    const pair = reject.parentElement!;
    expect(confirm.parentElement).toBe(pair);
    expect(pair.className.split(/\s+/)).toContain("shrink-0");
    const actions = pair.parentElement!;
    expect(actions.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["ml-auto", "flex-wrap", "pr-16", "lg:pr-0"]),
    );
    const row = actions.parentElement!;
    expect(row.className.split(/\s+/)).toContain("flex-wrap");
    // Tutar ve para birimi aynı satırda kalır.
    const amount = within(row).getAllByText("123.456,78 ₺")[0];
    expect(amount.className.split(/\s+/)).toContain("whitespace-nowrap");
  });
});
