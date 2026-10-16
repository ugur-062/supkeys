// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingDetail, ListingItemRow } from "@/hooks/use-company-listings";

const h = vi.hoisted(() => ({
  get: vi.fn<(url: string, cfg?: unknown) => Promise<{ data: unknown }>>(),
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
  return {
    id: "l1",
    primaryCurrency: "TRY",
    items,
    itemCount: items.length,
    ...over,
  } as ListingDetail;
}

function renderPanel(
  client?: QueryClient,
  props: Partial<React.ComponentProps<typeof IhaleItemsPanel>> = {},
) {
  const qc =
    client ??
    new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = rtlRender(
    <QueryClientProvider client={qc}>
      <IhaleItemsPanel
        listingId="l1"
        detailHref="/company/ilan/l1?from=x"
        {...props}
      />
    </QueryClientProvider>,
  );
  return { qc, view };
}

beforeEach(() => {
  h.get.mockReset();
});

describe("IhaleItemsPanel", () => {
  it("başlık 'Kalemler (N)' + kolonlar; miktar+birim tek hücrede", async () => {
    h.get.mockResolvedValue({
      data: detail([
        item({
          lineNo: 1,
          name: "Çelik Boru",
          description: "DN50 dikişsiz",
          materialCode: "MLZ-42",
          quantity: "1500",
          unit: "metre",
        }),
        item({ lineNo: 2, name: "Vana", quantity: "25", unit: "adet" }),
      ]),
    });
    renderPanel();

    expect(await screen.findByText("Çelik Boru")).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledWith(
      "/company/listings/l1",
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(screen.getByText("Kalemler (2)")).toBeInTheDocument();
    expect(screen.getByText("DN50 dikişsiz")).toBeInTheDocument();
    expect(screen.getByText("MLZ-42")).toBeInTheDocument();
    // Miktar + birim çoğul/simge kuralıyla (`useQuantityLabel`): metre → "m".
    expect(screen.getByText("1.500 m")).toBeInTheDocument();
    // Hedef fiyat verisi yok (tedarikçi görünümü) → kolon hiç çizilmez.
    expect(screen.queryByText("Hedef Fiyat")).not.toBeInTheDocument();
    expect(screen.queryByText(/daha göster/)).not.toBeInTheDocument();
    expect(screen.queryByText(/detayda gör/)).not.toBeInTheDocument();
  });

  it("mobil denetim g06: telefonda yatay kaydırma yok — Miktar / Hedef fiyat satırın İÇİNDE, sütunları sm'den itibaren", async () => {
    h.get.mockResolvedValue({
      data: detail([item({ name: "Çelik Boru", quantity: "1500", unit: "metre", targetPrice: "1000" })]),
    });
    const { view } = renderPanel();
    expect(await screen.findByText("Çelik Boru")).toBeInTheDocument();
    const table = view.container.querySelector("table")!;
    // 420 px alt sınır yalnız sm'den itibaren (293 px kutuda Miktar ekran dışındaydı).
    expect(table.className).not.toMatch(/(^|\s)min-w-\[420px\]/);
    expect(table.className).toMatch(/sm:min-w-\[420px\]/);
    expect(screen.getByRole("columnheader", { name: "Miktar" }).className).toMatch(/\bhidden\b.*sm:table-cell/);
    // Telefon satırı: ad hücresinde, sm'den itibaren gizli.
    const phoneLine = screen.getByText("Miktar: 1.500 m");
    expect(phoneLine.closest("td")).toBe(screen.getByText("Çelik Boru").closest("td"));
    expect(phoneLine.className).toMatch(/sm:hidden/);
    expect(screen.getByText("Hedef fiyat: 1.000,00 ₺")).toBeInTheDocument();
  });

  it("hedef fiyat verisi geldiyse kolon görünür (sahip / opt-in)", async () => {
    h.get.mockResolvedValue({
      data: detail([
        item({ name: "Vana", targetPrice: "1000" }),
        item({ lineNo: 2 }),
      ]),
    });
    renderPanel();

    expect(await screen.findByText("Hedef Fiyat")).toBeInTheDocument();
    expect(screen.getByText("1.000,00 ₺")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument(); // fiyatsız kalem
  });

  it("6-20 kalem: ilk 5 + 'N-5 kalem daha göster' → hepsi + 'Daha az göster'", async () => {
    const user = userEvent.setup();
    h.get.mockResolvedValue({
      data: detail(
        Array.from({ length: 8 }, (_, i) =>
          item({ lineNo: i + 1, name: `Kalem ${i + 1}` }),
        ),
      ),
    });
    renderPanel();

    expect(await screen.findByText("Kalem 1")).toBeInTheDocument();
    expect(screen.queryByText("Kalem 6")).not.toBeInTheDocument();
    const more = screen.getByRole("button", { name: "3 kalem daha göster" });
    // Mobil denetim 2026-10: telefonda 44 px dokunma satırı, sm'den eski boy.
    expect(more.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["inline-flex", "min-h-11", "sm:inline-block", "sm:min-h-0"]),
    );
    await user.click(more);
    expect(screen.getByText("Kalem 8")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Daha az göster" }));
    expect(screen.queryByText("Kalem 8")).not.toBeInTheDocument();
    // Bu kademede detay linki yok.
    expect(screen.queryByText(/detayda gör/)).not.toBeInTheDocument();
  });

  it(">20 kalem: ilk 5 + detay sayfası Kalemler sekmesine link, inline açma yok", async () => {
    h.get.mockResolvedValue({
      data: detail(
        Array.from({ length: 25 }, (_, i) =>
          item({ lineNo: i + 1, name: `Kalem ${i + 1}` }),
        ),
      ),
    });
    renderPanel();

    expect(await screen.findByText("Kalem 1")).toBeInTheDocument();
    expect(screen.queryByText("Kalem 6")).not.toBeInTheDocument();
    expect(screen.queryByText(/daha göster/)).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Tüm 25 kalemi detayda gör →" });
    // Kalemler detayın varsayılan sekmesi: `tab` eklenmez (`tab=1` = Dosyalar).
    expect(link).toHaveAttribute("href", "/company/ilan/l1?from=x");
    // Mobil denetim 2026-10: telefonda 44 px dokunma satırı, sm'den eski boy.
    expect(link.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["inline-flex", "min-h-11", "sm:inline-block", "sm:min-h-0"]),
    );
  });

  it("kalem yoksa boş durum metni", async () => {
    h.get.mockResolvedValue({ data: detail([]) });
    renderPanel();

    expect(
      await screen.findByText("Bu talepte kalem tanımlanmamış."),
    ).toBeInTheDocument();
  });

  it("hata → kısa mesaj + 'Tekrar dene' yeni istekle kalemleri getirir", async () => {
    const user = userEvent.setup();
    h.get.mockRejectedValueOnce(new Error("network"));
    h.get.mockResolvedValueOnce({ data: detail([item({ name: "Vana" })]) });
    renderPanel();

    expect(await screen.findByText("Kalemler yüklenemedi.")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Tekrar dene" });
    // Görünmeyen dolgu (eksi kenar boşluklu): satır kutusu büyümez, hedef ~30 px.
    expect(retry.className.split(/\s+/)).toEqual(expect.arrayContaining(["inline-block", "-my-1.5", "py-1.5"]));
    await user.click(retry);
    expect(await screen.findByText("Vana")).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it("initialCount: liste verisinden gelen N, fetch beklenmeden başlıkta", async () => {
    h.get.mockReturnValue(new Promise(() => {})); // hiç dönmeyen istek
    renderPanel(undefined, { initialCount: 7 });

    expect(await screen.findByText("Kalemler (7)")).toBeInTheDocument();
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
