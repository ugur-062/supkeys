// @vitest-environment jsdom
/**
 * SÜZGEÇ KABUĞU — OKUNAMAYAN TOPLAM (canlı doğrulama 2026-10-09, OUTR-1 / OUTR-3).
 *
 * Panel listeleri (Açık Talepler, panel Ürünler / Firmalar) toplamı istemcide
 * bir sorgudan okur; sorgu yüklenirken ya da düştüğünde toplam BİLİNMEZ. Eskiden
 * `?? 0` ile kabuğa 0 gidiyor, sonuç satırı "… bulunamadı", mobil çekmecenin
 * düğmesi "Sonuçları göster (0)" diyordu. `total: null` = okunamadı.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satinalma/urunler",
}));

import { FilterShellCore, MobileFilterButton, ResultCount } from "../filter-shell";

function Shell({ total, loading = false }: { total: number | null; loading?: boolean }) {
  return (
    <FilterShellCore
      state={{ page: 1 }}
      toUrl={() => "/company/satinalma/urunler"}
      clearState={(s) => s}
      total={total}
      activeCount={0}
      drawer={<p>süzgeç ağacı</p>}
    >
      <MobileFilterButton />
      <ResultCount kind="product" loading={loading} />
    </FilterShellCore>
  );
}

describe("FilterShellCore — total: null (okunamadı)", () => {
  it("sonuç satırı '… bulunamadı' demez; istek sürüyorsa 'Güncelleniyor…', düştüyse susar", () => {
    const view = render(<Shell total={null} loading />);
    expect(screen.getByText("Güncelleniyor…")).toBeInTheDocument();
    expect(screen.queryByText("Ürün bulunamadı")).toBeNull();

    view.rerender(<Shell total={null} />);
    expect(screen.queryByText("Güncelleniyor…")).toBeNull();
    expect(screen.queryByText("Ürün bulunamadı")).toBeNull();
    expect(document.body.textContent).not.toMatch(/bulundu|bulunamadı/);
  });

  it("mobil çekmecenin düğmesi sayı yazmaz ('Sonuçları göster (0)' değil)", async () => {
    render(<Shell total={null} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Süzgeçler" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("süzgeç ağacı");
    expect(screen.getByRole("button", { name: "Sonuçları göster" })).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/\(\s*0\s*\)/);
  });

  it("okunmuş toplam eskisi gibi: 0 → '… bulunamadı' ve '(0)', N → 'N ürün bulundu'", async () => {
    const view = render(<Shell total={0} />);
    expect(screen.getByText("Ürün bulunamadı")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Süzgeçler" }));
    expect(await screen.findByRole("button", { name: "Sonuçları göster (0)" })).toBeInTheDocument();
    view.unmount();

    render(<Shell total={12} />);
    expect(screen.getByText("12 ürün bulundu")).toBeInTheDocument();
  });
});
