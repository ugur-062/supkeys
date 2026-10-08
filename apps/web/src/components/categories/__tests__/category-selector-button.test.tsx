// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Form alanındaki kategori çipleri (talep / ürün formu) — kayıt denetimi 2026-10
 * çip kuralları burada da geçerli: adın tamamı, segment harfsiz yol, 32 px'lik
 * kaldırma hedefi, ad isteği düşünce "…" yerine kod + yeniden dene.
 */
const h = vi.hoisted(() => ({
  byIds: {} as { data?: unknown; isError?: boolean; refetch?: () => void },
  args: [] as unknown[][],
}));

vi.mock("@/hooks/use-categories", () => ({
  useCategoriesByIds: (...args: unknown[]) => {
    h.args.push(args);
    return h.byIds;
  },
}));
vi.mock("@/components/categories/category-selector-modal", () => ({
  CategorySelectorModal: () => <div data-testid="modal" />,
}));

import { CategorySelectorButton } from "../category-selector-button";

const LONG = "Elektrik kutuları, panoları, fitingleri ve aksesuarları";

beforeEach(() => {
  h.byIds = {
    data: [{ id: "39121300", nameTr: LONG, breadcrumb: `Z. Elektrik Sistemleri › Elektrik donanımı › ${LONG}` }],
  };
  h.args = [];
});

describe("CategorySelectorButton — seçim çipleri", () => {
  it("adın tamamı (kırpma yok), segment harfsiz yol, 32 px'lik adlı kaldırma düğmesi", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CategorySelectorButton value={["39121300"]} onChange={onChange} />);
    const name = screen.getByText(LONG);
    expect(name.className).not.toMatch(/max-w-\[\d+px\]|truncate/);
    expect(name.className).toContain("break-words");
    const chip = name.parentElement as HTMLElement;
    expect(chip.className).toContain("max-w-full");
    expect(chip).toHaveAttribute("title", `Elektrik Sistemleri › Elektrik donanımı › ${LONG}`);
    const remove = screen.getByRole("button", { name: `${LONG} kategorisini kaldır` });
    expect(remove.className).toMatch(/\bsize-8\b/);
    await user.click(remove);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("ad isteği düşerse '…' değil kod + 'Yeniden dene' (genel toast kapalı)", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    h.byIds = { data: undefined, isError: true, refetch };
    render(<CategorySelectorButton value={["39121300"]} onChange={() => {}} />);
    expect(screen.queryByText("…")).toBeNull();
    expect(screen.getByText("39121300")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "39121300 kategorisini kaldır" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(h.args.at(-1)?.[1]).toEqual({ inlineError: true });
  });

  it("ad yüklenirken '…'; hata satırı yok", () => {
    h.byIds = { data: undefined };
    render(<CategorySelectorButton value={["39121300"]} onChange={() => {}} />);
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yeniden dene" })).toBeNull();
  });
});
