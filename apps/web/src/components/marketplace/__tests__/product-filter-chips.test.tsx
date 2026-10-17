// @vitest-environment jsdom
/**
 * AKTİF SÜZGEÇ ÇİPİ — nitelik (derin denetim S078): çip, kenar çubuğuyla
 * aynı okuyucu-dili etiketini basar; URL'deki kanonik değer yalnız yedek.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/urunler", search: "", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.pathname,
}));

import { FilterShell } from "../filter-shell";
import { ActiveFilterChips, ProductFilters } from "../product-filters";
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
    // Grup önekli (arayüz testi D-317): aynı değer başka grupta da olabilir.
    expect(screen.getByText("Malzeme: Stainless steel")).toBeTruthy();
    expect(screen.queryByText(/Paslanmaz celik/)).toBeNull();
    expect(screen.getByText("Malzeme: Aluminyum")).toBeTruthy();
  });
});

describe("ActiveFilterChips — etiketler (arayüz testi D-317)", () => {
  it("facet'te olmayan şehir ham adres değil adıyla; sertifika ve nitelik 'CE' ayırt edilir", () => {
    // Gerçek senaryo (yeniden doğrulama): niteliğin ADI da "Sertifika" —
    // firma sertifikası çipi ayrı önek taşımalı, yoksa iki çip aynı yazılır.
    nav.search = "sehir=istanbul&sertifika=CE&nitelik=sertifika%3ACE";
    render(
      <FilterShell basePath="/urunler" total={0}>
        <ActiveFilterChips
          facets={{
            ...facets,
            attributes: [{ key: "sertifika", nameTr: "Sertifika", unit: null, values: [{ value: "CE", count: 1 }] }],
          }}
        />
      </FilterShell>,
    );
    expect(screen.getByText("İstanbul")).toBeTruthy();
    expect(screen.queryByText("istanbul")).toBeNull();
    expect(screen.getByText("Firma sertifikası: CE")).toBeTruthy();
    expect(screen.getByText("Sertifika: CE")).toBeTruthy();
  });
});

describe("ActiveFilterChips — fiyat aralığı (arayüz testi D-232)", () => {
  it("aralık çipi kaldırılınca 'fiyatsızlar dahil' bayrağı da URL'den gider", () => {
    nav.search = "fiyatMin=10&fiyatMax=50&fiyatsizDahil=1&para=TRY";
    nav.replace.mockClear();
    render(
      <FilterShell basePath="/urunler" total={0}>
        <ActiveFilterChips facets={facets} />
      </FilterShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /10.*50.*süzgecini kaldır/ }));
    expect(nav.replace.mock.calls.at(-1)![0]).toBe("/urunler?para=TRY");
  });
});

describe("ProductFilters — Konum ve Kategori grupları", () => {
  const railFacets: ProductFacets = { ...facets, attributes: [], categories: [{ id: "31000000", name: "Makine", level: 1, count: 3 }] };

  it("arayüz testi D-321: yalnız 'Yakınımda' seçiliyken Konum grubunda sayaç ve Temizle var", () => {
    nav.search = "yakin=istanbul&mesafe=100";
    nav.replace.mockClear();
    render(
      <FilterShell basePath="/urunler" total={0}>
        <ProductFilters facets={railFacets} />
      </FilterShell>,
    );
    // Grup başlığıyla adlanır (arayüz testi D-326); sayaç başlık düğmesinde.
    const group = screen.getByRole("group", { name: "Konum" });
    expect(group.querySelector("button[aria-expanded]")!.textContent).toContain("(1)");
    fireEvent.click(Array.from(group.querySelectorAll("button")).find((b) => b.textContent === "Temizle")!);
    expect(nav.replace.mock.calls.at(-1)![0]).toBe("/urunler");
  });

  it("arayüz testi D-320: listede olmayan seçili kategori satırına tıklayınca seçim kalkar", () => {
    nav.search = "kategori=31160000";
    nav.replace.mockClear();
    render(
      <FilterShell basePath="/urunler" total={0}>
        <ProductFilters facets={railFacets} />
      </FilterShell>,
    );
    const radio = document.getElementById("f-cat-31160000") as HTMLInputElement;
    expect(radio.checked).toBe(true);
    fireEvent.click(radio);
    expect(nav.replace.mock.calls.at(-1)![0]).toBe("/urunler");
  });

  it("arayüz testi D-320: listedeki seçili kategoriye yeniden tıklamak da seçimi kaldırır", () => {
    nav.search = "kategori=31000000";
    nav.replace.mockClear();
    render(
      <FilterShell basePath="/urunler" total={0}>
        <ProductFilters facets={railFacets} />
      </FilterShell>,
    );
    fireEvent.click(document.getElementById("f-cat-31000000")!);
    expect(nav.replace.mock.calls.at(-1)![0]).toBe("/urunler");
  });
});
