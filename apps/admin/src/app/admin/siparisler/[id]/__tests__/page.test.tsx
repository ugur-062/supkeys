// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Derin denetim LU-12: iptal düğmesi (a) SUPPORT'a (API SUPER_ADMIN+SALES,
 * 403) ve (b) onaylı ödemesi olan siparişte (API her seferinde 400) de
 * çiziliyordu; dialog "iade gerekebilir" diyerek iptalin gerçekleşeceği
 * izlenimini veriyordu.
 */
const h = vi.hoisted(() => ({
  role: "SALES" as string,
  order: undefined as unknown,
  search: "",
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "o1" }),
  useSearchParams: () => new URLSearchParams(h.search),
}));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: { role: h.role } }),
}));
vi.mock("@/hooks/use-admin-inspection", () => ({
  useAdminOrderDetail: () => ({ data: h.order, isLoading: false, isError: false, refetch: vi.fn() }),
  useCancelOrder: () => ({ mutate: vi.fn(), isPending: false }),
}));

import AdminOrderPage from "../page";

function order(payments: { status: string; amount: number }[] = []) {
  const confirmed = payments
    .filter((p) => p.status === "CONFIRMED")
    .reduce((s, p) => s + p.amount, 0);
  return {
    id: "o1",
    number: "ORD-2026-0001",
    status: "ACCEPTED",
    amount: 10000,
    paymentConfirmed: confirmed.toFixed(2),
    currency: "TRY",
    paymentTiming: "ON_DELIVERY",
    paymentCategory: null,
    advancePercent: null,
    paymentDays: null,
    lcType: null,
    lcConfirmed: false,
    paymentNote: null,
    deliveryTerm: null,
    requireGuaranteeLetter: false,
    cancelReason: null,
    rejectedReason: null,
    acceptedAt: null,
    expectedDeliveryDate: null,
    invoiceNumber: null,
    deliveryStartedAt: null,
    deliveredAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: "2026-09-20T10:00:00.000Z",
    buyer: { id: "b1", name: "Alıcı A.Ş.", rothernId: null },
    seller: { id: "s1", name: "Satıcı A.Ş.", rothernId: null },
    listing: null,
    items: [],
    payments: payments.map((p, i) => ({
      id: `p${i}`,
      amount: p.amount,
      method: null,
      status: p.status,
      rejectReason: null,
      confirmedAt: null,
      createdAt: "2026-09-21T10:00:00.000Z",
    })),
  };
}

beforeEach(() => {
  h.role = "SALES";
  h.order = order();
  h.search = "";
});

describe("/admin/siparisler/[id] — iptal düğmesi", () => {
  it("SALES + onaylı ödeme yok → düğme görünür", () => {
    render(<AdminOrderPage />);
    expect(screen.getByRole("button", { name: "Siparişi İptal Et" })).toBeInTheDocument();
  });

  it("SUPPORT düğmeyi görmez (API 403)", () => {
    h.role = "SUPPORT";
    render(<AdminOrderPage />);
    expect(screen.queryByRole("button", { name: "Siparişi İptal Et" })).not.toBeInTheDocument();
  });

  it("onaylı ödeme varsa düğme yerine 'iptal edilemez' notu (API her seferinde 400)", () => {
    h.order = order([
      { status: "CONFIRMED", amount: 5000 },
      { status: "PENDING", amount: 5000 },
    ]);
    render(<AdminOrderPage />);
    expect(screen.queryByRole("button", { name: "Siparişi İptal Et" })).not.toBeInTheDocument();
    expect(screen.getByText(/Onaylı ödeme var — sipariş iptal edilemez/)).toBeInTheDocument();
  });

  it("yalnız bekleyen/reddedilen ödeme iptali engellemez", () => {
    h.order = order([
      { status: "PENDING", amount: 5000 },
      { status: "REJECTED", amount: 5000 },
    ]);
    render(<AdminOrderPage />);
    expect(screen.getByRole("button", { name: "Siparişi İptal Et" })).toBeInTheDocument();
  });
});

// Arayüz testi D-217: "← Siparişler" her zaman alıcı firmaya gidiyordu.
describe("/admin/siparisler/[id] — geri bağlantısı gelinen yere döner", () => {
  const backLink = () => screen.getByRole("link", { name: /Siparişler|ROT-/ });

  it("varsayılan ve alıcıdan gelişte alıcı firmanın siparişleri", () => {
    render(<AdminOrderPage />);
    expect(backLink()).toHaveAttribute("href", "/admin/firmalar/b1?tab=siparisler");
    expect(backLink()).toHaveTextContent("Alıcı A.Ş. · Siparişler");
  });

  it("satıcı firmadan gelişte satıcının siparişleri", () => {
    h.search = "from=s1";
    render(<AdminOrderPage />);
    expect(backLink()).toHaveAttribute("href", "/admin/firmalar/s1?tab=siparisler");
    expect(backLink()).toHaveTextContent("Satıcı A.Ş. · Siparişler");
  });

  it("ilandan gelişte ilana döner", () => {
    h.search = "from=listing";
    h.order = { ...order(), listing: { id: "l1", title: "Çelik boru", number: "ROT-000001" } };
    render(<AdminOrderPage />);
    const back = screen.getAllByRole("link").find((a) => a.textContent === " ROT-000001" || a.textContent?.trim() === "ROT-000001");
    expect(back).toHaveAttribute("href", "/admin/ilanlar/l1");
  });
});
