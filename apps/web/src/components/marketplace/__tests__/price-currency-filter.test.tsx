// @vitest-environment jsdom
/**
 * FİYAT SÜZGECİ PARA BİRİMİ (2026-09-27, "kurla çevir") — sözleşme:
 * histogram/ön ayar/etiketler sunucunun çözdüğü birimde (facet `currency`)
 * basılır, sabit "₺" YOK; birim seçilince aralık sıfırlanır ve `para` URL'e
 * yazılır; aralık seçilince birim de AÇIKÇA yazılır (paylaşılan bağlantı
 * başka dilde başka birimde okunmasın).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/urunler", search: "", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.pathname,
}));

import { FilterShell } from "../filter-shell";
import { ProductFilters, presetRanges } from "../product-filters";
import type { ProductFacets } from "@/lib/public/marketplace-api";

const facets = (over: Partial<ProductFacets> = {}): ProductFacets => ({
  categories: [],
  cities: [],
  activities: [],
  verified: 0,
  price: { has: 3, request: 1 },
  attributes: [],
  truncated: false,
  currency: "EUR",
  priceHistogram: {
    min: 10,
    max: 450,
    quantiles: { p33: 20, p66: 100 },
    buckets: [
      { from: 10, to: 50, count: 2 },
      { from: 50, to: 450, count: 1 },
    ],
  },
  ...over,
});

function lastUrl(): string {
  const calls = [...nav.push.mock.calls, ...nav.replace.mock.calls];
  return calls.at(-1)![0] as string;
}

beforeEach(() => {
  nav.push.mockClear();
  nav.replace.mockClear();
  nav.search = "";
});

describe("fiyat süzgeci — para birimi", () => {
  it("ön ayar etiketleri çağıranın biçimleyicisini kullanır (sabit ₺ yok)", () => {
    const tr = presetRanges({ min: 10, max: 450, quantiles: { p33: 20, p66: 100 } }, (n) => `${n} €`);
    expect(tr.map((x) => x.label)).toEqual(["≤ 20 €", "20 € – 100 €", "100 € +"]);
    // İngilizcede sembol önde — biçimleyici dilin kuralını taşır.
    const en = presetRanges({ min: 10, max: 450, quantiles: { p33: 20, p66: 100 } }, (n) => `€${n}`);
    expect(en.map((x) => x.label)).toEqual(["≤ €20", "€20 – €100", "€100 +"]);
  });

  it("sunucunun birimiyle çizer; ön ayar seçimi birimi de URL'e yazar", () => {
    render(
      <FilterShell basePath="/urunler" total={0}>
        <ProductFilters facets={facets()} idPrefix="t" />
      </FilterShell>,
    );
    expect(screen.getByText("Min €")).toBeTruthy();
    // Histogram uçları da sunucunun biriminde.
    expect(screen.getByText("10 €")).toBeTruthy();
    expect(screen.getByText("450 €")).toBeTruthy();
    // Seçici sunucunun çözdüğü birimde açılır.
    expect((screen.getByRole("combobox", { name: /Para birimi/ }) as HTMLSelectElement).value).toBe("EUR");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "≤ 20 €" }));
    });
    const url = lastUrl();
    expect(url).toContain("para=EUR");
    expect(url).toContain("fiyatMax=20");
  });

  it("ilk ön ayar alt sınırsızdır: seçili görünür, debounce ikinci yönlendirme yapmaz, tekrar tıklamak kaldırır", () => {
    vi.useFakeTimers();
    try {
      expect(presetRanges({ min: 10, max: 450, quantiles: { p33: 20, p66: 100 } }, String)[0]!.from).toBeUndefined();
      nav.search = "para=EUR&fiyatMax=20";
      render(
        <FilterShell basePath="/urunler" total={0}>
          <ProductFilters facets={facets()} idPrefix="t" />
        </FilterShell>,
      );
      const chip = screen.getByRole("button", { name: "≤ 20 €" });
      expect(chip.getAttribute("aria-pressed")).toBe("true");
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(nav.push).not.toHaveBeenCalled();
      expect(nav.replace).not.toHaveBeenCalled();
      act(() => {
        fireEvent.click(chip);
      });
      expect(lastUrl()).not.toContain("fiyatMax");
    } finally {
      vi.useRealTimers();
    }
  });

  it("birim değişince aralık sıfırlanır ve yeni birim URL'e yazılır", () => {
    nav.search = "para=EUR&fiyatMin=100&fiyatMax=500";
    render(
      <FilterShell basePath="/urunler" total={0}>
        <ProductFilters facets={facets()} idPrefix="t" />
      </FilterShell>,
    );
    act(() => {
      fireEvent.change(screen.getByRole("combobox", { name: /Para birimi/ }), { target: { value: "USD" } });
    });
    const url = lastUrl();
    expect(url).toContain("para=USD");
    expect(url).not.toContain("fiyatMin");
    expect(url).not.toContain("fiyatMax");
  });
});
