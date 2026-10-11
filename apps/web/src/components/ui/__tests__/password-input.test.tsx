// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { PasswordInput } from "../password-input";

/**
 * Arayüz testi 2026-10 login-5/10, signup-enru-9, signup-tr-13: şifre alanı
 * Catalyst `<Field>` içinde düz `Input` ile aynı yerleşimi ve aynı yardımcı
 * teknoloji bağını taşır.
 */
describe("PasswordInput", () => {
  it("kök data-slot=control taşır → etiketle kutu arasındaki boşluk düz Input ile aynı", () => {
    render(
      <>
        <Field>
          <Label>E-posta</Label>
          <Input />
        </Field>
        <Field>
          <Label>Şifre</Label>
          <PasswordInput />
        </Field>
      </>,
    );
    for (const label of ["E-posta", "Şifre"]) {
      // `<Field>` boşluğu yalnız etiketin HEMEN ardındaki data-slot=control'a koyar.
      expect(screen.getByText(label).nextElementSibling, label).toHaveAttribute("data-slot", "control");
    }
  });

  it("Field etiketine ve hata iletisine bağlıdır: etiket adı, aria-invalid, aria-describedby", async () => {
    const user = userEvent.setup();
    render(
      <Field>
        <Label>Şifre</Label>
        <PasswordInput invalid />
        <ErrorMessage>En az 10 karakter</ErrorMessage>
      </Field>,
    );
    const input = screen.getByLabelText("Şifre", { exact: true });
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("En az 10 karakter");
    // Hata, kökün hemen ardında → standart hata boşluğunu alır.
    expect(screen.getByText("En az 10 karakter").previousElementSibling).toHaveAttribute("data-slot", "control");
    // Görünen etikete tıklamak girdiyi odaklar.
    await user.click(screen.getByText("Şifre"));
    expect(input).toHaveFocus();
  });

  it("göster/gizle tuşu: klavyeyle erişilir, adı duruma göre değişir, dokunma alanı 32 px (p-2 + 16 px simge)", async () => {
    const user = userEvent.setup();
    render(
      <Field>
        <Label>Şifre</Label>
        <PasswordInput />
      </Field>,
    );
    const input = screen.getByLabelText("Şifre", { exact: true });
    const toggle = screen.getByRole("button", { name: "Şifreyi göster" });
    expect(toggle).not.toHaveAttribute("tabindex", "-1");
    expect(toggle.className).toContain("p-2");
    expect(toggle.className).not.toContain("p-0.5");
    expect(toggle.className).toContain("text-zinc-500");
    await user.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Şifreyi gizle" })).toBeInTheDocument();
  });
});
