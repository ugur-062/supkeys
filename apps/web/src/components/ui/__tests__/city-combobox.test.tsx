// @vitest-environment jsdom
import { Description } from "@headlessui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const geo = vi.hoisted(() => ({
  searchGeoCities: vi.fn(async (): Promise<{ id: number; name: string }[]> => []),
}));
vi.mock("@/lib/public/geo-client", () => geo);

import { Field, Label } from "@/components/catalyst/fieldset";
import { CityCombobox } from "../city-combobox";

/**
 * Kayıt denetimi 2026-10 web-auth-3: `invalid` yalnız kırmızı çerçeveydi; kutu
 * `aria-invalid` taşımıyordu. Onboarding'in yabancı şehir ve teslimat şehri
 * alanları, 1. adımda yardımcı teknolojiye geçersiz diye işaretlenmeyen tek
 * girdilerdi (Ülke seçici, Select ve Input işaretliyor).
 */
describe("CityCombobox — geçersiz durum", () => {
  it("invalid: aria-invalid='true' ve kırmızı çerçeve", () => {
    render(<CityCombobox country="DE" value="" onChange={() => {}} ariaLabel="Şehir" invalid />);
    const box = screen.getByRole("combobox", { name: "Şehir" });
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box.className).toContain("border-red-500");
  });

  it("geçerliyken aria-invalid yazılmaz", () => {
    render(<CityCombobox country="DE" value="Munich" onChange={() => {}} ariaLabel="Şehir" />);
    const box = screen.getByRole("combobox", { name: "Şehir" });
    expect(box).not.toHaveAttribute("aria-invalid");
    expect(box.className).not.toContain("border-red-500");
  });

  it("Field içinde: hata metni kutunun açıklamasıdır ve kutu geçersiz işaretlidir", () => {
    render(
      <Field>
        <Label>Şehir *</Label>
        <CityCombobox country="DE" value="" onChange={() => {}} invalid />
        <Description>Şehri yazın</Description>
      </Field>,
    );
    const box = screen.getByRole("combobox", { name: "Şehir *" });
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("Şehri yazın");
  });
});

// Mobil denetim g11: liste alanın içinde (absolute) çizilir; kayan pencere
// gövdesinde altı kırpılıyordu — açılınca en yakın kaydırma kabı onu gösterir.
describe("CityCombobox — liste görünür alana getirilir", () => {
  it("seçenekler gelince liste scrollIntoView({ block: 'nearest' }) ile gösterilir", async () => {
    geo.searchGeoCities.mockResolvedValueOnce([
      { id: 1, name: "Munich" },
      { id: 2, name: "Münster" },
    ]);
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      render(<CityCombobox country="DE" value="Mu" onChange={() => {}} ariaLabel="Şehir" />);
      fireEvent.focus(screen.getByRole("combobox", { name: "Şehir" }));
      const list = await screen.findByRole("listbox");
      expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
      expect(scroll.mock.contexts.at(-1)).toBe(list);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

// Mobil denetim g11 (doğrulama turu): İl/Şehir listesi açıkken Escape tuşu
// pencereye de ulaşıyor, Adres Ekle penceresi yazılanlarla birlikte
// kapanıyordu. Açık liste Escape'i tüketir; kapalıyken tuş pencereye geçer.
describe("CityCombobox — Escape", () => {
  it("liste açıkken Escape yalnız listeyi kapatır (defaultPrevented, pencereye yayılmaz)", async () => {
    geo.searchGeoCities.mockResolvedValueOnce([
      { id: 1, name: "Ankara" },
      { id: 2, name: "Antalya" },
    ]);
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    try {
      render(<CityCombobox country="TR" value="Ank" onChange={() => {}} ariaLabel="İl" />);
      const box = screen.getByRole("combobox", { name: "İl" });
      fireEvent.focus(box);
      await screen.findByRole("listbox");
      const notPrevented = fireEvent.keyDown(box, { key: "Escape" });
      expect(notPrevented).toBe(false);
      expect(onWindowKey).not.toHaveBeenCalled();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(box).toHaveAttribute("aria-expanded", "false");
    } finally {
      window.removeEventListener("keydown", onWindowKey);
    }
  });

  it("liste kapalıyken Escape engellenmez (pencere kapanabilir)", () => {
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    try {
      render(<CityCombobox country="TR" value="" onChange={() => {}} ariaLabel="İl" />);
      const box = screen.getByRole("combobox", { name: "İl" });
      const notPrevented = fireEvent.keyDown(box, { key: "Escape" });
      expect(notPrevented).toBe(true);
      expect(onWindowKey).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", onWindowKey);
    }
  });
});
