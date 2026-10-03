// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { SilverLockCard, UpgradeButtons, VerifyFirstLink, useUpgradeHref } from "../silver-lock-card";

/**
 * SILVER KİLİT KARTI — DOĞRULAMA ÖNCE (2026-09-28, kullanıcı: "Silver'a veya
 * doğrulamaya yönlendirme"): paket alımı doğrulama ister; doğrulanmamış firmada
 * birincil eylem doğrulama, paketler ikincil. Doğrulanmışta tek eylem paketler.
 */
function setStatus(status: string | null) {
  useCompanyAuthStore.setState({
    company: status ? ({ companyVerificationStatus: status } as never) : null,
  } as never);
}

afterEach(() => setStatus(null));

describe("SilverLockCard", () => {
  it("doğrulanmamış firma → önce ücretsiz doğrulan + paketler ikincil", () => {
    setStatus("UNVERIFIED");
    render(<SilverLockCard title="Kilitli" description="d" />);
    expect(screen.getByRole("link", { name: "Önce ücretsiz doğrulan" })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
    expect(screen.getByRole("link", { name: "Paketleri gör" })).toHaveAttribute("href", "/company/premium");
    expect(screen.queryByRole("link", { name: "Silver paketine geç" })).not.toBeInTheDocument();
  });

  it("doğrulanmış firma → tek eylem Silver", () => {
    setStatus("VERIFIED");
    render(<SilverLockCard title="Kilitli" description="d" />);
    expect(screen.getByRole("link", { name: "Silver paketine geç" })).toHaveAttribute("href", "/company/premium");
    expect(screen.queryByRole("link", { name: "Önce ücretsiz doğrulan" })).not.toBeInTheDocument();
  });
});

/**
 * TEK DÜĞMELİ / METİN İÇİ ÇAĞRILAR (arayüz testi webC-2): Bağlantılar "Silver
 * ile davet et", teklif bantları ve metin içi paket bağlantıları da aynı kuralı
 * paylaşır — reddedilmiş/doğrulanmamış ücretsiz firma doğrudan Paketler'e
 * gönderilmez.
 */
function HrefProbe() {
  return <a href={useUpgradeHref()}>adres</a>;
}

describe("useUpgradeHref / UpgradeButtons / VerifyFirstLink", () => {
  it.each(["UNVERIFIED", "REJECTED"])("%s → doğrulama önce", (status) => {
    setStatus(status);
    render(
      <>
        <HrefProbe />
        <UpgradeButtons pricingLabel="Paketleri gör" />
        <p>
          metin <VerifyFirstLink />
        </p>
      </>,
    );
    expect(screen.getByRole("link", { name: "adres" })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
    const verify = screen.getAllByRole("link", { name: "Önce ücretsiz doğrulan" });
    expect(verify).toHaveLength(2);
    for (const a of verify) expect(a).toHaveAttribute("href", "/company/ayarlar/dogrulama");
    expect(screen.getByRole("link", { name: "Paketleri gör" })).toHaveAttribute("href", "/company/premium");
  });

  it.each(["VERIFIED", "PENDING"])("%s → yalnız Paketler", (status) => {
    setStatus(status);
    render(
      <>
        <HrefProbe />
        <UpgradeButtons pricingLabel="Paketleri gör" />
        <p>
          metin <VerifyFirstLink />
        </p>
      </>,
    );
    expect(screen.getByRole("link", { name: "adres" })).toHaveAttribute("href", "/company/premium");
    expect(screen.getByRole("link", { name: "Paketleri gör" })).toHaveAttribute("href", "/company/premium");
    expect(screen.queryByRole("link", { name: "Önce ücretsiz doğrulan" })).not.toBeInTheDocument();
  });
});
