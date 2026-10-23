// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const h = vi.hoisted(() => ({
  auth: { company: undefined as { tier?: string } | undefined },
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => h.auth,
}));

import { PremiumGate } from "../premium-gate";
import { PremiumOnly, VerifiedOnly } from "../premium-only";

/** Kapının durum metni `/me` anlık görüntüsünden (store) okunur. */
function setStatus(status: string | null) {
  useCompanyAuthStore.setState({
    company: status ? ({ companyVerificationStatus: status } as never) : null,
    user: status ? ({ permissions: ["company:manage"], roles: [], isOwner: false } as never) : null,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.company = undefined;
  setStatus(null);
});

const child = <div data-testid="child">İÇERİK</div>;

describe("VerifiedOnly (eski adı PremiumOnly) — efektif kademe kapısı, doğrulama ekranı", () => {
  it("geriye dönük ad aynı bileşendir", () => {
    expect(PremiumOnly).toBe(VerifiedOnly);
  });

  it("firma yüklenmemişken (undefined) içerik render edilir (yanıp sönme yok)", () => {
    render(<VerifiedOnly>{child}</VerifiedOnly>);
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("verification-gate")).not.toBeInTheDocument();
  });

  it("efektif kademe yeterli (doğrulanmış firma = tam erişim) → içerik", () => {
    h.auth.company = { tier: "GOLD" };
    setStatus("VERIFIED");
    render(<VerifiedOnly minTier="GOLD">{child}</VerifiedOnly>);
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("verification-gate")).not.toBeInTheDocument();
  });

  it("kademesini koruyan (ücretli/admin hibeli) doğrulanmamış firma eşiği geçiyorsa içerik görür", () => {
    h.auth.company = { tier: "SILVER" };
    setStatus("UNVERIFIED");
    render(<PremiumOnly minTier="SILVER">{child}</PremiumOnly>);
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it.each([
    ["UNVERIFIED", "unverified", "Firmanızı doğrulayın"],
    ["PENDING", "pending", "Doğrulama durumunu gör"],
    ["REJECTED", "rejected", "Yeniden başvurun"],
  ])("kademe yetmiyor + %s → doğrulama kapısı (paket ekranı değil), içerik gizli", (status, state, cta) => {
    h.auth.company = { tier: "STANDART" };
    setStatus(status);
    render(<PremiumOnly>{child}</PremiumOnly>);
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    expect(screen.getByTestId("verification-gate")).toHaveAttribute("data-state", state);
    expect(screen.getByRole("link", { name: cta })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
    expect(screen.getByTestId("verification-gate").textContent).not.toMatch(/silver|gold|paket|fiyat/i);
  });

  it("PremiumGate (eski ad) da doğrulama kapısını çizer; requiredTier metne yansımaz", () => {
    setStatus("UNVERIFIED");
    render(<PremiumGate requiredTier="GOLD" />);
    expect(screen.getByTestId("verification-gate")).toBeInTheDocument();
    expect(screen.getByTestId("verification-gate").textContent).not.toMatch(/gold|paket/i);
  });
});
