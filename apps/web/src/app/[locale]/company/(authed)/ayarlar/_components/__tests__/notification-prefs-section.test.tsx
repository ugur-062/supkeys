// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  // Kararlı nesne: bileşen `[user]` değişince tercihleri yeniden kurar —
  // her çizimde yeni nesne sonsuz döngü olurdu.
  auth: { user: { notificationPrefs: null as Record<string, boolean> | null } },
}));

vi.mock("@/hooks/use-company-account", async (orig) => ({
  ...(await orig<typeof import("@/hooks/use-company-account")>()),
  useChangePassword: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMe: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateNotificationPrefs: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => h.auth,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { NotificationPrefsSection } from "../account-settings-section";

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.user.notificationPrefs = null;
});

/**
 * E-posta akışları incelemesi (2026-10-05): keşif e-postaları kendi alt
 * tercihinde (`aiInvitation`, `growthNudges`); üst tercih ana şalterdir — üst
 * kapalıyken alt satır pasif ve "gönderilmez" ipucuyla görünür.
 */
describe("NotificationPrefsSection — keşif alt tercihleri", () => {
  it("alt tercih satırları var; üst kapalıyken pasif + ipucu, üst açılınca etkin", async () => {
    const user = userEvent.setup();
    h.auth.user.notificationPrefs = { invitation: false };
    render(<NotificationPrefsSection />);
    const ai = screen.getByRole("switch", { name: /AI önerisiyle bir alım talebine davet edildiğimde/ });
    expect(ai).toBeDisabled();
    expect(ai).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Üstteki tercih kapalıyken bu e-postalar da gönderilmez.")).toBeInTheDocument();
    const nudges = screen.getByRole("switch", { name: /Alım talebim teklif almadığında öneriler/ });
    expect(nudges).toBeEnabled();

    await user.click(screen.getByRole("switch", { name: /Alım talebi daveti aldığımda/ }));
    expect(ai).toBeEnabled();
    expect(ai).toHaveAttribute("aria-checked", "true");
  });

  it("alt tercih kapatılıp kaydedilince yalnız o anahtar false gider", async () => {
    const user = userEvent.setup();
    render(<NotificationPrefsSection />);
    await user.click(screen.getByRole("switch", { name: /AI önerisiyle bir alım talebine davet edildiğimde/ }));
    await user.click(screen.getByRole("button", { name: /Kaydet/ }));
    expect(h.mutateAsync).toHaveBeenCalledTimes(1);
    const sent = h.mutateAsync.mock.calls[0]![0] as Record<string, boolean>;
    expect(sent.aiInvitation).toBe(false);
    expect(sent.invitation).toBe(true);
    expect(sent.growthNudges).toBe(true);
  });
});
