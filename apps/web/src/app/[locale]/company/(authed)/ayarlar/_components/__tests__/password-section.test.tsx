// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock("@/hooks/use-company-account", () => ({
  NOTIFICATION_PREFS: [],
  useChangePassword: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
  useUpdateMe: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateNotificationPrefs: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => ({ user: null }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PasswordSection } from "../account-settings-section";

beforeEach(() => vi.clearAllMocks());

/**
 * AYARLAR › ŞİFRE politikası kayıt/davetle AYNI kaynaktan (`usePasswordRules`):
 * 10 karakter + küçük/büyük harf + rakam + özel karakter. Eskiden bu ekran
 * 8 karakter ve özel karaktersiz şifreyi kabul ediyordu (yayın denetimi
 * 2026-09-28 Bölüm 9; API tarafı `password-policy-parity.spec`).
 */
describe("PasswordSection", () => {
  async function fill(next: string) {
    const user = userEvent.setup();
    render(<PasswordSection />);
    await user.type(screen.getByLabelText("Mevcut Şifre"), "Eski!Sifre12");
    await user.type(screen.getByLabelText("Yeni Şifre"), next);
    await user.type(screen.getByLabelText("Yeni Şifre (Tekrar)"), next);
    await user.click(screen.getByRole("button", { name: "Şifreyi Değiştir" }));
  }

  it("özel karaktersiz şifre gönderilmez; gereksinim listesinde özel karakter var", async () => {
    await fill("GucluParola12");
    expect(screen.getByText("Yeni şifre aşağıdaki gereksinimlerin tümünü karşılamalı")).toBeInTheDocument();
    expect(screen.getByText("Özel karakter")).toBeInTheDocument();
    expect(screen.getByText("En az 10 karakter")).toBeInTheDocument();
    expect(h.mutateAsync).not.toHaveBeenCalled();
  });

  it("9 karakterlik şifre gönderilmez", async () => {
    await fill("Parola12!");
    expect(h.mutateAsync).not.toHaveBeenCalled();
  });

  it("politikaya uyan şifre gönderilir", async () => {
    h.mutateAsync.mockResolvedValue({ ok: true });
    await fill("Yeni!Sifre123");
    expect(h.mutateAsync).toHaveBeenCalledWith({ currentPassword: "Eski!Sifre12", newPassword: "Yeni!Sifre123" });
  });
});
