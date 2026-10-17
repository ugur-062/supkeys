// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import {
  PRICING_HREF,
  SilverLockCard,
  UpgradeActions,
  UpgradeButtons,
  VERIFY_HREF,
  VerifyFirstLink,
  useUpgradeHref,
  useVerifyFirst,
} from "../silver-lock-card";

/**
 * GERİYE DÖNÜK ADLAR (ücretsiz dönem 2026-10-07): eski kilit/yükseltme
 * dışa aktarımları derlenmeye devam eder ama HEPSİ doğrulama kapısını çizer.
 * Eski sözleşme ("doğrulanmışta tek eylem Silver / Paketleri gör →
 * /company/premium") kalktı: paket sayfası yok, paket adı basılmaz; eski
 * çağıranın geçtiği paket etiketi (`ctaLabel`, `pricingLabel`) yok sayılır.
 */
function setStatus(status: string | null) {
  useCompanyAuthStore.setState({
    company: status ? ({ companyVerificationStatus: status } as never) : null,
    user: status ? ({ permissions: ["company:manage"], roles: [], isOwner: false } as never) : null,
  } as never);
}

afterEach(() => setStatus(null));

function Probe() {
  return (
    <>
      <a href={useUpgradeHref()}>adres</a>
      <span data-testid="verify-first">{String(useVerifyFirst())}</span>
    </>
  );
}

describe("silver-lock-card — geriye dönük adlar doğrulama kapısını çizer", () => {
  it("PRICING_HREF artık doğrulama akışıdır (paket sayfası kaldırıldı)", () => {
    expect(PRICING_HREF).toBe(VERIFY_HREF);
    expect(VERIFY_HREF).toBe("/company/ayarlar/dogrulama");
  });

  it.each([
    ["UNVERIFIED", "Firmanızı doğrulayın", "true"],
    ["PENDING", "Doğrulama durumunu gör", "false"],
    ["REJECTED", "Yeniden başvurun", "true"],
  ])("%s → her yüzey doğrulama eylemini gösterir; eski paket etiketleri çizilmez", (status, cta, verifyFirst) => {
    setStatus(status);
    render(
      <>
        <Probe />
        <SilverLockCard title="Kilitli" description="d" ctaLabel="Silver paketine geç" />
        <UpgradeButtons pricingLabel="Paketleri gör" />
        <UpgradeActions ctaLabel="Gold'a geç" />
        <p>
          metin <VerifyFirstLink />
        </p>
      </>,
    );
    expect(screen.getByRole("link", { name: "adres" })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
    expect(screen.getByTestId("verify-first")).toHaveTextContent(verifyFirst);
    const links = screen.getAllByRole("link", { name: cta });
    expect(links).toHaveLength(4);
    for (const a of links) expect(a).toHaveAttribute("href", "/company/ayarlar/dogrulama");
    expect(document.body.textContent).not.toMatch(/silver|gold|paket/i);
    for (const a of screen.getAllByRole("link")) expect(a.getAttribute("href")).not.toContain("/company/premium");
  });
});
