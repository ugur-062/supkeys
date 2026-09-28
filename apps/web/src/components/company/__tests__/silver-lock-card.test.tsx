// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { SilverLockCard } from "../silver-lock-card";

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
