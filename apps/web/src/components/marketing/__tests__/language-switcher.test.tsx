// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/hakkimizda",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { LanguageSwitcher } from "../language-switcher";

/**
 * DİL SEÇİCİ SÖZLEŞMESİ (i18n Faz 1): üç dil, dilin KENDİ adıyla (çevrilmez),
 * aktif dil `aria-current`, her bağlantı `hreflang` + `lang` taşır (ekran
 * okuyucu adı doğru dilde okur). Test sahtesinde `Link` next/link'e düşer;
 * ön ek üretimi next-intl'in işi, burada sınanmaz.
 */
describe("LanguageSwitcher (inline)", () => {
  it("üç dili kendi adıyla listeler ve aktif dili işaretler", () => {
    render(<LanguageSwitcher variant="inline" />);
    const nav = screen.getByRole("navigation");
    const links = nav.querySelectorAll("a");
    expect(Array.from(links).map((a) => a.textContent)).toEqual(["Türkçe", "English", "Русский"]);
    expect(Array.from(links).map((a) => a.getAttribute("hreflang"))).toEqual(["tr", "en", "ru"]);
    expect(Array.from(links).map((a) => a.getAttribute("lang"))).toEqual(["tr", "en", "ru"]);
    // Test sahtesinde aktif dil Türkçe (vitest.setup next-intl sahtesi).
    const active = Array.from(links).filter((a) => a.getAttribute("aria-current") === "true");
    expect(active.map((a) => a.textContent)).toEqual(["Türkçe"]);
  });

  it("menü varyantı erişilebilir adlı bir düğme çizer (liste kapalıyken bağlantı yok)", () => {
    render(<LanguageSwitcher />);
    const button = screen.getByRole("button", { name: /Dil|Language/ });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("arayüz testi D-055: aynı yolda değişen sorgu (süzgeç/sıralama) etkileşim anında bağlantıya girer", () => {
    window.history.replaceState(null, "", "/hakkimizda");
    render(<LanguageSwitcher variant="inline" />);
    const english = screen.getByRole("link", { name: "English" });
    expect(english.getAttribute("href")).toBe("/hakkimizda");
    // Süzgeç `router.replace` ile yalnız sorguyu değiştirir — yol aynı kalır.
    window.history.replaceState(null, "", "/hakkimizda?sirala=yeni");
    fireEvent.pointerDown(english);
    expect(screen.getByRole("link", { name: "English" }).getAttribute("href")).toBe("/hakkimizda?sirala=yeni");
    window.history.replaceState(null, "", "/");
  });
});
