// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  meData: undefined as unknown,
  upgradeAsync: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyMe: () => ({ data: h.meData }),
  useUpgradePremium: () => ({ mutateAsync: h.upgradeAsync, isPending: false }),
}));

import { PremiumGate } from "../premium-gate";

function setMe(
  status: string,
  twoFactorEnabled: boolean,
  website: string | null = "https://firma.test",
  selfUpgradeEnabled = true,
) {
  h.meData = {
    company: { companyVerificationStatus: status, website },
    user: { twoFactorEnabled },
    selfUpgradeEnabled,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PremiumGate", () => {
  it("doğrulama eksikken 'Premium'a Geç' devre dışı + 'Aç' linkleri var", () => {
    setMe("UNVERIFIED", false, null);
    render(<PremiumGate />);
    expect(
      screen.getByRole("button", { name: "Premium'a Geç" }),
    ).toBeDisabled();
    // 3 gereksinim: belgeler + 2FA + web sitesi.
    expect(screen.getAllByRole("link", { name: "Aç" })).toHaveLength(3);
  });

  it("belgeler+2FA tamam ama web sitesi yoksa buton devre dışı", () => {
    setMe("VERIFIED", true, null);
    render(<PremiumGate />);
    expect(
      screen.getByRole("button", { name: "Premium'a Geç" }),
    ).toBeDisabled();
    expect(screen.getAllByRole("link", { name: "Aç" })).toHaveLength(1);
  });

  it("belgeler PENDING → inceleme ipucu gösterir", () => {
    setMe("PENDING", false);
    render(<PremiumGate />);
    expect(screen.getByText(/inceleniyor/i)).toBeInTheDocument();
  });

  it("VERIFIED + 2FA → buton aktif; tıklayınca upgrade + başarı toast", async () => {
    const user = userEvent.setup();
    setMe("VERIFIED", true);
    h.upgradeAsync.mockResolvedValue({ ok: true, tier: "PAKET" });
    render(<PremiumGate />);

    const btn = screen.getByRole("button", { name: "Premium'a Geç" });
    expect(btn).toBeEnabled();
    await user.click(btn);

    expect(h.upgradeAsync).toHaveBeenCalledTimes(1);
    expect(h.toast.success).toHaveBeenCalled();
  });

  it("selfUpgradeEnabled=false → 'Premium'a Geç' butonu YOK, manuel-onay notu var (Y2 flag)", () => {
    setMe("VERIFIED", true, "https://firma.test", false);
    render(<PremiumGate />);
    expect(
      screen.queryByRole("button", { name: "Premium'a Geç" }),
    ).toBeNull();
    expect(screen.getByText(/manuel onayla/i)).toBeInTheDocument();
  });

  it("upgrade hatası → error toast (çift toast yok, interceptor skip'te)", async () => {
    const user = userEvent.setup();
    setMe("VERIFIED", true);
    h.upgradeAsync.mockRejectedValue(new Error("fail"));
    render(<PremiumGate />);

    await user.click(screen.getByRole("button", { name: "Premium'a Geç" }));
    expect(h.toast.error).toHaveBeenCalledTimes(1);
  });
});
