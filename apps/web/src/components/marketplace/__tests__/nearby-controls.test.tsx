// @vitest-environment jsdom
/**
 * "YAKINIMDA" KUTUSU (derin denetim S078, gözden geçirme) — sözleşme:
 * kullanıcı seçili şehri düzenlerken ("Bursa" → "Burs") süzgeç kalkar ama
 * yazdığı metin SİLİNMEZ. Gerçek `useGeoCityName` ile (mock'suz): adı kendi
 * durumunda tuttuğu için near düştükten bir render sonra '' olur — bu ikinci
 * değişim de kutuyu boşaltmamalı. Dışarıdan kaldırma (bağlantı) kutuyu boşaltır.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/urunler", search: "", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.pathname,
}));
vi.mock("@/lib/public/geo-client", () => ({
  fetchGeoCityClient: vi.fn(async () => null),
  searchGeoCities: vi.fn(async () => []),
}));

import { FilterShell } from "../filter-shell";
import { ProductFilters } from "../product-filters";
import type { ProductFacets } from "@/lib/public/marketplace-api";

const facets: ProductFacets = {
  categories: [],
  cities: [],
  activities: [],
  verified: 0,
  price: { has: 0, request: 0 },
  attributes: [],
  truncated: false,
};

const ui = () => (
  <FilterShell basePath="/urunler" total={0}>
    <ProductFilters facets={facets} idPrefix="t" />
  </FilterShell>
);

const box = () => screen.getByRole("textbox", { name: /Yakınımda/ }) as HTMLInputElement;

// Gerçek Next gibi: süzgeç gezinmesi yeni URL gelene dek BEKLER (kabuk o
// sürede iyimser durumu gösterir — arayüz testi O-014). Test URL'i
// `rerender` ile teslim ederken bekleyen gezinmeyi de bitirir.
const inFlight: Array<() => void> = [];
const deliver = () => inFlight.splice(0).forEach((f) => f());

beforeEach(() => {
  nav.push.mockClear();
  nav.replace.mockReset();
  nav.replace.mockImplementation(() => new Promise<void>((r) => inFlight.push(r)));
  nav.search = "";
});

describe("Yakınımda kutusu", () => {
  it("seçili şehri düzenlemek süzgeci kaldırır ama yazılanı silmez (URL near'sız yeniden çizilse de)", async () => {
    nav.search = "yakin=bursa&mesafe=100";
    const { rerender } = render(ui());
    expect(box().value).toBe("Bursa");
    await act(async () => {
      fireEvent.change(box(), { target: { value: "Burs" } });
    });
    expect(box().value).toBe("Burs");
    // Yönlendirme sonrası URL near'sız gelir.
    nav.search = "";
    await act(async () => {
      rerender(ui());
      deliver();
    });
    expect(box().value).toBe("Burs");
  });

  it("dışarıdan kaldırılınca (bağlantı) kutu boşalır", async () => {
    nav.search = "yakin=bursa&mesafe=100";
    const { rerender } = render(ui());
    expect(box().value).toBe("Bursa");
    nav.search = "";
    await act(async () => {
      rerender(ui());
    });
    expect(box().value).toBe("");
  });
});
