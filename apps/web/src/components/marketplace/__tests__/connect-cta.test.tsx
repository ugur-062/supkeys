// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PublicConnectCta } from "../connect-cta";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

/**
 * Arayüz testi kapanış S-PUB-ADMIN: herkese açık firma profilindeki
 * "Bağlantı isteği gönder" paket ipucu taşımıyordu; ücretsiz üye ancak panel
 * firma kartında Silver kilidini görüyordu. Önce paket (Silver), sonra izin.
 */
function signIn(
  tier: string | null,
  status = "VERIFIED",
  permissions: string[] = ["connections:manage"],
  slug = "baska-firma",
) {
  useCompanyAuthStore.setState({
    isHydrated: true,
    user: tier ? ({ id: "u", permissions, roles: [] } as never) : null,
    company: tier ? ({ tier, companyVerificationStatus: status, slug } as never) : null,
  });
}

const PANEL = "/company/firma/rv-c12-test-makina";
/* eslint-disable @next/next/no-html-link-for-pages -- yer tutucu misafir CTA'sı */
const guest = <a href="/company/login?next=x">Giriş bağlantısı</a>;
/* eslint-enable @next/next/no-html-link-for-pages */

function renderCta() {
  return render(
    <PublicConnectCta companySlug="rv-c12-test-makina" panelHref={PANEL}>
      {guest}
    </PublicConnectCta>,
  );
}

beforeEach(() => signIn(null));

describe("PublicConnectCta", () => {
  it("misafir: sunucunun giriş bağlantısı", () => {
    renderCta();
    expect(screen.getByRole("link", { name: "Giriş bağlantısı" })).toBeInTheDocument();
  });

  it("ücretsiz, doğrulanmış: kilitli '· Silver' paket sayfasına", () => {
    signIn("STANDART");
    renderCta();
    expect(screen.queryByText("Giriş bağlantısı")).toBeNull();
    const link = screen.getByRole("link", { name: "Bağlantı isteği gönder · Silver" });
    expect(link).toHaveAttribute("href", "/company/premium");
    expect(link).toHaveAttribute("title", "Bağlantı daveti göndermek Silver paketiyle açılır");
  });

  it("ücretsiz, doğrulanmamış: önce doğrulama", () => {
    signIn("STANDART", "UNVERIFIED");
    renderCta();
    expect(screen.getByRole("link", { name: "Bağlantı Silver ile — önce doğrulanın" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
  });

  it("paket kapısı izinden önce: izinsiz ücretsiz üyeye de Silver kilidi", () => {
    signIn("STANDART", "VERIFIED", []);
    renderCta();
    expect(screen.getByRole("link", { name: "Bağlantı isteği gönder · Silver" })).toBeInTheDocument();
  });

  it("Silver ∧ izin: panel firma kartı", () => {
    signIn("SILVER");
    renderCta();
    expect(screen.getByRole("link", { name: "Bağlantı isteği gönder" })).toHaveAttribute("href", PANEL);
  });

  it("Silver ama izin yok: davet sunulmaz, firma panelde açılır", () => {
    signIn("SILVER", "VERIFIED", ["buy:view"]);
    renderCta();
    expect(screen.queryByText(/Bağlantı isteği gönder/)).toBeNull();
    expect(screen.getByRole("link", { name: "Firmayı panelde aç" })).toHaveAttribute("href", PANEL);
  });

  it("kendi profili: eylem yok", () => {
    signIn("GOLD", "VERIFIED", ["connections:manage"], "rv-c12-test-makina");
    const { container } = renderCta();
    expect(container.textContent).toBe("");
  });
});
