// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  admin: null as unknown,
}));

const idle = { mutate: vi.fn(), isPending: false };

vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: h.admin }),
}));
vi.mock("@/hooks/use-admin-staff", () => ({
  useChangePassword: () => idle,
}));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

import AdminSettingsPage from "../page";

beforeEach(() => {
  h.admin = null;
});

describe("AdminSettingsPage — 2FA kaldırıldı (2026-10-07)", () => {
  it("yalnız şifre bölümü çizilir; 2FA bölümü, düğmesi ve uyarısı yok", () => {
    // Eski API'den kalmış snapshot bayrakları da hiçbir şey çizdirmez.
    h.admin = { id: "a1", twoFactorEnabled: true, twoFactorSetupRequired: true };
    render(<AdminSettingsPage />);
    expect(screen.getByRole("button", { name: "Değiştir" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/2FA|iki adımlı/i)).not.toBeInTheDocument();
  });
});

describe("AdminSettingsPage — geçici parola (arayüz testi D-025)", () => {
  it("geçici parolayla girildiyse şifre bölümünün üstünde kilit uyarısı", () => {
    h.admin = { id: "a1", mustChangePassword: true };
    render(<AdminSettingsPage />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Kendi şifrenizi belirleyin");
    expect(
      alert.compareDocumentPosition(screen.getByRole("button", { name: "Değiştir" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
