// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  products: { data: undefined as unknown, isLoading: false, isError: false },
  lastParams: undefined as unknown,
}));

vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/use-admin-products", () => ({
  useAdminProducts: (params: unknown) => {
    h.lastParams = params;
    return h.products;
  },
  useAdminProductStats: () => ({ data: { pending: 1, rejected: 3, oldestPendingSince: null } }),
}));

import AdminUrunlerPage from "../page";

function row(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name: `Ürün ${id}`,
    slug: `urun-${id}`,
    cover: null,
    imageCount: 2,
    categoryId: "39000000",
    categoryName: "Elektrik Malzemeleri",
    reviewStatus: "PENDING",
    isPublic: false,
    submittedAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    reviewedAt: null,
    reviewedByAdminId: null,
    rejectReason: null,
    updatedAt: new Date().toISOString(),
    company: { id: "c1", name: "Acme Metal", slug: "acme", city: "İzmir", tier: "SILVER", verification: "VERIFIED", isBlocked: false },
    ...over,
  };
}

describe("/admin/urunler — ürün onay kuyruğu", () => {
  beforeEach(() => {
    h.products = { data: { items: [row("1"), row("2", { isPublic: true })], total: 2, page: 1, pageSize: 25 }, isLoading: false, isError: false };
  });

  it("varsayılan sekme onay bekleyen; satırlar, bekleme rozeti ve 'yeniden inceleme' notu", () => {
    render(<AdminUrunlerPage />);
    expect((h.lastParams as { status: string }).status).toBe("PENDING");
    expect(screen.getByText("Ürün 1")).toBeInTheDocument();
    expect(screen.getAllByText("Acme Metal")).toHaveLength(2);
    expect(screen.getAllByText("4 gün")).toHaveLength(2); // SLA rozeti (3+ gün kırmızı)
    expect(screen.getByText("yayında · yeniden inceleme")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "İncele" })[0]).toHaveAttribute("href", "/admin/urunler/1");
    // Sekme sayaçları stats'tan
    expect(screen.getByRole("tab", { name: /Onay bekleyen/ })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /Düzeltme istenen/ })).toHaveTextContent("3");
  });

  it("sekme değişince sorgu parametresi değişir; boş kuyruk metni", () => {
    render(<AdminUrunlerPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Düzeltme istenen/ }));
    expect((h.lastParams as { status: string }).status).toBe("REJECTED");
    h.products = { data: { items: [], total: 0, page: 1, pageSize: 25 }, isLoading: false, isError: false };
    render(<AdminUrunlerPage />);
    expect(screen.getByText(/Kuyruk boş/)).toBeInTheDocument();
  });
});
