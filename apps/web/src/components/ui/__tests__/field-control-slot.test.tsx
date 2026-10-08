// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) => sel({ company: null }),
}));

import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { CityCombobox } from "../city-combobox";
import { CountryCombobox } from "../country-combobox";
import { PasswordInput } from "../password-input";
import { PhoneInput } from "../phone-input";

/**
 * Adres penceresi (arayüz testi webC-09 yeniden doğrulama, D-311): aynı ızgara
 * satırındaki kutular aynı üst kenarda durmalı. Catalyst `<Field>` etiketle
 * denetim arasına `mt-3` boşluğunu yalnız `data-slot="control"` taşıyan doğrudan
 * çocuğa koyar — Ülke ve Telefon bunu taşımadığı için İl / İlgili kişi
 * kutularından 12 px yukarıda duruyordu.
 */
function controlAfter(label: string): HTMLElement {
  const el = screen.getByText(label).nextElementSibling as HTMLElement | null;
  expect(el).not.toBeNull();
  return el!;
}

describe("Field içindeki özel denetimler Catalyst Input ile aynı yerleşimi alır", () => {
  it("Ülke, İl, Telefon, Şifre ve düz Input etiketten sonra data-slot=control taşır", () => {
    render(
      <>
        <Field>
          <Label>İlgili kişi</Label>
          <Input value="" onChange={() => {}} />
        </Field>
        <Field>
          <Label>Şifre alanı</Label>
          <PasswordInput value="" onChange={() => {}} />
        </Field>
        <Field>
          <Label>Telefon alanı</Label>
          <PhoneInput value="" onChange={() => {}} />
        </Field>
        <Field>
          <Label>Ülke alanı</Label>
          <CountryCombobox value="TR" onChange={() => {}} ariaLabel="Ülke" />
        </Field>
        <Field>
          <Label>İl alanı</Label>
          <CityCombobox country="TR" value="" onChange={() => {}} ariaLabel="İl" />
        </Field>
      </>,
    );
    for (const label of ["İlgili kişi", "Şifre alanı", "Telefon alanı", "Ülke alanı", "İl alanı"]) {
      expect(controlAfter(label)).toHaveAttribute("data-slot", "control");
    }
  });

  it("Ülke ve Telefon kutuları Catalyst Input dolgusunu kullanır (36 px masaüstü / 44 px mobil)", () => {
    render(
      <>
        <CountryCombobox value="TR" onChange={() => {}} ariaLabel="Ülke" />
        <PhoneInput value="" onChange={() => {}} ariaLabel="Telefon" />
      </>,
    );
    for (const box of [screen.getByRole("combobox", { name: "Ülke" }), screen.getByLabelText("Telefon")]) {
      expect(box.className).toContain("py-[calc(--spacing(2.5)-1px)]");
      expect(box.className).toContain("sm:py-[calc(--spacing(1.5)-1px)]");
      expect(box.className).toContain("sm:text-sm/6");
    }
  });
});
