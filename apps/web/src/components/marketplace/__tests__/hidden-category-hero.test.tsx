// @vitest-environment jsdom
/**
 * ESKİ PAZAR YERİ HERO'SU — hızlı kategori çipleri (2026-10-09; arayüz
 * denetimi W-19). Bileşen bugün hiçbir sayfaya bağlı değil; yeniden bağlanırsa
 * `stats.popularCategories` gizli segmentin alt kategorisini (ad + 404'e/gizli
 * süzgece giden bağlantı) çip olarak çizmemeli.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../audience-switch", () => ({
  AudienceSwitch: () => null,
  useAudience: () => ({ audience: "buyer", setAudience: vi.fn() }),
}));
vi.mock("../search-typeahead", () => ({ SearchTypeahead: () => <div data-testid="search" /> }));
vi.mock("../trust-strip", () => ({ TrustStrip: () => null }));
vi.mock("../member-cta", () => ({ OpenRequestLink: () => null }));

import { MarketplaceHero } from "../hero";

describe("MarketplaceHero — popüler kategori çipleri", () => {
  it("gizli segmentin alt kategorisi çip olmaz; görünür olanlar kalır", () => {
    const { container } = render(
      <MarketplaceHero
        popular={[
          { id: "46181500", name: "Koruyucu giysi", count: 40 },
          { id: "39121000", name: "Panolar", count: 12 },
          { id: "10151500", name: "Tohumlar", count: 9 },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Panolar" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Koruyucu giysi|Tohumlar/);
    expect(container.querySelector('a[href*="kategori=46"]')).toBeNull();
    expect(container.querySelector('a[href*="kategori=10"]')).toBeNull();
  });

  it("yalnız gizli kategoriler geldiyse çip şeridi hiç çizilmez (boş etiket kalmaz)", () => {
    const { container } = render(<MarketplaceHero popular={[{ id: "46181500", name: "Koruyucu giysi", count: 40 }]} />);
    expect(container.querySelector("nav")).toBeNull();
    expect(container.textContent).not.toContain("Koruyucu giysi");
  });
});
