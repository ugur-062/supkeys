// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/company/davet/abc",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { AuthShell } from "../auth-shell";

/**
 * KİMLİK KABUĞU DİL SEÇİCİSİ (2026-09-27): giriş, kayıt, ekip daveti kabulü
 * ve şifre sıfırlama pazarlama üst çubuğunu taşımaz. Seçici olmadan davetli
 * kabul etmeden önce dili değiştiremiyordu (hesap kabul sayfasının dilinde
 * doğar) — kabuk aynı `LanguageSwitcher`ı çizer.
 */
describe("AuthShell", () => {
  it("içeriği ve dil seçiciyi çizer", () => {
    render(
      <AuthShell title="Davete katıl" subtitle="Hesabınızı oluşturun" footer={<span>alt</span>}>
        <form aria-label="kabul formu" />
      </AuthShell>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Davete katıl" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "kabul formu" })).toBeInTheDocument();
    const lang = screen.getByRole("button", { name: /Dil|Language/ });
    expect(lang).toHaveAttribute("aria-haspopup", "menu");
  });
});
