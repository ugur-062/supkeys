// @vitest-environment jsdom
import type {
  CompanyOrderDetail,
  CompanyOrderStatus,
} from "@/hooks/use-company-orders";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  order: undefined as CompanyOrderDetail | undefined,
  isLoading: false,
  mutate: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "o1" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/realtime", () => ({
  subscribeRealtime: () => () => {},
}));
vi.mock("@/hooks/use-company-bank-accounts", () => ({
  useBankAccounts: () => ({ data: [] }),
}));

// Ağır alt bileşenleri sadeleştir — durum makinesi/aksiyon UI'sine odaklan.
vi.mock("@/components/orders/order-payments-card", () => ({
  OrderPaymentsCard: () => null,
}));
vi.mock("../_components/order-timeline", () => ({
  OrderTimeline: () => null,
}));
vi.mock("../_components/order-documents-section", () => ({
  OrderDocumentsSection: () => null,
}));
vi.mock("../_components/order-review-card", () => ({
  OrderReviewCard: () => null,
}));

// mut factory'nin İÇİNDE tanımlanmalı — vi.mock dosya başına hoist edilir,
// dışarıdaki `const mut`'a erişim "Cannot access before initialization" verir.
vi.mock("@/hooks/use-company-orders", () => {
  const mut = () => ({ mutateAsync: h.mutate, isPending: false });
  return {
    useOrder: () => ({ data: h.order, isLoading: h.isLoading }),
    useShipOrder: mut,
    useReceiveOrder: mut,
    useCompleteOrder: mut,
    useAcceptOrder: mut,
    useRejectOrder: mut,
    useCancelOrder: mut,
    useRequestCancel: mut,
    useWithdrawCancelRequest: mut,
    useCancelRequestDecision: mut,
    useRaiseDefectNotice: mut,
    useWithdrawDefectNotice: mut,
    useLcStep: mut,
    useProposeRevision: mut,
    useRevisionDecision: mut,
  };
});

import OrderDetailPage from "../page";

function order(
  status: CompanyOrderStatus,
  role: "buyer" | "seller",
  over: Partial<CompanyOrderDetail> = {},
): CompanyOrderDetail {
  return {
    id: "o1",
    number: "ORD-2026-0001",
    amount: "1000",
    currency: "TRY",
    status,
    role,
    counterparty: "Karşı A.Ş.",
    counterpartyCompanyId: "c1",
    listingId: "l1",
    listingTitle: "Çelik Alımı",
    listingType: "ALIM",
    listingNumber: "ROT-2026-0001",
    createdAt: new Date().toISOString(),
    counterpartyProfile: {
      city: null,
      industry: null,
      email: null,
      phone: null,
      rothernId: null,
    },
    paymentTiming: "AFTER_DELIVERY",
    requireGuaranteeLetter: false,
    paymentOpen: false,
    paymentTotals: { confirmed: "0", pending: "0", remaining: "1000" },
    payments: [],
    items: [],
    revisions: [],
    deliveryAddress: null,
    paymentCategory: "OPEN_ACCOUNT",
    advancePercent: null,
    paymentDays: null,
    lcType: null,
    lcConfirmed: false,
    paymentNote: null,
    deliveryTerm: null,
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.order = undefined;
  h.isLoading = false;
});

describe("OrderDetailPage — yükleme/bulunamadı", () => {
  it("yükleniyorken iskelet (aria-hidden) gösterir", () => {
    h.isLoading = true;
    const { container } = render(<OrderDetailPage />);
    expect(container.querySelector('[aria-hidden]')).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
  });

  it("veri yoksa 'Sipariş bulunamadı.'", () => {
    h.order = undefined;
    h.isLoading = false;
    render(<OrderDetailPage />);
    expect(screen.getByText("Sipariş bulunamadı.")).toBeInTheDocument();
  });
});

