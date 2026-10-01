// @vitest-environment jsdom
/**
 * SÜZGEÇ YAPI TAŞLARI ve ARAMA SEKMELERİ — arayüz testi webA-12:
 *  · D-326 grup (fieldset) başlığıyla ADLANDIRILIR
 *  · D-336 facet'ten düşen SEÇİLİ seçenek 0 sayıyla listede kalır
 *  · D-322 çekmece açıkken kırılım geçilince çekmece kapanır (karartma kalmaz)
 *  · D-327 arama yokken sekmelerde sayaç yok
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/urunler",
}));

import { Group, ShowMore } from "../filter-primitives";
import { FilterShellCore, MobileFilterButton } from "../filter-shell";
import { PublicSearchTabs } from "../public-search-tabs";

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
