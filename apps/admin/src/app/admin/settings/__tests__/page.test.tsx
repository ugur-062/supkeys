// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  admin: null as unknown,
}));

const idle = { mutate: vi.fn(), isPending: false };

vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: h.admin }),
  useAdminMe: () => ({ data: h.admin }),
}));
vi.mock("@/hooks/use-admin-staff", () => ({
  useChangePassword: () => idle,
  useTwoFactor: () => ({ setup: idle, enable: idle, disable: idle }),
}));
// Gerçek kabuğun içerik alanı <main>; uyarı bunun İÇİNDE, akışta olmalı.
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

import AdminSettingsPage from "../page";

/** Kendisi ya da atalarından biri viewport'a sabitlenmiş mi (fixed/sticky)? */
function isPinnedToViewport(el: HTMLElement | null): boolean {
  for (let n = el; n; n = n.parentElement) {
    const cls = n.getAttribute("class") ?? "";
    if (/(^|\s)(fixed|sticky)(\s|$)/.test(cls)) return true;
  }
  return false;
}

beforeEach(() => {
  h.admin = null;
});

describe("AdminSettingsPage — 2FA zorunlu uyarısı (boşluk taraması GB1)", () => {
  it("zorunluyken uyarı sayfa akışında, 2FA düğmelerinin ÜSTÜNDE ve sabit değil", () => {
    h.admin = {
      id: "a1",
      twoFactorEnabled: false,
      twoFactorSetupRequired: true,
    };
    render(<AdminSettingsPage />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("İki adımlı doğrulama (2FA) zorunlu");
    // Ekrana sabitlenmiş katman düğmelerin üstüne biner (1366x768'de
    // 'Etkinleştir' tıklanamıyordu) — uyarı normal akışta kalmalı.
    expect(isPinnedToViewport(alert)).toBe(false);
    expect(alert.closest("main")).not.toBeNull();

    const setupButton = screen.getByRole("button", { name: "2FA Kur" });
    expect(isPinnedToViewport(setupButton)).toBe(false);
    // Uyarı düğmeden önce gelir: sayfanın sonuna binemez, düğmeyi aşağı iter.
    expect(
      alert.compareDocumentPosition(setupButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("zorunlu değilse uyarı çizilmez", () => {
    h.admin = {
      id: "a1",
      twoFactorEnabled: false,
      twoFactorSetupRequired: false,
    };
    render(<AdminSettingsPage />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2FA Kur" })).toBeInTheDocument();
  });
});
