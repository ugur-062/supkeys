// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PublicConnectCta } from "../connect-cta";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

/**
 * Arayüz testi kapanış S-PUB-ADMIN: herkese açık firma profilindeki
 * "Bağlantı isteği gönder" ipucu taşımıyordu; yetkisiz üye ancak panel firma
 * kartında kilidi görüyordu. Önce firmanın yetkisi (doğrulama), sonra izin.
 *
 * ÜCRETSİZ DÖNEM (2026-10-07): doğrulanmış firmanın `/me` kademesi efektif
 * olarak en üst kademedir ("GOLD" — iç tanımlayıcı, arayüzde yazılmaz);
 * doğrulanmamış firma "STANDART" kalır. Metinlerde paket adı geçmez.
 */
const VERIFY = "/company/ayarlar/dogrulama";
const PACKAGE_WORDS = /Gold|Silver|paket|premium/i;
function signIn(
  tier: string | null,
  status = tier === "STANDART" ? "UNVERIFIED" : "VERIFIED",
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

  it("doğrulanmamış: kilitli bağlantı doğrulama sayfasına, paket adı yok", () => {
    signIn("STANDART", "UNVERIFIED");
    const { container } = renderCta();
    expect(screen.queryByText("Giriş bağlantısı")).toBeNull();
    const link = screen.getByRole("link", { name: "Bağlantı için firmanızı doğrulayın" });
    expect(link).toHaveAttribute("href", VERIFY);
    expect(link).toHaveAttribute("title", "Bağlantı daveti göndermek için firma doğrulaması gerekir");
    expect(container.textContent).not.toMatch(PACKAGE_WORDS);
    expect(link.getAttribute("title")).not.toMatch(PACKAGE_WORDS);
  });

  it("doğrulama incelemede: 'inceleniyor' (yeniden başvuru istenmez); reddedilmiş: yeniden başvuru", () => {
    signIn("STANDART", "PENDING");
    const first = renderCta();
    expect(screen.getByRole("link", { name: "Bağlantı için doğrulamanız inceleniyor" })).toHaveAttribute("href", VERIFY);
    first.unmount();
    signIn("STANDART", "REJECTED");
    renderCta();
    expect(screen.getByRole("link", { name: "Bağlantı için doğrulamaya yeniden başvurun" })).toHaveAttribute("href", VERIFY);
  });

  it("doğrulama kapısı izinden önce: izinsiz doğrulanmamış üyeye de doğrulama kilidi", () => {
    signIn("STANDART", "UNVERIFIED", []);
    renderCta();
    expect(screen.getByRole("link", { name: "Bağlantı için firmanızı doğrulayın" })).toHaveAttribute("href", VERIFY);
  });

  it("doğrulanmış ∧ izin: panel firma kartı", () => {
    signIn("GOLD");
    renderCta();
    expect(screen.getByRole("link", { name: "Bağlantı isteği gönder" })).toHaveAttribute("href", PANEL);
  });

  it("doğrulanmış ama izin yok: davet sunulmaz, firma panelde açılır", () => {
    signIn("GOLD", "VERIFIED", ["buy:view"]);
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
