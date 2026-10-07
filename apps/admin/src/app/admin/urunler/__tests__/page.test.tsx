// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  bulkApprove: vi.fn(async () => ({ approved: 0, skipped: [] as { id: string; reason: string }[] })),
  products: { data: undefined as unknown, isLoading: false, isError: false },
  lastParams: undefined as unknown,
  role: "SUPPORT" as string,
  toastApiError: vi.fn(),
  search: "",
  replace: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(h.search),
  useRouter: () => ({ replace: h.replace }),
  usePathname: () => "/admin/urunler",
}));
vi.mock("sonner", () => ({ toast: { success: h.toastSuccess, warning: h.toastWarning } }));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: { role: h.role } }),
}));
vi.mock("@/lib/api", () => ({ toastApiError: h.toastApiError }));
vi.mock("@/hooks/use-admin-products", () => ({
  useAdminProducts: (params: unknown) => {
    h.lastParams = params;
    return h.products;
  },
  useAdminProductStats: () => ({ data: { pending: 1, rejected: 3, oldestPendingSince: null } }),
  useBulkApproveProducts: () => ({ mutateAsync: h.bulkApprove, isPending: false, isError: false }),
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
    h.role = "SUPPORT";
    h.bulkApprove.mockReset();
    h.bulkApprove.mockResolvedValue({ approved: 0, skipped: [] });
    h.toastApiError.mockReset();
    h.search = "";
    h.replace.mockReset();
    h.toastSuccess.mockReset();
    h.toastWarning.mockReset();
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

  // Derin denetim LU-12: ürün kararı SUPER_ADMIN+SUPPORT (API 403 verir);
  // SALES kuyruğu yalnız okur.
  it("SALES seçim kutusu ve toplu onay görmez", () => {
    h.role = "SALES";
    render(<AdminUrunlerPage />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByText("Seçilenleri onayla")).not.toBeInTheDocument();
  });

  it("toplu onay reddedilince hata toast'ı basılır, seçim korunur (unhandled rejection yok)", async () => {
    h.bulkApprove.mockRejectedValue(new Error("403"));
    render(<AdminUrunlerPage />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Ürün 1 seç" }));
    fireEvent.click(screen.getByText("Seçilenleri onayla"));
    await waitFor(() => expect(h.toastApiError).toHaveBeenCalled());
    expect(h.bulkApprove).toHaveBeenCalledWith(["1"]);
    expect(screen.getByText("1 ürün seçildi")).toBeInTheDocument();
  });

  // Arayüz testi D-036: geçersiz ?status varsayılana düşer; sekme URL'ye yazılır.
  it("geçersiz ?status varsayılana düşer, geçerli olan okunur; sekme URL'ye yazılır", () => {
    h.search = "status=DRAFT";
    const { unmount } = render(<AdminUrunlerPage />);
    expect((h.lastParams as { status: string }).status).toBe("PENDING");
    unmount();
    h.search = "status=REJECTED";
    render(<AdminUrunlerPage />);
    expect((h.lastParams as { status: string }).status).toBe("REJECTED");
    fireEvent.click(screen.getByRole("tab", { name: /Yayında/ }));
    expect(h.replace).toHaveBeenLastCalledWith("/admin/urunler?status=APPROVED", { scroll: false });
    fireEvent.click(screen.getByRole("tab", { name: /Onay bekleyen/ }));
    expect(h.replace).toHaveBeenLastCalledWith("/admin/urunler", { scroll: false });
  });

  // Gözden geçirme (D-036): sayfa açıkken URL dışarıdan değişirse (kenar menü,
  // geri/ileri) sekme ve sorgu URL'yi izler.
  it("URL dışarıdan değişince sekme ve sorgu URL'yi izler", () => {
    h.search = "status=ALL";
    const { rerender } = render(<AdminUrunlerPage />);
    expect((h.lastParams as { status: string }).status).toBe("ALL");
    expect(screen.getByRole("tab", { name: /Tümü/ })).toHaveAttribute("aria-selected", "true");
    h.search = "";
    rerender(<AdminUrunlerPage />);
    expect((h.lastParams as { status: string }).status).toBe("PENDING");
    expect(screen.getByRole("tab", { name: /Onay bekleyen/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Tümü/ })).toHaveAttribute("aria-selected", "false");
    h.search = "status=REJECTED";
    rerender(<AdminUrunlerPage />);
    expect((h.lastParams as { status: string }).status).toBe("REJECTED");
  });

  // Arayüz testi D-213: arama sonucu boşken "Kuyruk boş" değil.
  it("arama eşleşmeyince 'Eşleşen ürün yok' yazar", () => {
    h.products = { data: { items: [], total: 0, page: 1, pageSize: 25 }, isLoading: false, isError: false };
    render(<AdminUrunlerPage />);
    fireEvent.change(screen.getByPlaceholderText("Ürün ya da firma ara"), { target: { value: "yokboyle" } });
    return waitFor(() => {
      expect(screen.getByText(/Eşleşen ürün yok/)).toBeInTheDocument();
      expect(screen.queryByText(/Kuyruk boş/)).not.toBeInTheDocument();
    });
  });

  // Arayüz testi D-035: başarılı toplu onay geri bildirim verir; atlananlar alert değil toast.
  it("toplu onay başarıda success, atlananlarda uyarı toast'ı basar (window.alert yok)", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    h.bulkApprove.mockResolvedValue({ approved: 1, skipped: [] });
    render(<AdminUrunlerPage />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Ürün 1 seç" }));
    fireEvent.click(screen.getByText("Seçilenleri onayla"));
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledWith("1 ürün onaylandı ve yayına alındı"));

    h.bulkApprove.mockResolvedValue({ approved: 0, skipped: [{ id: "2", reason: "tavan dolu" }] });
    fireEvent.click(screen.getByRole("checkbox", { name: "Ürün 2 seç" }));
    fireEvent.click(screen.getByText("Seçilenleri onayla"));
    await waitFor(() => expect(h.toastWarning).toHaveBeenCalled());
    expect(h.toastWarning.mock.calls[0][1]).toMatchObject({ description: "tavan dolu" });
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  // Arayüz testi D-157: göreli kapak vitrin kökeninde. Ücretsiz dönem: firma
  // satırında üyelik kademesi değil doğrulama durumu yazar.
  it("göreli kapak yolu vitrin kökenine bağlanır; firma satırında doğrulama durumu yazar, üyelik adı yazmaz", () => {
    h.products = {
      data: {
        items: [
          row("1", {
            cover: "/categories/elektrik.webp",
            company: { id: "c1", name: "Acme Metal", slug: "acme", city: "İzmir", tier: "SILVER", effectiveTier: "STANDART", membershipEndAt: "2026-10-01T09:00:00.000Z", verification: "VERIFIED", isBlocked: false },
          }),
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    };
    const { container } = render(<AdminUrunlerPage />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/^https?:\/\/[^/]+\/categories\/elektrik\.webp$/);
    expect(screen.getByText(/İzmir · Doğrulandı/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/standart|silver|gold|süresi doldu/i);
  });
});
