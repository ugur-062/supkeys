// @vitest-environment jsdom
// F7 regresyon nöbetçisi: revizyon paneli — etiket-only üye paneli GÖRÜR
// (salt-okunur gözetim) ama karar/öneri butonlarını GÖRMEZ; işlem rolü görür.
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  roles: [] as string[],
}));

vi.mock("@/hooks/use-company-orders", () => ({
  useProposeRevision: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevisionDecision: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { roles: h.roles } }),
}));

import { OrderRevisionPanel } from "../order-revision-panel";

const PENDING_REV = {
  id: "rev1",
  status: "PENDING" as const,
  amount: "1200",
  note: null,
  rejectReason: null,
  expectedDeliveryDate: null,
  createdAt: new Date().toISOString(),
  items: [],
};

function orderFixture(over: Record<string, unknown> = {}) {
  return {
    id: "o1",
    role: "buyer",
    status: "ACCEPTED",
    currency: "TRY",
    items: [],
    revisions: [PENDING_REV],
    paymentTotals: { confirmed: "0", pending: "0", remaining: "100" },
    paymentCategory: "OPEN_ACCOUNT",
    lcOpenedAt: null,
    expectedDeliveryDate: null,
    ...over,
  } as never;
}

beforeEach(() => {
  h.roles = [];
});

describe("OrderRevisionPanel — rol kapısı", () => {
  it("alıcı yanı etiket-only: panel + revizyon içeriği GÖRÜNÜR, Onayla/Reddet GİZLİ", () => {
    h.roles = ["SAHIP"];
    render(<OrderRevisionPanel order={orderFixture()} />);
    // Salt-okunur gözetim korunur (regresyon nöbetçisi).
    expect(screen.getByText("Sipariş Revizyonu")).toBeInTheDocument();
    expect(screen.getByText("Önerilen revizyon")).toBeInTheDocument();
    // Karar butonları gizli.
    expect(
      screen.queryByRole("button", { name: "Onayla" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reddet" }),
    ).not.toBeInTheDocument();
  });

  it("alıcı yanı Satın Almacı: Onayla/Reddet görünür", () => {
    h.roles = ["SATIN_ALMACI"];
    render(<OrderRevisionPanel order={orderFixture()} />);
    expect(screen.getByRole("button", { name: "Onayla" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reddet" })).toBeInTheDocument();
  });

  it("satıcı yanı: Revizyon Öner yalnız Satışçı'ya; Geri Çek etiket-only'de gizli", () => {
    h.roles = ["YONETICI"];
    render(
      <OrderRevisionPanel order={orderFixture({ role: "seller" })} />,
    );
    expect(
      screen.queryByRole("button", { name: "Revizyon Öner" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Geri Çek" }),
    ).not.toBeInTheDocument();

    h.roles = ["SATISCI"];
    render(
      <OrderRevisionPanel order={orderFixture({ role: "seller" })} />,
    );
    expect(
      screen.getByRole("button", { name: "Geri Çek" }),
    ).toBeInTheDocument();
  });
});
