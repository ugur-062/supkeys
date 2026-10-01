// @vitest-environment jsdom
/**
 * Taleplerim listesi — arayüz testi webB-09:
 *  · O-052: süzgeç/arama adres çubuğunda; detaydan Geri aynı süzgeçle döner.
 *  · O-086: süzgeç sonucu boşken "henüz yok + oluştur" değil "eşleşen yok + temizle".
 *  · D-247: başlıktaki Şablonlar/Raporlar bağlantı içinde düğme değil, tek bağlantı.
 *  · D-152: arama metni tam cümle anahtarı.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenderListItem } from "@/hooks/use-company-tenders";

const h = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/company/satinalma/taleplerim",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/hooks/use-company-tenders", () => ({
  useTenders: () => ({ data: h.rows, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { id: "u1" }, company: { tier: "GOLD" } }),
  useHasCompanyPermission: () => true,
}));
vi.mock("@/components/ihale/IhaleItemsPanel", () => ({
  IhaleItemsPanel: () => <div data-testid="items-panel" />,
}));

import { IhalelerView, parseTendersUrl, writeTendersUrl } from "../ihaleler-view";

const row = (id: string, title: string, status: string) =>
  ({
    id,
    tenderNumber: `ROT-${id}`,
    title,
    type: "ALIM",
    format: null,
    status,
    isInternational: false,
    targetCountries: [],
    categoryIds: [],
    categories: [],
    extraCategoryCount: 0,
    createdById: "u1",
    createdBy: { firstName: "Ada", lastName: "Yılmaz" },
    invitationCount: 0,
    bidCount: 0,
    publishedAt: "2026-09-20T09:00:00.000Z",
    bidsCloseAt: "2026-12-01T09:00:00.000Z",
    createdAt: "2026-09-19T09:00:00.000Z",
  }) as unknown as TenderListItem;

beforeEach(() => {
  h.rows = [row("1", "Çelik boru alımı", "AWARDED"), row("2", "Kablo alımı", "OPEN")];
  window.history.replaceState(null, "", "/company/satinalma/taleplerim");
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("parseTendersUrl / writeTendersUrl (O-052)", () => {
  it("geçersiz değerler varsayılana düşer; varsayılanlar adrese yazılmaz, yabancı parametre korunur", () => {
    const st = parseTendersUrl((k) =>
      new URLSearchParams("status=AWARDED,BOGUS&sort=x&range=30d&scope=open&page=3&q=boru&by=u9").get(k),
    );
    expect(st).toEqual({
      q: "boru",
      status: ["AWARDED"],
      sort: "createdAt:desc",
      range: "30d",
      scope: "open",
      by: "u9",
      page: 3,
    });
    const out = writeTendersUrl(new URLSearchParams("from=kpi"), {
      ...st,
      q: "",
      range: "all",
      scope: "all",
      by: "",
      page: 1,
    });
    expect(out.toString()).toBe("from=kpi&status=AWARDED");
  });
});

describe("IhalelerView", () => {
  it("O-052: adresteki süzgeç ve arama açılışta uygulanır; değişiklik adrese yazılır", async () => {
    window.history.replaceState(null, "", "/company/satinalma/taleplerim?status=AWARDED");
    render(<IhalelerView />);
    expect(screen.getByText("Çelik boru alımı")).toBeInTheDocument();
    expect(screen.queryByText("Kablo alımı")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Satın alma talebi adı veya numarası ara…"), {
      target: { value: "boru" },
    });
    await waitFor(() => expect(window.location.search).toContain("q=boru"));
    expect(window.location.search).toContain("status=AWARDED");
  });

  it("O-086: süzgeç sonucu boşsa 'eşleşen yok' + 'Filtreleri temizle'; oluşturma CTA'sı yok", async () => {
    window.history.replaceState(null, "", "/company/satinalma/taleplerim?q=zzzz");
    render(<IhalelerView />);
    expect(screen.getByText("Eşleşen satın alma talebi yok.")).toBeInTheDocument();
    expect(screen.queryByText("Henüz satın alma talebi yok.")).toBeNull();
    expect(screen.queryByRole("link", { name: /Satın Alma Talebi Aç/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Filtreleri temizle" }));
    expect(screen.getByText("Çelik boru alımı")).toBeInTheDocument();
    expect(screen.getByText("Kablo alımı")).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("veri yokken (süzgeçsiz) 'henüz yok' + oluşturma CTA'sı kalır", () => {
    h.rows = [];
    render(<IhalelerView />);
    expect(screen.getByText("Henüz satın alma talebi yok.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Satın Alma Talebi Aç/ })).toBeInTheDocument();
  });

  it("O-086: hiç talep yokken KPI drill-down (?status=OPEN) 'eşleşen yok' değil oluşturma CTA'sı gösterir", () => {
    h.rows = [];
    window.history.replaceState(null, "", "/company/satinalma/taleplerim?status=OPEN,IN_AWARD");
    render(<IhalelerView />);
    expect(screen.getByText("Henüz satın alma talebi yok.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Satın Alma Talebi Aç/ })).toBeInTheDocument();
    expect(screen.queryByText("Eşleşen satın alma talebi yok.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Filtreleri temizle" })).toBeNull();
  });

  it("D-247: Şablonlar ve Raporlar tek bağlantı (içinde düğme yok)", () => {
    render(<IhalelerView />);
    for (const name of ["Şablonlar", "Raporlar"]) {
      const link = screen.getByRole("link", { name });
      expect(link.querySelector("button")).toBeNull();
    }
  });
});