describe("OrderDetailPage — durum → aksiyon eşlemesi", () => {
  it("PENDING + satıcı → Kabul Et / Reddet", () => {
    h.order = order("PENDING", "seller");
    render(<OrderDetailPage />);
    expect(screen.getByRole("button", { name: "Kabul Et" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reddet" })).toBeInTheDocument();
  });

  it("PENDING + alıcı → onay bekleme metni + İptal Et", () => {
    h.order = order("PENDING", "buyer");
    render(<OrderDetailPage />);
    expect(
      screen.getByText(/Satıcının siparişi onaylaması bekleniyor/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Siparişi İptal Et" }),
    ).toBeInTheDocument();
  });

  it("ACCEPTED + satıcı → Siparişi Gönder (satıcı taşır)", () => {
    h.order = order("ACCEPTED", "seller");
    render(<OrderDetailPage />);
    expect(
      screen.getByRole("button", { name: "Siparişi Gönder" }),
    ).toBeInTheDocument();
  });

  it("ACCEPTED + satıcı + alıcı-toplar teslim (EXW) → Teslime Hazırla", () => {
    h.order = order("ACCEPTED", "seller", { deliveryTerm: "EXW" });
    render(<OrderDetailPage />);
    expect(
      screen.getByRole("button", { name: "Teslime Hazırla" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Siparişi Gönder" }),
    ).not.toBeInTheDocument();
  });

  it("IN_DELIVERY + alıcı → Teslim Aldım", () => {
    h.order = order("IN_DELIVERY", "buyer");
    render(<OrderDetailPage />);
    expect(
      screen.getByRole("button", { name: "Teslim Aldım" }),
    ).toBeInTheDocument();
  });

  it("DELIVERED + alıcı + TAM ödeme onaylı → Siparişi Tamamla", () => {
    h.order = order("DELIVERED", "buyer", {
      paymentTotals: { confirmed: "1000", pending: "0", remaining: "0" },
    });
    render(<OrderDetailPage />);
    expect(
      screen.getByRole("button", { name: "Siparişi Tamamla" }),
    ).toBeInTheDocument();
  });

  it("DELIVERED + alıcı + ödeme eksik → Tamamla VAR (yaşam döngüsü ayrımı: kabul ödemeden bağımsız)", () => {
    h.order = order("DELIVERED", "buyer", {
      paymentTotals: { confirmed: "0", pending: "0", remaining: "1000" },
    });
    render(<OrderDetailPage />);
    expect(
      screen.getByRole("button", { name: "Siparişi Tamamla" }),
    ).toBeInTheDocument();
  });

  it("DELIVERED + alıcı + bekleyen ödeme → Tamamla yine VAR (ödeme sipariş kabulünü engellemez)", () => {
    h.order = order("DELIVERED", "buyer", {
      paymentTotals: { confirmed: "0", pending: "1000", remaining: "0" },
    });
    render(<OrderDetailPage />);
    expect(
      screen.getByRole("button", { name: "Siparişi Tamamla" }),
    ).toBeInTheDocument();
  });

  it("ACCEPTED + satıcı + bekleyen ödeme → gönderim YOK, ödeme onayı uyarısı", () => {
    h.order = order("ACCEPTED", "seller", {
      paymentTotals: { confirmed: "0", pending: "1000", remaining: "0" },
    });
    render(<OrderDetailPage />);
    expect(
      screen.queryByRole("button", { name: "Siparişi Gönder" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Alıcı ödeme bildirdi/)).toBeInTheDocument();
  });

  it("COMPLETED → tamamlandı mesajı, aksiyon yok", () => {
    h.order = order("COMPLETED", "buyer");
    render(<OrderDetailPage />);
    expect(screen.getByText(/Sipariş tamamlandı/)).toBeInTheDocument();
  });

  it("PENDING + teminat şartlı ilan, satıcı → teminat mektubu uyarısı", () => {
    h.order = order("PENDING", "seller", {
      paymentTiming: "BEFORE_DELIVERY",
      requireGuaranteeLetter: true,
    });
    render(<OrderDetailPage />);
    expect(screen.getByText(/teminat mektubu şartı/)).toBeInTheDocument();
  });

  it("PENDING + teslim öncesi ödeme ama teminat şartsız → uyarı yok (opsiyonel özellik)", () => {
    h.order = order("PENDING", "seller", {
      paymentTiming: "BEFORE_DELIVERY",
      requireGuaranteeLetter: false,
    });
    render(<OrderDetailPage />);
    expect(screen.queryByText(/teminat mektubu şartı/)).not.toBeInTheDocument();
  });

  it("'Kabul Et' → AcceptOrderModal açılır (Siparişi Onayla)", async () => {
    h.order = order("PENDING", "seller");
    render(<OrderDetailPage />);
    await userEvent.click(screen.getByRole("button", { name: "Kabul Et" }));
    expect(
      await screen.findByText("Siparişi Onayla"),
    ).toBeInTheDocument();
  });
});
