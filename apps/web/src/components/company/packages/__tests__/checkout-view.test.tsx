// @vitest-environment jsdom
/**
 * SATIN ALMA EKRANI — SÖZLEŞME (2026-09-15).
 *
 * Adresle doğrudan açılabildiği için kapılar kart tıklamasına güvenmez:
 * doğrulanmamış → doğrulama, geçersiz paket → Paketler. Ödeme altyapısı
 * gelene dek ödeme düğmesi pasif ve tek eylem destek ekibine talep.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  meData: undefined as unknown,
  paket: "gold" as string | null,
  replace: vi.fn(),
  push: vi.fn(),
  upgradeAsync: vi.fn(),
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
  useSearchParams: () => new URLSearchParams(h.paket ? { paket: h.paket } : {}),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyMe: () => ({ data: h.meData }),
  useUpgradePremium: () => ({ mutateAsync: h.upgradeAsync, isPending: false }),
}));

import { CheckoutView } from "../checkout-view";

function setMe({
  status = "VERIFIED",
  tier = "STANDART",
  isOwner = true,
  selfUpgradeEnabled = false,
}: { status?: string; tier?: string; isOwner?: boolean; selfUpgradeEnabled?: boolean } = {}) {
  h.meData = {
    company: { companyVerificationStatus: status, tier, name: "Deneme A.Ş." },
    user: { isOwner },
    selfUpgradeEnabled,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.paket = "gold";
});

describe("CheckoutView", () => {
  it("doğrulanmamış firma adresle gelse de doğrulamaya yönlenir", () => {
    setMe({ status: "UNVERIFIED" });
    render(<CheckoutView />);
    expect(h.replace).toHaveBeenCalledWith("/company/ayarlar/dogrulama");
    expect(screen.queryByRole("heading", { name: /satın al/ })).toBeNull();
  });

  it("geçersiz ya da ücretsiz paket → Paketler", () => {
    setMe();
    h.paket = "standart";
    render(<CheckoutView />);
    expect(h.replace).toHaveBeenCalledWith("/company/premium");
  });

  it("yıllık toplamı tek kaynak fiyattan hesaplar", () => {
    setMe();
    render(<CheckoutView />);
    expect(screen.getByRole("heading", { name: "Gold paketini satın al" })).toBeInTheDocument();
    expect(screen.getByText("Deneme A.Ş.")).toBeInTheDocument();
    // 230 × 12
    expect(screen.getByText("$2.760")).toBeInTheDocument();
  });

  it("ödeme altyapısı yokken ödeme düğmesi YOK, tek eylem talep e-postası", () => {
    setMe();
    render(<CheckoutView />);
    expect(screen.getByText("Kartla ödeme yakında.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Satın al|ödeme/i })).toBeNull();
    const talep = screen.getByRole("link", { name: "Satın alma talebi gönder" });
    expect(talep.getAttribute("href")).toMatch(/^mailto:support@rothern\.com\?subject=Gold/);
  });

  it("self-servis bayrağı açıksa Gold'da satın al gerçek ucu çağırır", async () => {
    const user = userEvent.setup();
    setMe({ selfUpgradeEnabled: true });
    h.upgradeAsync.mockResolvedValue({ ok: true, tier: "GOLD" });
    render(<CheckoutView />);
    await user.click(screen.getByRole("button", { name: /Satın al/ }));
    expect(h.upgradeAsync).toHaveBeenCalledTimes(1);
    expect(h.toast.success).toHaveBeenCalled();
  });

  it("self-servis uç yalnız GOLD'a yükseltir — Silver'da kullanılmaz", () => {
    setMe({ selfUpgradeEnabled: true });
    h.paket = "silver";
    render(<CheckoutView />);
    expect(screen.queryByRole("button", { name: /Satın al/ })).toBeNull();
    expect(screen.getByText("Kartla ödeme yakında.")).toBeInTheDocument();
  });

  it("paket zaten firmadaysa satın alma çizilmez", () => {
    setMe({ tier: "GOLD" });
    render(<CheckoutView />);
    expect(screen.getByText("Gold paketi zaten firmanızda")).toBeInTheDocument();
  });

  it("kurucu olmayan üye satın alamaz", () => {
    setMe({ isOwner: false });
    render(<CheckoutView />);
    expect(screen.getByText("Paketi firma kurucusu satın alabilir")).toBeInTheDocument();
  });
});
