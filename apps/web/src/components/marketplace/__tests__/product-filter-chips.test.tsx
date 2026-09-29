// @vitest-environment jsdom
/**
 * AKTİF SÜZGEÇ ÇİPİ — nitelik (derin denetim S078): çip, kenar çubuğuyla
 * aynı okuyucu-dili etiketini basar; URL'deki kanonik değer yalnız yedek.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/urunler", search: "", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.pathname,
}));

import { FilterShell } from "../filter-shell";
import { ActiveFilterChips } from "../product-filters";
import type { ProductFacets } from "@/lib/public/marketplace-api";

const facets: ProductFacets = {
  categories: [],
  cities: [],
  activities: [],
  verified: 0,
  price: { has: 0, request: 0 },
  attributes: [
    {
      key: "malzeme",
      nameTr: "Malzeme",
      unit: null,
      values: [
        { value: "Paslanmaz celik", label: "Stainless steel", count: 2 },
        { value: "Aluminyum", count: 1 },
      ],
    },
  ],
  truncated: false,
};

describe("ActiveFilterChips — nitelik", () => {
  it("facet etiketini basar, etiket yoksa kanonik değere düşer", () => {
    nav.search = "nitelik=malzeme%3APaslanmaz%20celik&nitelik=malzeme%3AAluminyum";
    render(
      <FilterShell basePath="/urunler" total={0}>
        <ActiveFilterChips facets={facets} />
      </FilterShell>,
    );
    expect(screen.getByText("Stainless steel")).toBeTruthy();
    expect(screen.queryByText("Paslanmaz celik")).toBeNull();
    expect(screen.getByText("Aluminyum")).toBeTruthy();
  });
});
