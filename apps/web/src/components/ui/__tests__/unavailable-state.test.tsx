// @vitest-environment jsdom
import enWeb from "@rothern/i18n/catalog/en/web.json";
import ruWeb from "@rothern/i18n/catalog/ru/web.json";
import trWeb from "@rothern/i18n/catalog/tr/web.json";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Dil farkında bağlantı (`@/i18n/navigation`): gerçek bileşen iç yola etkin
// dilin ön ekini ekler. Burada onun yerine İŞARETLİ bir sahte konur — ekranın
// düz `next/link` ya da çıplak `<a>` değil, dil farkında bağlantıyı kullandığı
// sınanır (ön ek mantığının kendisi derleme / e2e ile sınanıyor).
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={`/en${href === "/" ? "" : href}`} data-locale-link="" className={className}>
      {children}
    </a>
  ),
}));

import { UnavailableState, resetAutoRetryMemory } from "../unavailable-state";

/**
 * KESİNTİ EKRANINDA ÇIKIŞ YOLU (canlı doğrulama OUT-5): ekran sayfanın tamamının
 * yerine çizilir — logo, üst çubuk, bağlantı yoktu; tek eylem "Tekrar dene"
 * idi. Anasayfa ve önbellekteki listeler kesintide de açılırken ziyaretçi
 * çıkmazda kalıyordu.
 */
describe("UnavailableState — anasayfa bağlantısı", () => {
  beforeEach(() => {
    resetAutoRetryMemory();
  });

  it("Tekrar dene'nin ALTINDA ikincil 'Ana sayfaya dön' bağlantısı var", () => {
    render(<UnavailableState error={new Error("down")} onRetry={() => {}} />);
    const retry = screen.getByRole("button", { name: "Tekrar dene" });
    const home = screen.getByRole("link", { name: "Ana sayfaya dön" });
    expect(retry.compareDocumentPosition(home) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // İkincil: dolgulu düğme değil, metin bağlantısı.
    expect(home.className).not.toMatch(/\bbg-/);
  });

  it("bağlantı dil farkında (`@/i18n/navigation`): etkin dilin anasayfasına gider", () => {
    render(<UnavailableState error={new Error("down")} onRetry={() => {}} />);
    const home = screen.getByRole("link", { name: "Ana sayfaya dön" });
    expect(home).toHaveAttribute("data-locale-link");
    expect(home).toHaveAttribute("href", "/en");
  });

  it("bağlantı metni üç dilde var", () => {
    expect(trWeb.shared.unavailable.home).toBe("Ana sayfaya dön");
    expect(enWeb.shared.unavailable.home).toBe("Back to home");
    expect(ruWeb.shared.unavailable.home).toBe("На главную");
  });
});
