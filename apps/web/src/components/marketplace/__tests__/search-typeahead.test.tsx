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
    await waitFor(() => expect(h.suggest).toHaveBeenCalledWith("boru", "listings"));
  });

  it("öneri grupları: kategori · ürün (firma adıyla) · firma", async () => {
    const u = userEvent.setup();
    render(<SearchTypeahead />);
    await u.type(screen.getByRole("combobox", { name: /içinde ara/ }), "pano");
    expect(await screen.findByText("Panolar")).toBeTruthy();
    expect(screen.getByText("Dağıtım panosu")).toBeTruthy();
    expect(screen.getAllByText("Elektrik A.Ş.").length).toBeGreaterThan(0);
  });

  it("↑↓ ile gezinir, Enter seçili öneriye gider", async () => {
    const u = userEvent.setup();
    render(<SearchTypeahead />);
    await u.type(screen.getByRole("combobox", { name: /içinde ara/ }), "pano");
    await screen.findByText("Panolar");
    await u.keyboard("{ArrowDown}{Enter}");
    expect(h.push).toHaveBeenCalledWith(expect.stringContaining("/urunler/kategori/39120000"));
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
