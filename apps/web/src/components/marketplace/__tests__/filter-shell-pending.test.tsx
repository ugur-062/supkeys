// @vitest-environment jsdom
/**
 * SÜZGEÇ KABUĞU — bekleyen durum (arayüz testi O-014) ve sistem değişimi
 * (D-318). Gerçek Next'te `router.push` geçişi sunucu yanıtı gelene dek
 * BEKLER ve URL eski kalır; sahte yönlendirici bunu çözülmeyen bir söz
 * döndürerek taklit eder (React 19 dönen sözü bekler, `isPending` açık kalır).
 */
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/urunler",
}));

import { FilterShell, useFilters } from "../filter-shell";
import { ViewPreferenceSync } from "../product-filters";
import type { ProductFilterState } from "@/lib/public/product-filter-params";

let ctx: ReturnType<typeof useFilters<ProductFilterState>> | null = null;
function Probe() {
  ctx = useFilters<ProductFilterState>();
  return null;
}

beforeEach(() => {
  nav.search = "";
  nav.push.mockReset();
  nav.replace.mockReset();
  ctx = null;
  try {
    window.localStorage.clear();
  } catch {
    /* depolama yok */
  }
});

describe("FilterShell — art arda süzgeç tıklamaları (O-014)", () => {
  it("ilk gezinme bitmeden gelen ikinci tık ilk seçimi KORUR", async () => {
    // Gezinme test sonuna dek bitmiyor: URL (ve useSearchParams) eski kalır.
    // Söz sonunda ÇÖZÜLÜR — React bekleyen eylem sözlerini dolaştırır, açık
    // kalan söz sonraki testlerin geçişlerini de bekletirdi.
    const finishers: Array<() => void> = [];
    nav.push.mockImplementation(() => new Promise<void>((r) => finishers.push(r)));
    render(
      <FilterShell basePath="/urunler" total={0} pushFilters>
        <Probe />
      </FilterShell>,
    );
    const toggle = (a: string) =>
      act(() => ctx!.update((s) => ({ ...s, activities: [...s.activities, a] })));
    toggle("MANUFACTURER");
    // Kutucuk beklerken de işaretli görünür (iyimser durum).
    expect(ctx!.state.activities).toEqual(["MANUFACTURER"]);
    toggle("DISTRIBUTOR");
    expect(nav.push.mock.calls.at(-1)![0]).toBe("/urunler?faaliyet=MANUFACTURER%2CDISTRIBUTOR");
    expect(ctx!.isPending).toBe(true);
    await act(async () => finishers.forEach((f) => f()));
  });

  it("gezinme bitince yeniden URL kaynak olur (bekleyen durum düşer)", async () => {
    let finish: () => void = () => {};
    nav.push.mockImplementation(() => new Promise<void>((r) => (finish = r)));
    render(
      <FilterShell basePath="/urunler" total={0} pushFilters>
        <Probe />
      </FilterShell>,
    );
    act(() => ctx!.update({ verified: true }));
    expect(ctx!.state.verified).toBe(true);
    // Sunucu yanıtı geldi ama URL değişmedi (ör. gezinme başka yerde sonlandı).
    await act(async () => finish());
    expect(ctx!.isPending).toBe(false);
    expect(ctx!.state.verified).toBe(false);
    act(() => ctx!.update({ fastReply: true }));
    expect(nav.push.mock.calls.at(-1)![0]).toBe("/urunler?hizli=1");
  });
});

describe("ViewPreferenceSync (D-318)", () => {
  it("kayıtlı liste tercihini URL'e GEÇMİŞE yazmadan taşır", () => {
    window.localStorage.setItem("rothern.market.view", "liste");
    render(
      <FilterShell basePath="/urunler" total={0} pushFilters>
        <ViewPreferenceSync />
      </FilterShell>,
    );
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith("/urunler?gorunum=liste", { scroll: false });
  });

  it("mevcut sorgu korunur; URL'de görünüm varsa tercih uygulanmaz", () => {
    window.localStorage.setItem("rothern.market.view", "liste");
    nav.search = "sirala=yeni";
    render(
      <FilterShell basePath="/urunler" total={0} pushFilters>
        <ViewPreferenceSync />
      </FilterShell>,
    );
    expect(nav.replace).toHaveBeenCalledWith("/urunler?sirala=yeni&gorunum=liste", { scroll: false });
    nav.replace.mockReset();
    nav.search = "gorunum=liste";
    render(
      <FilterShell basePath="/urunler" total={0} pushFilters>
        <ViewPreferenceSync />
      </FilterShell>,
    );
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
