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

  /* Mağaza incelemesi (2026-10-16, Apple 5.1.1(i)): gizlilik politikası
     uygulamada girişten önce de erişilir. Yarım formun altında durur → yeni
     sekme + kabukta uygulama içi tarayıcı (form kaybolmaz). */
  it("kartın altında Gizlilik ve KVKK bağlantıları, uygulama içi tarayıcıda açılır", () => {
    render(
      <AuthShell title="Giriş" subtitle="Hesabınıza girin" footer={null}>
        <span />
      </AuthShell>,
    );
    for (const [name, href] of [
      ["Gizlilik", "/sozlesmeler/gizlilik"],
      ["KVKK Aydınlatma", "/sozlesmeler/kvkk"],
    ] as const) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("data-shell-browser");
    }
  });

  /* 2. tur safe-area: kabuk `body`nin yatay güvenli alan payının içinde akar;
     seçici sağ payı ikinci kez eklerse yatay iPhone'da kenardan 110 px içeride
     duruyordu (beklenen 16 + 47). Üst pay ise kabuğun kendisinde. */
  it("dil seçicisi yatay güvenli alan payını iki kez saymaz, üst payı taşır", () => {
    render(
      <AuthShell title="Giriş" subtitle="Hesabınıza girin" footer={null}>
        <span />
      </AuthShell>,
    );
    const lang = screen.getByRole("button", { name: /Dil|Language/ });
    const corner = lang.closest("div.absolute") as HTMLElement;
    expect(corner).not.toBeNull();
    const cls = corner.className.split(/\s+/);
    expect(cls).toContain("right-4");
    expect(corner.className).not.toMatch(/safe-right/);
    expect(cls).toContain("top-[calc(1rem+var(--safe-top))]");
  });
});
