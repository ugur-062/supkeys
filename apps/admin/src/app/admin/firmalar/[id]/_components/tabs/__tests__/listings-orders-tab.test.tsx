// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  listings: undefined as unknown,
  orders: undefined as unknown,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-admin-inspection", () => ({
  useAdminCompanyListings: () => ({
    data: h.listings,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAdminCompanyOrders: () => ({
    data: h.orders,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { ListingsTab } from "../listings-tab";
import { OrdersTab } from "../orders-tab";

const listing = {
  id: "l1",
  number: "T-1",
  title: "Çelik boru",
  type: "ALIM",
  format: null,
  status: "OPEN",
  visibility: "PUBLIC",
  closesAt: null,
  primaryCurrency: "TRY",
  bidCount: 0,
  invitationCount: 0,
  createdAt: "2026-09-01T10:00:00.000Z",
};

const order = {
  id: "o1",
  number: "S-1",
  status: "PENDING",
  amount: 10,
  currency: "TRY",
  createdAt: "2026-09-01T10:00:00.000Z",
  role: "buyer",
  buyerName: "A",
  sellerName: "B",
  deliveryTerm: null,
};

beforeEach(() => {
  h.listings = undefined;
  h.orders = undefined;
});

describe("İnceleme listeleri — 100 satır kesmesi sessiz değil (derin denetim LU-03)", () => {
  it("ilanlar: truncated ise uyarı görünür, değilse görünmez", () => {
    h.listings = { items: [listing], truncated: true };
    const { unmount } = render(<ListingsTab companyId="c1" />);
    expect(screen.getByText("Çelik boru")).toBeTruthy();
    expect(screen.getByText(/Yalnız en yeni 100 ilan/)).toBeTruthy();
    unmount();

    h.listings = { items: [listing], truncated: false };
    render(<ListingsTab companyId="c1" />);
    expect(screen.queryByText(/Yalnız en yeni 100/)).toBeNull();
  });

  it("siparişler: truncated ise uyarı görünür", () => {
    h.orders = { items: [order], truncated: true };
    render(<OrdersTab companyId="c1" />);
    expect(screen.getByText(/Yalnız en yeni 100 sipariş/)).toBeTruthy();
  });
});
