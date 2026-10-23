// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActiveFilterChips } from "../active-filter-chips";
import { SearchInput } from "../search-input";

/**
 * Mobil denetim 2026-10 g06/g07: aktif süzgeç çipinin × düğmesi 16×16 px,
 * "Tümünü temizle" 16 px yüksek, arama kutusunun temizle düğmesi 22×22 px
 * idi. Dokunma alanları görünmez katmanla büyür; jsdom yerleşim yapmaz →
 * kilitlenen şey sınıflardır (alan hesabı bileşen yorumlarında).
 */
const classes = (el: Element) => el.className.split(/\s+/);

describe("ActiveFilterChips", () => {
  const filters = [
    { key: "q", label: 'Arama: "HD-NOTIF"', onRemove: vi.fn() },
    { key: "s", label: "Tamamlandı", onRemove: vi.fn() },
  ];

  it("× telefonda 24 px (sm+ 16 px), dokunma alanı 40×32 px; tıklama süzgeci kaldırır", () => {
    render(<ActiveFilterChips filters={filters} onClearAll={() => {}} />);
    const btn = screen.getByRole("button", { name: "Tamamlandı filtresini kaldır" });
    expect(classes(btn)).toEqual(
      expect.arrayContaining(["relative", "size-6", "sm:size-4", "shrink-0", "after:absolute", "after:-inset-x-2", "after:-inset-y-1"]),
    );
    fireEvent.click(btn);
    expect(filters[1]!.onRemove).toHaveBeenCalledTimes(1);
  });

  it("'Tümünü temizle' dokunma alanı 32 px yükseklik", () => {
    const onClearAll = vi.fn();
    render(<ActiveFilterChips filters={filters} onClearAll={onClearAll} />);
    const btn = screen.getByRole("button", { name: "Tümünü temizle" });
    expect(classes(btn)).toEqual(expect.arrayContaining(["relative", "after:absolute", "after:-inset-y-2", "after:-inset-x-1"]));
    fireEvent.click(btn);
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it("uzun arama metni çipi taşırmaz, satırı kırar", () => {
    render(<ActiveFilterChips filters={[filters[0]!]} onClearAll={() => {}} />);
    const label = screen.getByText('Arama: "HD-NOTIF"');
    expect(classes(label)).toEqual(expect.arrayContaining(["min-w-0", "[overflow-wrap:anywhere]"]));
    expect(classes(label.parentElement!)).toContain("max-w-full");
  });
});

describe("SearchInput temizle", () => {
  it("görünen düğme aynı; telefonda 42 px, sm+ 30 px dokunma alanı; metin alanın altına girmez", () => {
    const onChange = vi.fn();
    const { container } = render(<SearchInput value="HD-NOTIF" onChange={onChange} />);
    const btn = screen.getByRole("button", { name: "Aramayı temizle" });
    expect(classes(btn)).toEqual(expect.arrayContaining(["p-1", "right-2", "after:absolute", "after:-inset-2.5", "sm:after:-inset-1"]));
    // Catalyst Input sınıfı iç input'u saran span'e verir.
    const wrap = container.querySelector('[class*="_input]:pr-11"]');
    expect(wrap && classes(wrap)).toEqual(expect.arrayContaining(["[&_input]:pr-11", "sm:[&_input]:pr-9"]));
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith("");
  });
});
