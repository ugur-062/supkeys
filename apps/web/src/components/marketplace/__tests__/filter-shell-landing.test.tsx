// @vitest-environment jsdom
/**
 * ŞEHİR/ÜLKE AÇILIŞ SAYFASI SÜZGEÇ KABUĞU (2026-09-27 SEO denetimi) —
 * sözleşme: yoldan gelen şehir/ülke durumun parçasıdır; sıralama/görünüm
 * değişince açılış yolunda kalınır (sorgu yoldaki süzgeci TAŞIMAZ), yoldaki
 * değer kaldırılınca ya da genişletilince sorgu şemasına (`/urunler?…`) geçilir.
 */
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/urunler/sehir/istanbul", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => nav.pathname,
}));

import { FilterShell, useFilters } from "../filter-shell";
import type { ProductFilterState } from "@/lib/public/product-filter-params";

let ctx: ReturnType<typeof useFilters<ProductFilterState>> | null = null;
function Probe() {
  ctx = useFilters<ProductFilterState>();
  return null;
}

function lastUrl(): string {
  const calls = [...nav.push.mock.calls, ...nav.replace.mock.calls];
  return calls.at(-1)![0] as string;
}

beforeEach(() => {
  nav.push.mockClear();
  nav.replace.mockClear();
  ctx = null;
});

describe("FilterShell — şehir/ülke açılış sayfası", () => {
  it("şehir yoldan gelir: durumda seçili; sıralama değişince yolda kalınır", () => {
    nav.pathname = "/urunler/sehir/istanbul";
    render(
      <FilterShell basePath="/urunler" fixedCity="istanbul" total={0}>
        <Probe />
      </FilterShell>,
    );
    expect(ctx!.state.cities).toEqual(["istanbul"]);
    act(() => ctx!.update({ sort: "yeni" }));
    expect(lastUrl()).toBe("/urunler/sehir/istanbul?sirala=yeni");
  });

  it("şehir kaldırılınca ya da ikinci şehir eklenince sorgu şemasına geçilir", () => {
    nav.pathname = "/urunler/sehir/istanbul";
    render(
      <FilterShell basePath="/urunler" fixedCity="istanbul" total={0}>
        <Probe />
      </FilterShell>,
    );
    act(() => ctx!.update({ cities: [] }));
    expect(lastUrl()).toBe("/urunler");
    act(() => ctx!.update({ cities: ["istanbul", "bursa"] }));
    expect(lastUrl()).toBe("/urunler?sehir=istanbul%2Cbursa");
  });

  it("ülke sayfası: ülke yolda kalır, ek süzgeç sorguya yazılır", () => {
    nav.pathname = "/urunler/ulke/de-almanya";
    render(
      <FilterShell basePath="/urunler" fixedCountry="DE" total={0}>
        <Probe />
      </FilterShell>,
    );
    expect(ctx!.state.countries).toEqual(["DE"]);
    act(() => ctx!.update({ verified: true }));
    expect(lastUrl()).toBe("/urunler/ulke/de-almanya?dogrulanmis=1");
  });
});
