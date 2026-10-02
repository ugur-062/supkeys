// @vitest-environment jsdom
/**
 * SÜZGEÇ YAPI TAŞLARI ve ARAMA SEKMELERİ — arayüz testi webA-12:
 *  · D-326 grup (fieldset) başlığıyla ADLANDIRILIR
 *  · D-336 facet'ten düşen SEÇİLİ seçenek 0 sayıyla listede kalır (facet'in
 *    saymadığı yaprak kategori sayısız; boş sertifika facet'inde seçili
 *    sertifika görünür; eski bağlantıdaki ham il adı facet satırını işaretler)
 *  · D-322 çekmece açıkken kırılım geçilince çekmece kapanır (karartma kalmaz)
 *  · D-327 arama yokken sekmelerde sayaç yok
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/urunler",
}));

import { Group, ShowMore } from "../filter-primitives";
import { FilterShell, FilterShellCore, MobileFilterButton } from "../filter-shell";
import { CompanyFilters } from "../company-filters";
import { CompanyFilterShell, ListingFilterShell } from "../list-filter-shells";
import { ListingFilters } from "../listing-filters";
import { ProductFilters } from "../product-filters";
import { PublicSearchTabs } from "../public-search-tabs";
import type { PublicFacets, ProductFacets } from "@/lib/public/marketplace-api";

afterEach(() => {
  nav.search = "";
});

type S = { page: number };
function Shell({ children, drawer }: { children?: React.ReactNode; drawer?: React.ReactNode }) {
  return (
    <FilterShellCore<S> state={{ page: 1 }} toUrl={() => "/urunler"} clearState={(s) => s} total={0} activeCount={0} drawer={drawer}>
      {children}
    </FilterShellCore>
  );
}

describe("Group — erişilebilir ad (D-326)", () => {
  it("fieldset grup başlığıyla adlanır; seçili sayısı adı bozmaz", () => {
    render(
      <Shell>
        <Group title="Kategori" count={2} onClear={() => {}} storageKey="t-cat">
          <span>içerik</span>
        </Group>
      </Shell>,
    );
    expect(screen.getByRole("group", { name: "Kategori" })).toBeInTheDocument();
  });

  it("uzun başlık + sayı + Temizle raydan taşmaz: fieldset min-w-0, satır sarar (arayüz testi webA-05)", () => {
    render(
      <Shell>
        <Group title="Местоположение" count={1} onClear={() => {}} storageKey="t-loc">
          <span>içerik</span>
        </Group>
      </Shell>,
    );
    // jsdom yerleşim yapmaz; sınıflar taşmayı önleyen sözleşmedir:
    // fieldset'in varsayılan min-content genişliği kartı rayın dışına itiyordu.
    const fieldset = screen.getByRole("group", { name: "Местоположение" });
    expect(fieldset.className).toContain("min-w-0");
    const header = fieldset.firstElementChild as HTMLElement;
    expect(header.className).toContain("flex-wrap");
    const clear = within(header).getByRole("button", { name: "Temizle" });
    expect(clear.className).toContain("whitespace-nowrap");
  });
});

describe("ShowMore — facet'te olmayan seçili seçenek (D-336)", () => {
  it("labelFor verilince seçili anahtar 0 sayıyla, işaretli ve kaldırılabilir görünür", () => {
    const onToggle = vi.fn();
    render(
      <Shell>
        <ShowMore items={[]} selected={["istanbul"]} idPrefix="t-city" onToggle={onToggle} labelFor={() => "İstanbul"} />
      </Shell>,
    );
    expect(screen.queryByText("Seçenek yok")).toBeNull();
    const box = screen.getByRole("checkbox", { name: /İstanbul/ }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);
    fireEvent.click(box);
    expect(onToggle).toHaveBeenCalledWith("istanbul", false);
  });

  it("labelFor yoksa davranış değişmez (boş liste metni)", () => {
    render(
      <Shell>
        <ShowMore items={[]} selected={["x"]} idPrefix="t-x" onToggle={() => {}} />
      </Shell>,
    );
    expect(screen.getByText("Seçenek yok")).toBeInTheDocument();
  });
});

const listingFacets: PublicFacets = {
  categories: [{ id: "31000000", name: "Üretim bileşenleri", level: 1, count: 3 }],
  cities: [{ city: "izmir", name: "İzmir", country: "TR", count: 12 }],
  types: [],
  openToAll: 0,
  countries: [],
  selectedCategory: { id: "31161500", name: "Vidalar", level: 3 },
  truncated: false,
};

describe("ListingFilters — facet'in saymadığı seçili kategori (D-336, gözden geçirme)", () => {
  it("segment olmayan seçili kategori sayısız listelenir ('Vidalar 0' yazılmaz)", () => {
    nav.search = "kategori=31161500";
    render(
      <ListingFilterShell total={3} drawer={null}>
        <ListingFilters facets={listingFacets} idPrefix="t" />
      </ListingFilterShell>,
    );
    // Tek seçimli liste görsel olarak kutucuk (ShowMoreRadio → Check).
    const box = screen.getByRole("checkbox", { name: "Vidalar" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.closest("label")!.textContent).toBe("Vidalar");
  });

  it("sonuçsuz kalan seçili SEGMENT 0 sayıyla kalır", () => {
    nav.search = "kategori=42000000";
    render(
      <ListingFilterShell total={0} drawer={null}>
        <ListingFilters facets={{ ...listingFacets, selectedCategory: { id: "42000000", name: "Tıbbi ekipman", level: 1 } }} idPrefix="t" />
      </ListingFilterShell>,
    );
    expect(screen.getByRole("checkbox", { name: /Tıbbi ekipman/ }).closest("label")!.textContent).toBe("Tıbbi ekipman0");
  });
});

describe("Şehir süzgeci — eski bağlantıdaki ham il adı (D-336, gözden geçirme)", () => {
  it("?il=İzmir facet'teki 'İzmir 12' satırını işaretler, '0' kopyası eklenmez", () => {
    nav.search = "il=%C4%B0zmir";
    render(
      <ListingFilterShell total={12} drawer={null}>
        <ListingFilters facets={listingFacets} idPrefix="t" />
      </ListingFilterShell>,
    );
    const boxes = screen.getAllByRole("checkbox", { name: /İzmir/ }) as HTMLInputElement[];
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.checked).toBe(true);
    expect(boxes[0]!.closest("label")!.textContent).toBe("İzmir12");
  });

  it("firma dizininde de ?sehir=İzmir tek satır ve işaretli", () => {
    nav.search = "sehir=%C4%B0zmir";
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}>
        <CompanyFilterShell total={12} drawer={null}>
          <CompanyFilters
            facets={{ total: 12, verified: 0, withProducts: 0, activities: [], cities: [{ city: "izmir", name: "İzmir", country: "TR", count: 12 }] }}
            idPrefix="t"
          />
        </CompanyFilterShell>
      </QueryClientProvider>,
    );
    const boxes = screen.getAllByRole("checkbox", { name: /İzmir/ }) as HTMLInputElement[];
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.checked).toBe(true);
  });
});

describe("Sertifika süzgeci — boş facet'te seçili sertifika (D-336, gözden geçirme)", () => {
  const productFacets: ProductFacets = {
    categories: [],
    cities: [],
    activities: [],
    verified: 0,
    price: { has: 0, request: 0 },
    attributes: [],
    certifications: [],
    truncated: false,
  };

  it("sonuçsuz aramada grup çizilir, seçili sertifika işaretli ve kaldırılabilir", () => {
    nav.search = "q=zzzzqqq&sertifika=ISO%209001";
    render(
      <FilterShell basePath="/urunler" total={0}>
        <ProductFilters facets={productFacets} idPrefix="t" />
      </FilterShell>,
    );
    const group = screen.getByRole("group", { name: "Sertifikalar" });
    // Grup varsayılan kapalı — başlıktan açılır.
    fireEvent.click(within(group).getAllByRole("button")[0]!);
    const box = within(group).getByRole("checkbox", { name: /ISO 9001/ }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);
  });

  it("seçim de facet de yoksa grup çizilmez", () => {
    nav.search = "q=zzzzqqq";
    render(
      <FilterShell basePath="/urunler" total={0}>
        <ProductFilters facets={productFacets} idPrefix="t" />
      </FilterShell>,
    );
    expect(screen.queryByRole("group", { name: "Sertifikalar" })).toBeNull();
  });
});

describe("Mobil süzgeç çekmecesi — kırılım (D-322)", () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it("pencere lg kırılımının üstüne genişleyince çekmece kapanır", async () => {
    let listener: ((e: MediaQueryListEvent) => void) | null = null;
    let matches = false;
    window.matchMedia = ((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      // Yalnız kırılım sorgusu izlenir (başka bileşenler de matchMedia sorar).
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => {
        if (query.includes("min-width")) listener = fn;
      },
      removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => {
        if (listener === fn) listener = null;
      },
    })) as unknown as typeof window.matchMedia;

    render(
      <Shell drawer={<p>çekmece içeriği</p>}>
        <MobileFilterButton />
      </Shell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Süzgeçler/ }));
    expect(await screen.findByText("çekmece içeriği")).toBeInTheDocument();
    expect(listener).not.toBeNull();

    matches = true;
    act(() => listener!({ matches: true } as MediaQueryListEvent));
    await vi.waitFor(() => expect(screen.queryByText("çekmece içeriği")).toBeNull());
  });
});

describe("PublicSearchTabs — sayaç yalnız aramada (D-327)", () => {
  it("arama yokken etkin sekmenin toplamı verilse de rozet çizilmez", () => {
    render(<PublicSearchTabs active="products" counts={{ products: 190 }} />);
    expect(screen.queryByText("190")).toBeNull();
  });

  it("arama varken rozetler çizilir", () => {
    render(<PublicSearchTabs active="products" q="vida" counts={{ products: 190, companies: 4 }} />);
    expect(screen.getByText("190")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
