// @vitest-environment jsdom
/**
 * Herkese açık liste iskeleti ve sayfa kabuğu — mobil denetim 2026-10, 2. tur.
 * jsdom yerleşim yapmaz; bu test YAPIYI korur (ölçümler tarayıcıda):
 *
 *  · g02 (masaüstü): tam genişlikte yapışkan aktif süzgeç şeridi, süzgeç
 *    rayının yapışkan üst kısmının ("Kategori" başlığı, Temizle) üstüne
 *    biniyordu → şerit SONUÇ sütununun başında; şerit varken ızgaranın üst
 *    boşluğu düşer (şerit başlık bandının yine 32 px altında başlar).
 *  · g02 / safe-area: yüzen "Talep aç" köşesi arama satırıyla kesişince
 *    çekilir → arama satırı `data-float-avoid` taşır.
 *  · safe-area: anasayfa hero'su `100cqw` ile tam genişlik; kapsayıcı yokken
 *    görünüm alanının tamamıydı ve yatay iPhone'da çentik tarafına taşıyordu
 *    → `PublicLayout`un `main`i kapsayıcı (`@container`).
 */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/marketing/marketing-header", () => ({ MarketingHeader: () => <header>üst</header> }));
vi.mock("../marketplace-footer", () => ({ MarketplaceFooter: () => <footer>alt</footer> }));
vi.mock("@/components/seo/json-ld", () => ({ JsonLd: () => null }));

import { PublicLayout } from "../public-layout";
import { PublicListPage } from "../public-list-page";

const cls = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(/\s+/);

function Page({ chips }: { chips?: ReactNode }) {
  return (
    <PublicListPage
      title="Ürünler"
      lead="Tedarikçilerin ürünleri"
      search={{ action: "/urunler", placeholder: "Ürün ara" }}
      chips={[]}
      clearHref="/urunler"
      chipsNode={chips}
      sidebar={<div>süzgeç rayı</div>}
      summary={<span>12 ürün</span>}
    >
      <div>sonuçlar</div>
    </PublicListPage>
  );
}

describe("PublicListPage — aktif süzgeç şeridi sonuç sütununda (2. tur g02)", () => {
  it("şerit ızgaranın İÇİNDE, sonuç sütununun başında; süzgeç rayının yanında", () => {
    render(<Page chips={<div data-chip-bar>Süzgeçler: Doğrulanmış</div>} />);
    const bar = screen.getByText("Süzgeçler: Doğrulanmış");
    const aside = screen.getByRole("complementary");
    const grid = aside.parentElement!;
    expect(cls(grid)).toEqual(expect.arrayContaining(["grid", "lg:grid-cols-[16rem_1fr]"]));
    // Şerit rayın kardeşi olan sonuç sütununun İLK çocuğu.
    const column = bar.parentElement!;
    expect(column.parentElement).toBe(grid);
    expect(column).not.toBe(aside);
    expect(column.firstElementChild).toBe(bar);
    expect(cls(column)).toContain("min-w-0");
    // Şerit sarmalanmaz (yapışkanlığın kabı sonuç sütunu kalmalı).
    expect(column).toContainElement(screen.getByText("12 ürün"));
    // Şerit varken ızgaranın üst boşluğu düşer.
    expect(cls(grid)).toEqual(expect.arrayContaining(["mt-8", "has-[[data-chip-bar]]:mt-0"]));
    // Telefonda süzgeç rayı çekmecede (aside gizli).
    expect(cls(aside)).toEqual(expect.arrayContaining(["hidden", "lg:block", "lg:sticky"]));
  });

  it("arama satırı yüzen köşenin kaçındığı bölge (`data-float-avoid`)", () => {
    render(<Page />);
    const search = screen.getByRole("searchbox");
    const row = search.closest("[data-float-avoid]");
    expect(row).not.toBeNull();
    expect(row).toContainElement(search.closest("form"));
  });
});

describe("PublicLayout — main kapsayıcı (2. tur safe-area)", () => {
  it("`main` bir @container: tam genişlik bantlar gövdenin güvenli alan payının içinde kalır", () => {
    render(
      <PublicLayout>
        <p>içerik</p>
      </PublicLayout>,
    );
    const main = screen.getByRole("main");
    expect(cls(main)).toEqual(expect.arrayContaining(["@container", "pt-(--safe-top)"]));
    expect(main).toContainElement(screen.getByText("içerik"));
  });
});
