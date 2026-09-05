// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopbarSearch } from "../topbar-search";

const push = vi.fn();
const h = { heroGone: true };
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/hooks/use-hero-gone", () => ({ useHeroGone: () => h.heroGone }));

describe("TopbarSearch — üst çubukta portal duyarlı arama", () => {
  beforeEach(() => { push.mockClear(); h.heroGone = true; });

  it("satınalma: ürün arar; satış: açık talep arar (anasayfa listesi)", () => {
    const { rerender } = render(<TopbarSearch portal="satinalma" />);
    expect(screen.getByRole("search")).toHaveAttribute("action", "/company/satinalma/urunler");
    expect(screen.getByRole("searchbox", { name: "Ürün ara" })).toBeInTheDocument();
    rerender(<TopbarSearch portal="satis" />);
    expect(screen.getByRole("search")).toHaveAttribute("action", "/company/satis");
    expect(screen.getByRole("searchbox", { name: "Açık talep ara" })).toBeInTheDocument();
  });

  it("gönderince router.push ile ?q= (JS'siz de form GET çalışır)", () => {
    render(<TopbarSearch portal="satis" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: " kablo " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenCalledWith("/company/satis?q=kablo");
  });

  it("hero görünümdeyken çizilmez (anasayfada çift kutu olmasın)", () => {
    h.heroGone = false;
    render(<TopbarSearch portal="satinalma" />);
    expect(screen.queryByRole("search")).toBeNull();
  });
});
