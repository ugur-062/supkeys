// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  push: vi.fn(),
  suggest: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@/lib/public/suggest-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/public/suggest-client")>(
    "@/lib/public/suggest-client",
  );
  return { ...actual, fetchSuggest: h.suggest };
});

import { SearchTypeahead } from "../search-typeahead";

/**
 * ARAMA + ÖNERİ SÖZLEŞMESİ (PROMPT 6): kapsam formun hedefini VE sorgunun
 * kapsamını birlikte değiştirir; JS'siz form yine GET yapar; klavye gezinir;
 * son aramalar bu tarayıcıda kalır.
 */
const RESULT = {
  products: [
    { name: "Dağıtım panosu", slug: "pano", companySlug: "elektrik-as", companyName: "Elektrik A.Ş.", image: null },
  ],
  categories: [{ id: "39120000", name: "Panolar", level: 2 }],
  companies: [{ name: "Elektrik A.Ş.", slug: "elektrik-as", city: "İzmir", logoUrl: null }],
  listings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.suggest.mockResolvedValue(RESULT);
  window.localStorage.clear();
});

describe("SearchTypeahead", () => {
  it("JS'siz de çalışır: form kapsamın liste sayfasına GET ile gider", () => {
    const { container } = render(<SearchTypeahead />);
    const form = container.querySelector("form");
    expect(form?.getAttribute("action")).toBe("/urunler");
    expect(form?.getAttribute("method")).toBe("get");
    expect(container.querySelector('input[name="q"]')).toBeTruthy();
  });

  it("kapsam değişince hem hedef hem sorgu kapsamı değişir", async () => {
    const u = userEvent.setup();
    const { container } = render(<SearchTypeahead />);
    await u.selectOptions(screen.getByLabelText("Arama kapsamı"), "listings");
    expect(container.querySelector("form")?.getAttribute("action")).toBe("/alim-talepleri");
    await u.type(screen.getByRole("combobox", { name: /içinde ara/ }), "boru");
    await waitFor(() => expect(h.suggest).toHaveBeenCalledWith("boru", "listings", "tr"));
  });

  it("öneri grupları: kategori · ürün (firma adıyla) · firma", async () => {
    const u = userEvent.setup();
    render(<SearchTypeahead />);
    await u.type(screen.getByRole("combobox", { name: /içinde ara/ }), "pano");
    expect(await screen.findByText("Panolar")).toBeTruthy();
    expect(screen.getByText("Dağıtım panosu")).toBeTruthy();
    expect(screen.getAllByText("Elektrik A.Ş.").length).toBeGreaterThan(0);
  });

  // 2026-10-09 (sahip kararı): arama kutusu kataloğu SUNAN yüzeydir — gizli
  // kategori (API önerisinde gelse bile) öneri satırı olmaz. 2026-10-10: 46
  // görünür sektördür; gizli olan silah / kolluk aileleri (4610) ve görünür
  // 4618 ailesinin 461825 sınıfıdır.
  it("gizli kategori önerilmez; görünür kategori (46'nın görünür dalı dahil) önerilir", async () => {
    h.suggest.mockResolvedValue({
      ...RESULT,
      categories: [
        { id: "46101500", name: "Ateşli silahlar", level: 3 },
        { id: "39120000", name: "Panolar", level: 2 },
        { id: "92000000", name: "Kamu Düzeni ve Güvenlik Hizmetleri", level: 1, slug: "kamu-duzeni-ve-guvenlik-hizmetleri" },
        { id: "46182500", name: "Kişisel güvenlik cihazları veya silahları", level: 3 },
        { id: "46181500", name: "Koruyucu giysi", level: 3 },
        { id: "46000000", name: "İş Güvenliği ve Yangın Ekipmanları", level: 1, slug: "is-guvenligi-ve-yangin-ekipmanlari" },
      ],
    });
    const u = userEvent.setup();
    const { container } = render(<SearchTypeahead />);
    await u.type(screen.getByRole("combobox", { name: /içinde ara/ }), "pano");
    expect(await screen.findByText("Panolar")).toBeTruthy();
    expect(screen.queryByText(/silah|Kamu Düzeni/)).toBeNull();
    expect(container.querySelector('a[href*="92000000"]')).toBeNull();
    expect(container.querySelector('a[href*="kategori=4610"], a[href*="kategori=461825"]')).toBeNull();
    // 46 geri açıldı: sektör açılış sayfasına, görünür sınıfı süzgeçli dizine gider.
    expect(screen.getByText("Koruyucu giysi")).toBeTruthy();
    expect(screen.getByText("İş Güvenliği ve Yangın Ekipmanları")).toBeTruthy();
    expect(container.querySelector('a[href*="/urunler/kategori/46000000-is-guvenligi-ve-yangin-ekipmanlari"]')).not.toBeNull();
    expect(container.querySelector('a[href*="kategori=46181500"]')).not.toBeNull();
  });

  it("↑↓ ile gezinir, Enter seçili öneriye gider", async () => {
    const u = userEvent.setup();
    render(<SearchTypeahead />);
    await u.type(screen.getByRole("combobox", { name: /içinde ara/ }), "pano");
    await screen.findByText("Panolar");
    await u.keyboard("{ArrowDown}{Enter}");
    expect(h.push).toHaveBeenCalledWith(expect.stringContaining("/urunler?kategori=39120000"));
  });

  it("son aramalar yazılır ve boş kutuda gösterilir", async () => {
    const u = userEvent.setup();
    const { unmount } = render(<SearchTypeahead />);
    await u.type(screen.getByRole("combobox", { name: /içinde ara/ }), "pano");
    await screen.findByText("Panolar");
    await u.keyboard("{ArrowDown}{Enter}");
    unmount();

    render(<SearchTypeahead />);
    await u.click(screen.getByRole("combobox", { name: /içinde ara/ }));
    expect(await screen.findByText("Son aramalar")).toBeTruthy();
    expect(screen.getByText("pano")).toBeTruthy();
  });

  it("iki karakterden kısa sorguda uca gidilmez", async () => {
    const u = userEvent.setup();
    render(<SearchTypeahead />);
    await u.type(screen.getByRole("combobox", { name: /içinde ara/ }), "p");
    await new Promise((r) => setTimeout(r, 350));
    expect(h.suggest).not.toHaveBeenCalled();
  });
});
