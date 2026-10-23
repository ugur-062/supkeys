// @vitest-environment jsdom
/**
 * Admin › Kategoriler — kodla arama (arayüz testi O-048, yeniden doğrulama).
 *  - Boş durum örnekleri GÖRÜNÜR segmentlerden (eski "yazılım"/"43230000"
 *    gizli segment 43'teydi; sayfanın kendi örneği "Sonuç yok" veriyordu).
 *  - Gizli daldaki kod araması "Sonuç yok"un nedenini söyler (API
 *    `hiddenSegment` / `hiddenPrefix`). 2026-10-10: gizleme aile / sınıf
 *    düzeyinde de var (46 görünür, 4610 gizli) — neden DÜZEYİYLE yazılır.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  search: { segments: [] as unknown[], truncated: false } as Record<string, unknown>,
  get: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: vi.fn() }, toastApiError: vi.fn() }));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: { role: "SUPER_ADMIN" } }),
}));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AdminKategorilerPage from "../page";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminKategorilerPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.get.mockReset();
  h.get.mockImplementation(async (url: string) =>
    url === "/categories/search-tree" ? { data: h.search } : { data: [] },
  );
});

describe("Admin Kategoriler — kodla arama (O-048)", () => {
  it("boş durum örnekleri gizli segment 43'ten değil", () => {
    renderPage();
    const hint = screen.getByText(/Aramak için en az 2 karakter/);
    expect(hint.textContent).not.toMatch(/43230000|yazılım/);
    expect(hint.textContent).toMatch(/31171500/);
  });

  it("gizli segmentteki kod: 'Sonuç yok' nedeniyle birlikte", async () => {
    h.search = { segments: [], truncated: false, hiddenSegment: "43" };
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Kategori adı veya kodu ara/), {
      target: { value: "43230000" },
    });
    expect(await screen.findByText(/43 segmenti katalog sadeleştirmesiyle gizli/, {}, { timeout: 2000 })).toBeTruthy();
  });

  it("görünür segmentin gizli ailesi: 'NNNN ailesi gizli' — '46 segmenti gizli' YAZILMAZ", async () => {
    h.search = { segments: [], truncated: false, hiddenSegment: "46", hiddenPrefix: "4610" };
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Kategori adı veya kodu ara/), {
      target: { value: "46101500" },
    });
    expect(await screen.findByText(/4610 ailesi katalog sadeleştirmesiyle gizli/, {}, { timeout: 2000 })).toBeTruthy();
    expect(screen.queryByText(/46 segmenti/)).toBeNull();
  });

  it("eski biçimli yanıt (yalnız hiddenSegment): düzey yazılan koddan bulunur", async () => {
    h.search = { segments: [], truncated: false, hiddenSegment: "46" };
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Kategori adı veya kodu ara/), {
      target: { value: "46182501" },
    });
    expect(await screen.findByText(/461825 sınıfı katalog sadeleştirmesiyle gizli/, {}, { timeout: 2000 })).toBeTruthy();
    expect(screen.queryByText(/46 segmenti/)).toBeNull();
  });

  it("gizli segment bilgisi yoksa düz 'Sonuç yok'", async () => {
    h.search = { segments: [], truncated: false };
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Kategori adı veya kodu ara/), {
      target: { value: "zzqq" },
    });
    expect(await screen.findByText("Sonuç yok", {}, { timeout: 2000 })).toBeTruthy();
  });
});
