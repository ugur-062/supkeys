// @vitest-environment jsdom
/**
 * MOBİL DENETİM 2026-10 (p04) — pazar yeri süzgeçleri, arama ve sekmeler.
 *
 * jsdom yerleşim yapmaz; dokunma alanı ve sarma kuralları sınıf sözleşmesiyle
 * sabitlenir (ölçümler denetimde 360/390 px tarayıcıda):
 *  · g02-08 / g05 / g08 — süzgeç başlığı, "Temizle", "Tümünü göster",
 *    "Tümünü temizle", hazır fiyat aralıkları ve histogram kovaları görünür
 *    boyutu değiştirmeden büyük dokunma alanı taşır
 *  · g02-02 — aktif süzgeç şeridi yalnız `lg`de yapışkan
 *  · g02-09 — kategori aramasında tek temizle düğmesi
 *  · g02-12 — telefonda kısa yer tutucu
 *  · g02-06 — arama sekmeleri tek satır, sığmazsa kayar
 *  · g02-11 — firma içi ürün araması telefonda satırı doldurur
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(() => Promise.resolve()), replace: vi.fn(() => Promise.resolve()) }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/urunler",
}));

import { FilterChipBar, Group, PriceHistogram, ShowMore } from "../filter-primitives";
import { FilterShell, FilterShellCore } from "../filter-shell";
import { ProductFilters } from "../product-filters";
import { PublicSearchTabs } from "../public-search-tabs";
import { SearchForm } from "../search-form";
import { CompanyProducts } from "../company-products";
import type { ProductFacets, PublicProductPage } from "@/lib/public/marketplace-api";

const cls = (el: Element | null | undefined) => el?.getAttribute("class") ?? "";
const has = (el: Element | null | undefined, token: string) => cls(el).split(/\s+/).includes(token);

type S = { page: number };
function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <FilterShellCore<S> state={{ page: 1 }} toUrl={() => "/urunler"} clearState={(s) => s} total={0} activeCount={0}>
      {children}
    </FilterShellCore>
  );
}

describe("süzgeç dokunma alanları (g02-08, g05, g08)", () => {
  it("grup başlığı ve 'Temizle' görünmez katmanla büyür, aralarında boşluk var", () => {
    render(
      <Shell>
        <Group title="Konum" count={1} onClear={() => {}} storageKey="t-touch">
          <span>içerik</span>
        </Group>
      </Shell>,
    );
    const group = screen.getByRole("group", { name: "Konum" });
    const toggle = within(group).getByRole("button", { expanded: true });
    expect(has(toggle, "relative")).toBe(true);
    expect(has(toggle, "after:absolute")).toBe(true);
    expect(has(toggle, "after:-top-3")).toBe(true);
    const clear = within(group).getByRole("button", { name: "Temizle" });
    expect(has(clear, "relative")).toBe(true);
    expect(has(clear, "after:absolute")).toBe(true);
    // Görünüm sabit: yalnız sözde öğe büyür, düğmeye dolgu eklenmez.
    expect(cls(clear)).not.toMatch(/(^|\s)p[xy]?-\d/);
    // İki alan çakışmasın: yan yana 16 px, sarınca alt satır 16 px aşağıda.
    const header = toggle.parentElement!;
    expect(has(header, "gap-x-4")).toBe(true);
    expect(has(header, "gap-y-4")).toBe(true);
  });

  it("'Tümünü göster (n)' alanı aşağı doğru büyür", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ key: `k${i}`, label: `Seçenek ${i}`, count: 1 }));
    render(
      <Shell>
        <ShowMore items={items} selected={[]} idPrefix="t-more" onToggle={() => {}} />
      </Shell>,
    );
    const more = screen.getByRole("button", { name: "Tümünü göster (8)" });
    expect(has(more, "after:absolute")).toBe(true);
    expect(has(more, "after:-bottom-3")).toBe(true);
  });

  it("histogram kovası tam yükseklikte düğme; renkli çubuk içinde, tıklama aralığı yazar", () => {
    const onPick = vi.fn();
    render(
      <PriceHistogram
        data={{ min: 1, max: 300, buckets: [{ from: 1, to: 100, count: 1 }, { from: 100, to: 200, count: 40 }, { from: 200, to: 300, count: 3 }] }}
        formatPrice={(n) => `${n} ₺`}
        onPick={onPick}
      />,
    );
    const buttons = within(screen.getByRole("group")).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    for (const b of buttons) {
      // Düğmenin kendisi boy almaz (eskiden 3 px'lik hedefti); çubuk içte.
      expect((b as HTMLElement).style.height).toBe("");
      const bar = b.querySelector("[data-hist-bar]") as HTMLElement;
      expect(bar.style.height).toMatch(/%$/);
    }
    expect((buttons[0]!.querySelector("[data-hist-bar]") as HTMLElement).style.height).toBe("6%");
    fireEvent.click(buttons[1]!);
    expect(onPick).toHaveBeenCalledWith(100, 200);
  });

  it("aktif süzgeç şeridi yalnız lg'de yapışkan; telefonda düz beyaz zemin; 'Tümünü temizle' alanı büyük", () => {
    render(
      <Shell>
        <FilterChipBar chips={[{ key: "a", label: "Doğrulanmış", onRemove: () => {} }]} activeCount={1} onClearAll={() => {}} />
      </Shell>,
    );
    const clearAll = screen.getByRole("button", { name: "Tümünü temizle" });
    const bar = clearAll.parentElement!;
    expect(has(bar, "sticky")).toBe(false);
    expect(has(bar, "top-20")).toBe(false);
    expect(has(bar, "lg:sticky")).toBe(true);
    // Ofset kompakt üst çubuğun TAM altı (3.5rem + güvenli alan; 2. tur g02:
    // eski 5rem altında 24 px'lik aralıktan kartlar görünüyordu).
    expect(has(bar, "lg:top-(--topbar-h)")).toBe(true);
    expect(has(bar, "lg:top-[calc(5rem+var(--safe-top))]")).toBe(false);
    // Zemin her genişlikte düz beyaz (yarı saydam zeminden metin okunuyordu).
    expect(has(bar, "bg-white")).toBe(true);
    expect(cls(bar)).not.toMatch(/bg-white\/90|backdrop-blur/);
    // Herkese açık liste şeridi sonuç sütununa yerleştirir ve ızgara boşluğunu
    // bu işaretle ayarlar.
    expect(bar).toHaveAttribute("data-chip-bar");
    expect(has(clearAll, "after:absolute")).toBe(true);
    // Solda çipin × alanı var: katman sola taşmaz.
    expect(has(clearAll, "after:left-0")).toBe(true);
  });

  it("hazır fiyat aralıkları dikeyde büyük alan taşır; sarınca satırlar arası 12 px", () => {
    const facets: ProductFacets = {
      categories: [],
      cities: [],
      activities: [],
      verified: 0,
      price: { has: 3, request: 0 },
      attributes: [],
      certifications: [],
      truncated: false,
      priceHistogram: {
        min: 10,
        max: 1000,
        quantiles: { p33: 50, p66: 200 },
        buckets: [{ from: 10, to: 500, count: 2 }, { from: 500, to: 1000, count: 1 }],
      },
    } as unknown as ProductFacets;
    render(
      <FilterShell basePath="/urunler" total={3}>
        <ProductFilters facets={facets} idPrefix="t" />
      </FilterShell>,
    );
    const preset = screen.getAllByRole("button").find((b) => b.getAttribute("aria-pressed") != null)!;
    expect(preset).toBeDefined();
    expect(has(preset, "after:absolute")).toBe(true);
    expect(has(preset, "after:-inset-y-1.5")).toBe(true);
    expect(has(preset.parentElement, "gap-y-3")).toBe(true);
  });
});

describe("kategori araması — tek temizle düğmesi (g02-09)", () => {
  it("yerel arama iptal düğmesi gizli, kendi düğmemiz 32×32", () => {
    const facets = {
      categories: Array.from({ length: 8 }, (_, i) => ({ id: `3${i}000000`, name: `Kategori ${i}`, level: 1, count: 2 })),
      cities: [],
      activities: [],
      verified: 0,
      price: { has: 0, request: 0 },
      attributes: [],
      certifications: [],
      truncated: false,
    } as unknown as ProductFacets;
    render(
      <FilterShell basePath="/urunler" total={3}>
        <ProductFilters facets={facets} idPrefix="t" />
      </FilterShell>,
    );
    const input = screen.getByRole("searchbox", { name: "Kategori ara" });
    expect(has(input, "[&::-webkit-search-cancel-button]:hidden")).toBe(true);
    fireEvent.change(input, { target: { value: "kağıt" } });
    const clear = screen.getByRole("button", { name: "Aramayı temizle" });
    expect(has(clear, "size-8")).toBe(true);
    fireEvent.click(clear);
    expect((input as HTMLInputElement).value).toBe("");
  });
});

describe("SearchForm — telefonda kısa yer tutucu (g02-12)", () => {
  it("yerel yer tutucu TAM metin; telefonda saydam, yerine kısa metin (aria-hidden) çizilir", () => {
    const { container } = render(
      <SearchForm action="/urunler" placeholder="Ürün, marka veya parça numarası arayın" shortPlaceholder="Ürün veya marka arayın" />,
    );
    const input = screen.getByRole("searchbox", { name: "Pazar yerinde ara" });
    expect(input).toHaveAttribute("placeholder", "Ürün, marka veya parça numarası arayın");
    expect(has(input, "peer")).toBe(true);
    expect(has(input, "max-sm:placeholder:text-transparent")).toBe(true);
    const short = container.querySelector("[data-short-placeholder]")!;
    expect(short.textContent).toBe("Ürün veya marka arayın");
    expect(short.getAttribute("aria-hidden")).toBe("true");
    expect(has(short, "hidden")).toBe(true);
    expect(has(short, "max-sm:peer-placeholder-shown:block")).toBe(true);
    expect(has(short, "pointer-events-none")).toBe(true);
    // Gönder düğmesi telefonda dar dolgu (metin alanına yer kalsın).
    const submit = screen.getByRole("button", { name: "Ara" });
    expect(has(submit, "px-4")).toBe(true);
    expect(has(submit, "sm:px-6")).toBe(true);
  });

  it("kısa metin verilmezse genel kısa yer tutucu", () => {
    const { container } = render(<SearchForm action="/urunler" size="lg" />);
    expect(container.querySelector("[data-short-placeholder]")!.textContent).toBe("Ne arıyorsunuz?");
    expect(has(screen.getByRole("button", { name: "Ara" }), "sm:px-7")).toBe(true);
  });
});

describe("PublicSearchTabs — tek satır (g02-06)", () => {
  it("sekmeler sarmaz, sığmazsa yatay kayar; her sekme daralmaz", () => {
    render(<PublicSearchTabs active="listings" q="boru" counts={{ products: 43, companies: 2, listings: 1 }} />);
    const nav = screen.getByRole("navigation");
    const list = within(nav).getByRole("list");
    expect(has(list, "flex-wrap")).toBe(false);
    expect(has(list, "overflow-x-auto")).toBe(true);
    expect(has(list, "whitespace-nowrap")).toBe(true);
    expect(has(list, "sm:gap-x-6")).toBe(true);
    for (const li of within(list).getAllByRole("listitem")) expect(has(li, "shrink-0")).toBe(true);
    expect(within(list).getByRole("link", { current: "page" })).toHaveTextContent("Alım Talepleri");
  });
});

describe("CompanyProducts — firma içi arama telefonda satırı doldurur (g02-11)", () => {
  it("form tam genişlik, kutu esner; sm'den sonra eski ölçü", async () => {
    const page = {
      items: [{ slug: "u1", name: "Ürün 1", images: [], categoryId: "31000000", unit: "adet", priceMode: "ON_REQUEST" }],
      total: 1,
      page: 1,
      pageSize: 24,
    } as unknown as PublicProductPage;
    render((await CompanyProducts({ companySlug: "demir", page }))!);
    const input = screen.getByRole("searchbox");
    expect(has(input, "flex-1")).toBe(true);
    expect(has(input, "min-w-0")).toBe(true);
    expect(has(input, "w-52")).toBe(false);
    expect(has(input, "sm:w-72")).toBe(true);
    const form = input.closest("form")!;
    expect(has(form, "w-full")).toBe(true);
    expect(has(form, "sm:w-auto")).toBe(true);
  });
});
