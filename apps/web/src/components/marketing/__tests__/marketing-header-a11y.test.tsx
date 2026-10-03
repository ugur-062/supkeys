// @vitest-environment jsdom
/**
 * ÜST ÇUBUK — arayüz testi O-004, D-314, D-339.
 *  · Yayın anahtarı (`NEXT_PUBLIC_MARKETPLACE_LIVE`) kapalıyken pazar yeri
 *    rotaları 404; menü de altbilgi gibi o satırları basmaz.
 *  · Hamburger düğmesi çekmecenin açık/kapalı hâlini `aria-expanded` ile söyler.
 *  · Mobil çekmecede o anki dile basmak da çekmeceyi kapatır.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const flag = vi.hoisted(() => ({ live: false }));
vi.mock("@/lib/public/marketplace-live", () => ({
  get MARKETPLACE_LIVE() {
    return flag.live;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/hakkimizda",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { MarketingHeader } from "../marketing-header";

beforeEach(() => {
  flag.live = false;
  window.localStorage.clear();
});

const siteMenu = () => screen.getAllByRole("navigation").find((n) => n.querySelector('a[href*="nasil-calisir"]'))!;

describe("MarketingHeader", () => {
  it("O-004: anahtar kapalıyken Ürünler / Firmalar / Alım Talepleri menüde yok", () => {
    render(<MarketingHeader />);
    const hrefs = Array.from(siteMenu().querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.includes("/urunler"))).toBe(false);
    expect(hrefs.some((h) => h?.includes("/firmalar"))).toBe(false);
    expect(hrefs.some((h) => h?.includes("/alim-talepleri"))).toBe(false);
    expect(hrefs.some((h) => h?.includes("/nasil-calisir"))).toBe(true);
  });

  it("O-004: anahtar açıkken pazar yeri satırları menüde", () => {
    flag.live = true;
    render(<MarketingHeader />);
    const hrefs = Array.from(siteMenu().querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.includes("/urunler"))).toBe(true);
    expect(hrefs.some((h) => h?.includes("/alim-talepleri"))).toBe(true);
  });

  it("D-314: hamburger aria-expanded + aria-haspopup taşır", async () => {
    const user = userEvent.setup();
    render(<MarketingHeader />);
    const burger = screen.getByRole("button", { name: "Menüyü aç" });
    expect(burger).toHaveAttribute("aria-expanded", "false");
    expect(burger).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(burger);
    expect(burger).toHaveAttribute("aria-expanded", "true");
  });

  it("D-339: çekmecede o anki dile basınca çekmece kapanır", async () => {
    const user = userEvent.setup();
    render(<MarketingHeader />);
    await user.click(screen.getByRole("button", { name: "Menüyü aç" }));
    const dialog = await screen.findByRole("dialog");
    const current = within(dialog).getByRole("link", { name: "Türkçe" });
    current.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(current);
    expect(screen.getByRole("button", { name: "Menüyü aç", hidden: true })).toHaveAttribute("aria-expanded", "false");
  });
});
