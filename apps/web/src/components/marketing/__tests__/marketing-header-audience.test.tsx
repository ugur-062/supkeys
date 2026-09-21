// @vitest-environment jsdom
/**
 * ÜST ÇUBUK "ÜCRETSİZ KAYDOL" RENGİ (2026-09-17, kullanıcı kararı): anasayfada
 * "Tedarikçiyim" seçiliyken YEŞİL (satış rengi), alıcı yüzünde ve diğer
 * sayfalarda MAVİ. Üst çubuk sağlayıcının dışında mount olur; taraf
 * bilgisini paylaşılan depodan okur. Varsayılan yüz 2026-09-21'den beri
 * TEDARİKÇİ → anasayfa ilk açılışta yeşil.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudienceProvider, AudienceSwitch } from "@/components/marketplace/audience-switch";
import { MarketingHeader } from "../marketing-header";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  window.localStorage.clear();
  nav.pathname = "/";
});

const signup = () => screen.getAllByRole("link", { name: "Ücretsiz Kaydol" })[0];

describe("MarketingHeader — Ücretsiz Kaydol rengi", () => {
  it("varsayılan (tedarikçi) yeşil; Alıcıyım'a geçince mavi, geri dönünce yeşil", async () => {
    const user = userEvent.setup();
    render(
      <>
        <MarketingHeader />
        <AudienceProvider>
          <AudienceSwitch />
        </AudienceProvider>
      </>,
    );
    expect(signup().className).toContain("bg-emerald-600");
    await user.click(screen.getByRole("radio", { name: "Alıcıyım" }));
    expect(signup().className).toContain("bg-blue-600");
    await user.click(screen.getByRole("radio", { name: "Tedarikçiyim" }));
    expect(signup().className).toContain("bg-emerald-600");
  });

  it("kayıtlı tercih alıcıysa anasayfada mavi açılır; başka sayfada da mavi", async () => {
    window.localStorage.setItem("rothern.audience", "buyer");
    const { unmount } = render(<MarketingHeader />);
    await screen.findAllByRole("link", { name: "Ücretsiz Kaydol" });
    expect(signup().className).toContain("bg-blue-600");
    unmount();
    nav.pathname = "/urunler";
    const r2 = render(<MarketingHeader />);
    expect(signup().className).toContain("bg-blue-600");
    r2.unmount();
    // Tedarikçi yüzü sayfaları her zaman yeşil.
    nav.pathname = "/alim-talepleri";
    render(<MarketingHeader />);
    expect(signup().className).toContain("bg-emerald-600");
  });
});
