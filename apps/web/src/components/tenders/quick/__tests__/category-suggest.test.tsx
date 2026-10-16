// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-categories", () => ({
  useCategorySearchTree: () => ({
    data: {
      segments: [
        {
          id: "30000000",
          code: "30000000",
          nameTr: "Yapı",
          level: 1,
          segmentLetter: null,
          families: [
            {
              id: "30170000",
              code: "30170000",
              nameTr: "Kapılar",
              level: 2,
              classes: [
                { id: "30171500", code: "30171500", nameTr: "Panel garaj kapısı", level: 3, isMatch: true, commodities: [] },
              ],
            },
          ],
        },
      ],
    },
  }),
}));

import { CategorySuggest } from "../category-suggest";

/**
 * Mobil denetim 2026-10: çipler telefonda büyüdü (g06-request-create-category-
 * suggest-small); masaüstü karşılaştırması (desktop-diff#new0) büyümenin her
 * genişliğe uygulandığını gösterdi → sm'den itibaren eski boy.
 */
describe("CategorySuggest — çip boyu", () => {
  const cls = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/);

  it("telefonda en az 32 px / 12 px yazı / 8 px ara; sm'den itibaren eski boy", () => {
    const onPick = vi.fn();
    render(<CategorySuggest seedText="Panel garaj kapısı" selected={[]} onPick={onPick} />);
    const chip = screen.getByRole("button", { name: /Panel garaj kapısı/ });
    expect(cls(chip)).toEqual(
      expect.arrayContaining(["min-h-8", "px-2.5", "py-1.5", "text-xs", "sm:min-h-0", "sm:px-1.5", "sm:py-0.5", "sm:text-[11px]"]),
    );
    expect(cls(chip.parentElement)).toEqual(expect.arrayContaining(["mt-2", "gap-2", "sm:mt-1.5", "sm:gap-1.5"]));
    fireEvent.click(chip);
    expect(onPick).toHaveBeenCalledWith("30171500");
  });
});
