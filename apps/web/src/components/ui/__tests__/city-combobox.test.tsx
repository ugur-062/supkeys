// @vitest-environment jsdom
import { Description } from "@headlessui/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/public/geo-client", () => ({ searchGeoCities: vi.fn(async () => []) }));

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
