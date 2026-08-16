// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingDetail, ListingItemRow } from "@/hooks/use-company-listings";

const h = vi.hoisted(() => ({
  get: vi.fn<(url: string) => Promise<{ data: unknown }>>(),
}));

vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get },
}));

import { IhaleItemsPanel } from "../IhaleItemsPanel";

function item(over: Partial<ListingItemRow> = {}): ListingItemRow {
  return {
    id: `i${Math.random().toString(36).slice(2, 8)}`,
    lineNo: 1,
    name: "Çelik Boru",
    description: null,
    quantity: "10",
    unit: "adet",
    targetPrice: null,
    materialCode: null,
    requiredByDate: null,
    ...over,
  };
}

function detail(items: ListingItemRow[], over: Partial<ListingDetail> = {}) {
  return { id: "l1", items, itemCount: items.length, ...over } as ListingDetail;
}

function renderPanel(client?: QueryClient) {
  const qc =
    client ??
    new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = rtlRender(
    <QueryClientProvider client={qc}>
      <IhaleItemsPanel listingId="l1" detailHref="/company/ilan/l1" />
    </QueryClientProvider>,
  );
  return { qc, view };
}

beforeEach(() => {
  h.get.mockReset();
});

describe("IhaleItemsPanel", () => {
  it("kalemleri kolonlarıyla basar; termin yalnız veri varsa görünür", async () => {
    h.get.mockResolvedValue({
      data: detail([
        item({
          lineNo: 1,
          name: "Çelik Boru",
          description: "DN50 dikişsiz",
          materialCode: "MLZ-42",
          quantity: "1500",
          unit: "metre",
          requiredByDate: "2026-09-10T00:00:00.000Z",
        }),
        item({ lineNo: 2, name: "Vana", quantity: "25", unit: "adet" }),
      ]),
    });
    renderPanel();

    expect(await screen.findByText("Çelik Boru")).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledWith("/company/listings/l1");
    expect(screen.getByText("DN50 dikişsiz")).toBeInTheDocument();
    expect(screen.getByText("MLZ-42")).toBeInTheDocument();
    expect(screen.getByText("1.500")).toBeInTheDocument();
    expect(screen.getByText("metre")).toBeInTheDocument();
    expect(screen.getByText("Termin")).toBeInTheDocument();
    expect(screen.getByText("10 Eyl 2026")).toBeInTheDocument();
    // 5'ten az kalem → "Tümünü gör" yok.
    expect(screen.queryByText(/Tümünü gör/)).not.toBeInTheDocument();
  });

  it("5'ten çok kalemde ilk 5 + detay sayfasına 'Tümünü gör (N kalem)' linki", async () => {
    h.get.mockResolvedValue({
      data: detail(
        Array.from({ length: 8 }, (_, i) =>
          item({ lineNo: i + 1, name: `Kalem ${i + 1}` }),
        ),
      ),
    });
    renderPanel();

    expect(await screen.findByText("Kalem 1")).toBeInTheDocument();
    expect(screen.getByText("Kalem 5")).toBeInTheDocument();
    expect(screen.queryByText("Kalem 6")).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Tümünü gör (8 kalem)" });
    expect(link).toHaveAttribute("href", "/company/ilan/l1");
  });

  it("kalem yoksa boş durum metni", async () => {
    h.get.mockResolvedValue({ data: detail([]) });
    renderPanel();

    expect(
      await screen.findByText("Bu ihalede kalem bulunmuyor."),
    ).toBeInTheDocument();
  });

  it("hata → kısa mesaj + 'Tekrar dene' yeni istekle kalemleri getirir", async () => {
    const user = userEvent.setup();
    h.get.mockRejectedValueOnce(new Error("network"));
    h.get.mockResolvedValueOnce({ data: detail([item({ name: "Vana" })]) });
    renderPanel();

    expect(await screen.findByText("Kalemler yüklenemedi.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(await screen.findByText("Vana")).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it("cache: panel kapanıp yeniden açılınca (remount) ikinci istek atılmaz", async () => {
    h.get.mockResolvedValue({ data: detail([item({ name: "Vana" })]) });
    const { qc, view } = renderPanel();

    expect(await screen.findByText("Vana")).toBeInTheDocument();
    view.unmount();
    renderPanel(qc);
    expect(await screen.findByText("Vana")).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledTimes(1);
  });
});
