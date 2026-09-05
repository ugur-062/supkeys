// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PanelHeroSearch } from "../panel-hero-search";

const push = vi.fn();
const h = vi.hoisted(() => ({ pathname: "/company/satinalma", search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => h.pathname,
  useSearchParams: () => new URLSearchParams(h.search),
}));

describe("PanelHeroSearch — Europages 'Ne arıyorsunuz?' kutusu", () => {
  it("JS'siz de çalışır: form GET ile sonuç sayfasına ?q= gönderir", () => {
    render(<PanelHeroSearch title="Ne arıyorsunuz?" lead="x" placeholder="p" action="/company/satinalma/urunler" />);
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/company/satinalma/urunler");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByRole("searchbox")).toHaveAttribute("name", "q");
  });

  it("JS'de tam sayfa yenilemez: router.push ile ?q= (boş terimde sade sonuç sayfası)", () => {
    render(<PanelHeroSearch title="Ne arıyorsunuz?" lead="x" placeholder="p" action="/company/satinalma/urunler" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  çelik boru " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenLastCalledWith("/company/satinalma/urunler?q=%C3%A7elik%20boru");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenLastCalledWith("/company/satinalma/urunler");
  });

  it("çipler en fazla 6 ve verilen hedefe gider; çip yoksa nav çizilmez", () => {
    const chips = Array.from({ length: 8 }, (_, i) => ({ id: `${i}`, name: `Kat ${i}`, count: i + 1, href: `/x?kategori=${i}` }));
    const { rerender } = render(<PanelHeroSearch title="T" lead="x" placeholder="p" action="/x" chips={chips} chipsLabel="Popüler" />);
    expect(screen.getByRole("navigation", { name: "Popüler" }).querySelectorAll("a")).toHaveLength(6);
    expect(screen.getByRole("link", { name: /Kat 0/ })).toHaveAttribute("href", "/x?kategori=0");
    rerender(<PanelHeroSearch title="T" lead="x" placeholder="p" action="/x" chips={[]} />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("sonuç listesi AYNI sayfadaysa seçili süzgeçler korunur, yalnız q ve sayfa değişir", () => {
    h.pathname = "/company/satis";
    h.search = "durum=tumu&alici=c1&sayfa=3&q=eski";
    render(<PanelHeroSearch title="T" lead="x" placeholder="p" action="/company/satis" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "kablo" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenLastCalledWith("/company/satis?durum=tumu&alici=c1&q=kablo");
    // Boş terim: q düşer, süzgeçler kalır.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenLastCalledWith("/company/satis?durum=tumu&alici=c1");
    h.pathname = "/company/satinalma";
    h.search = "";
  });
});
