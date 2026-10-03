// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Derin denetim S084: arama değişince önceki aramada işaretlenen kalemler
 * eklenirken düşmemeli — düğmedeki sayı ile eklenen kalem sayısı aynı olmalı.
 */
const h = vi.hoisted(() => ({ markUsed: vi.fn() }));

const item = (id: string, name: string) => ({
  id,
  code: `K-${id}`,
  name,
  description: null,
  specification: null,
  unit: "adet",
  unitCode: "PCE",
  categoryId: null,
  brand: null,
  mpn: null,
  targetPrice: null,
  isActive: true,
  usageCount: 0,
  lastUsedAt: null,
  isPublic: false,
  publishedAt: null,
  reviewStatus: "DRAFT",
  rejectReason: null,
  thumbnailUrl: null,
  priceMode: "ON_REQUEST",
});

const CATALOG: Record<string, ReturnType<typeof item>[]> = {
  vida: [item("v1", "Vida M6"), item("v2", "Vida M8")],
  somun: [item("s1", "Somun M6")],
};

vi.mock("@/hooks/use-debounced-value", () => ({ useDebouncedValue: <T,>(v: T) => v }));
vi.mock("@/hooks/use-company-items", () => ({
  useCatalogItems: (q: string) => ({ data: { items: CATALOG[q] ?? [], truncated: false } }),
  useMarkCatalogUsed: () => ({ mutate: h.markUsed }),
}));

import { CatalogPickerDialog } from "../catalog-picker-dialog";

beforeEach(() => h.markUsed.mockReset());

describe("CatalogPickerDialog", () => {
  it("farklı aramalarda seçilen kalemlerin hepsi eklenir, miktarlarıyla", () => {
    const onPick = vi.fn();
    render(<CatalogPickerDialog open onClose={() => undefined} onPick={onPick} />);
    const search = screen.getByRole("textbox", { name: "Katalogda ara" });

    fireEvent.change(search, { target: { value: "vida" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Vida M6 seç" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Vida M8 seç" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Vida M8 miktarı" }), { target: { value: "25" } });

    fireEvent.change(search, { target: { value: "somun" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Somun M6 seç" }));

    fireEvent.click(screen.getByRole("button", { name: "3 kalemi ekle" }));
    expect(onPick).toHaveBeenCalledTimes(1);
    const picked = onPick.mock.calls[0][0] as { catalogId: string; quantity: number }[];
    expect(picked.map((p) => p.catalogId).sort()).toEqual(["s1", "v1", "v2"]);
    expect(picked.find((p) => p.catalogId === "v2")?.quantity).toBe(25);
    expect(h.markUsed).toHaveBeenCalledWith(expect.arrayContaining(["v1", "v2", "s1"]));
  });

  it("D-242: miktar alanı boşaltılınca kalem 0 ile eklenmez — alandan çıkınca ve eklerken 1 olur", () => {
    const onPick = vi.fn();
    render(<CatalogPickerDialog open onClose={() => undefined} onPick={onPick} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Katalogda ara" }), { target: { value: "vida" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Vida M6 seç" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Vida M8 seç" }));
    const q6 = screen.getByRole("textbox", { name: "Vida M6 miktarı" });
    fireEvent.change(q6, { target: { value: "" } });
    fireEvent.blur(q6);
    expect(q6).toHaveValue("1");
    // Alandan çıkmadan doğrudan "Ekle" de 0 göndermez.
    fireEvent.change(screen.getByRole("textbox", { name: "Vida M8 miktarı" }), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "2 kalemi ekle" }));
    const picked = onPick.mock.calls[0][0] as { catalogId: string; quantity: number }[];
    expect(picked.every((p) => p.quantity === 1)).toBe(true);
  });

  it.each([
    ["2.5", 2.5],
    ["2,5", 2.5],
    ["1.500", 1500],
  ])(
    "arayüz testi son tur S-BUY: Türkçe arayüzde '%s' yazmak %s'dir (alan 0'a sıfırlanmaz)",
    async (typed, expected) => {
      const user = userEvent.setup();
      const onPick = vi.fn();
      render(<CatalogPickerDialog open onClose={() => undefined} onPick={onPick} />);
      fireEvent.change(screen.getByRole("textbox", { name: "Katalogda ara" }), { target: { value: "vida" } });
      fireEvent.click(screen.getByRole("checkbox", { name: "Vida M6 seç" }));
      const q = screen.getByRole("textbox", { name: "Vida M6 miktarı" });
      await user.clear(q);
      await user.keyboard(typed);
      fireEvent.click(screen.getByRole("button", { name: "1 kalemi ekle" }));
      const picked = onPick.mock.calls[0][0] as { catalogId: string; quantity: number }[];
      expect(picked[0]?.quantity).toBe(expected);
    },
  );
});
