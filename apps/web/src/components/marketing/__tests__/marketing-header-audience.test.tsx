// @vitest-environment jsdom
/**
 * ÜST ÇUBUK "ÜCRETSİZ KAYDOL" RENGİ (2026-09-17, kullanıcı kararı): anasayfada
 * "Tedarikçiyim" seçiliyken YEŞİL (satış rengi), alıcı yüzünde ve diğer
 * sayfalarda MAVİ. Üst çubuk sağlayıcının dışında mount olur; taraf
 * bilgisini paylaşılan depodan okur.
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
  it("alıcı yüzünde mavi; Tedarikçiyim'e geçince yeşil", async () => {
    const user = userEvent.setup();
    render(
      <>
        <MarketingHeader />
        <AudienceProvider>
          <AudienceSwitch />
        </AudienceProvider>
      </>,
    );
    expect(signup().className).toContain("bg-blue-600");
    await user.click(screen.getByRole("radio", { name: "Tedarikçiyim" }));
    expect(signup().className).toContain("bg-emerald-600");
    await user.click(screen.getByRole("radio", { name: "Alıcıyım" }));
    expect(signup().className).toContain("bg-blue-600");
  });

  it("kayıtlı tercih tedarikçiyse anasayfada yeşil açılır; başka sayfada mavi kalır", async () => {
    window.localStorage.setItem("rothern.audience", "supplier");
    const { unmount } = render(<MarketingHeader />);
    await screen.findAllByRole("link", { name: "Ücretsiz Kaydol" });
    expect(signup().className).toContain("bg-emerald-600");
    unmount();
    nav.pathname = "/urunler";
    render(<MarketingHeader />);
    expect(signup().className).toContain("bg-blue-600");
  });
});
