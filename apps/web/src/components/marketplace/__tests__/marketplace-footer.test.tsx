// @vitest-environment jsdom
import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/",
}));
// Pazar yeri sütunu yayın anahtarı açıkken çizilir (canlıdaki hâl).
vi.mock("@/lib/public/marketplace-live", () => ({ MARKETPLACE_LIVE: true }));

import { MarketplaceFooter } from "../marketplace-footer";

/**
 * ALTBİLGİ — uzun sözcük sütundan taşmaz (son canlı kontrol 2026-10-10, NEW-03).
 *
 * 640 px'te dört sütunun her biri 124 px. Rusça "Конфиденциальность" 151 px
 * tutuyor ve bölünemiyordu: son sütundan 27 px taşıp her herkese açık sayfayı
 * 640–648 px arasında 3 px yatay kaydırıyordu (320 px'te de komşu sütuna
 * giriyordu). Chromium'da ölçüldü (TR / EN / RU, 320–1366 px): düzeltmeden
 * sonra yatay taşma 0 px, sütununu aşan bağlantı yok; Türkçe ve İngilizce
 * bağlantıların sarması değişmedi. jsdom yerleşim hesaplamaz; kilitlenen şey
 * bunu sağlayan sınıflardır.
 */
describe("MarketplaceFooter — sütun bağlantıları", () => {
  it("üç sütunun her bağlantısı: sığmayan sözcük bölünür, Rusçada uzun sözcük hece sınırından", () => {
    const { container } = render(<MarketplaceFooter />);
    const lists = [...container.querySelectorAll("footer ul")] as HTMLElement[];
    // Pazar yeri · Rothern · Sözleşmeler.
    expect(lists).toHaveLength(3);
    const links = lists.flatMap((ul) => within(ul).getAllByRole("link"));
    expect(links).toHaveLength(14);
    for (const link of links) {
      const cls = link.className.split(/\s+/);
      expect(cls).toContain("break-words");
      // Rusçada yalnız uzun sözcük (14+ harf) hecelenir; tirenin iki yanında en
      // az 4 harf (kapanış kontrolü CL-03: "Договор ди-станционной продажи"
      // bölünüyordu — 13 harfli sözcük kendi satırına sığar).
      expect(cls).toContain("[&:lang(ru)]:hyphens-auto");
      expect(cls).toContain("[hyphenate-limit-chars:14_4_4]");
      expect(cls.filter((c) => c.startsWith("[hyphenate-limit-chars:"))).toHaveLength(1);
      // Öteki dillerde heceleme açılmaz.
      expect(cls).not.toContain("hyphens-auto");
      // Kırpma ya da tek satıra zorlama yok: bağlantının tamamı okunur.
      expect(cls).not.toContain("truncate");
      expect(cls).not.toContain("whitespace-nowrap");
    }
    expect(within(lists[2]!).getByRole("link", { name: "Gizlilik" })).toHaveAttribute("href", "/sozlesmeler/gizlilik");
  });
});
