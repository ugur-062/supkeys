// @vitest-environment jsdom
/**
 * ÜYE DAVET — sözleşme (2026-09-10): e-posta gerçek biçim denetimi + satır
 * içi hata; geçerli e-posta + yetki seçiliyken davet ucu çağrılır.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  invite: vi.fn(),
  resend: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  // Referans KARARLI (react-query gibi) — her çizimde yeni nesne efekt döngüsü sınar değil.
  seats: { limit: 6, used: 1, pendingSeatInvites: 0, usedBuy: 1, usedSell: 0, tier: "GOLD" } as Record<string, unknown>,
  catalog: {
    catalog: [
      { key: "buy:view", label: "", group: "buy", seat: false },
      { key: "buy:listing:manage", label: "", group: "buy", seat: true },
      { key: "sell:view", label: "", group: "sell", seat: false },
      { key: "sell:bid:submit", label: "", group: "sell", seat: true },
    ],
    groups: {},
    presets: {
      SATIN_ALMACI: ["buy:view", "buy:listing:manage"],
      SATISCI: ["sell:view", "sell:bid:submit"],
      GORUNTULEYICI: ["buy:view", "sell:view"],
    },
  },
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => ({ user: { id: "u1", isOwner: true } }) }));
vi.mock("@/hooks/use-company-users", () => ({
  useInviteUser: () => ({ mutateAsync: h.invite, isPending: false }),
  useResendInvitation: () => ({ mutateAsync: h.resend, isPending: false }),
  usePermissionCatalog: () => ({ data: h.catalog }),
  useSeats: () => ({ data: h.seats }),
}));
vi.mock("@/components/company/permission-table", () => ({ PermissionTable: () => <div data-testid="perm-table" /> }));

import { InviteUserDialog } from "../invite-user-dialog";

beforeEach(() => {
  h.seats = { limit: 6, used: 1, pendingSeatInvites: 0, usedBuy: 1, usedSell: 0, tier: "GOLD" };
  h.invite.mockReset().mockResolvedValue({ id: "inv1", email: "ali@firma.com", emailSent: true });
  h.resend.mockReset().mockResolvedValue({ ok: true, emailSent: true });
  Object.values(h.toast).forEach((f) => f.mockReset());
});

async function submitValid() {
  render(<InviteUserDialog open onClose={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText("kisi@firma.com"), { target: { value: "ali@firma.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Davet Gönder" }));
  await waitFor(() => expect(h.invite).toHaveBeenCalledTimes(1));
}

describe("InviteUserDialog", () => {
  it("geçersiz e-postada satır içi hata ve kilitli düğme; geçerli e-postada davet gönderilir", async () => {
    render(<InviteUserDialog open onClose={() => {}} />);
    const email = screen.getByPlaceholderText("kisi@firma.com");
    const send = screen.getByRole("button", { name: "Davet Gönder" });
    fireEvent.change(email, { target: { value: "ali@firma" } });
    fireEvent.blur(email);
    expect(screen.getByText(/Geçerli bir e-posta adresi girin/)).toBeInTheDocument();
    expect(send).toBeDisabled();

    fireEvent.change(email, { target: { value: "ali@firma.com" } });
    expect(screen.queryByText(/Geçerli bir e-posta adresi girin/)).toBeNull();
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() => expect(h.invite).toHaveBeenCalledTimes(1));
    expect(h.invite.mock.calls[0][0]).toMatchObject({
      email: "ali@firma.com",
      permissions: ["buy:view", "buy:listing:manage"],
      locale: "tr",
    });
    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
  });

  it("e-posta GİTMEDİYSE 'gönderildi' denmez: uyarı + Yeniden gönder eylemi yeniden gönderim ucunu çağırır", async () => {
    h.invite.mockResolvedValue({ id: "inv1", email: "ali@firma.com", emailSent: false, emailFailureReason: "failed" });
    await submitValid();
    await waitFor(() => expect(h.toast.warning).toHaveBeenCalledTimes(1));
    expect(h.toast.success).not.toHaveBeenCalled();
    const [msg, opts] = h.toast.warning.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(msg).toContain("ali@firma.com");
    expect(opts.action.label).toBe("Yeniden gönder");
    opts.action.onClick();
    await waitFor(() => expect(h.resend).toHaveBeenCalledWith("inv1"));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Davet e-postası yeniden gönderildi."));
  });

  it("davet dili: varsayılan arayüz dili gönderilir; seçilen dil davet ucuna gider", async () => {
    render(<InviteUserDialog open onClose={() => {}} />);
    const select = screen.getByLabelText("Davet dili") as HTMLSelectElement;
    // Dil adları dilin KENDİ adıyla (çevrilmez).
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Türkçe", "English", "Русский"]);
    expect(select.value).toBe("tr"); // test sahtesinde arayüz dili Türkçe
    fireEvent.change(select, { target: { value: "en" } });
    fireEvent.change(screen.getByPlaceholderText("kisi@firma.com"), { target: { value: "john@firma.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Davet Gönder" }));
    await waitFor(() => expect(h.invite).toHaveBeenCalledTimes(1));
    expect(h.invite.mock.calls[0][0]).toMatchObject({ email: "john@firma.com", locale: "en" });
  });

  it("Gold DEĞİLSE varsayılan set satınalma yetkisi taşımaz — Satışçı (derin denetim MU-13)", async () => {
    h.seats = { limit: 2, used: 1, pendingSeatInvites: 0, usedBuy: 0, usedSell: 1, tier: "STANDART" };
    await submitValid();
    expect(h.invite.mock.calls[0][0].permissions).toEqual(["sell:view", "sell:bid:submit"]);
  });

  it("koltuk doluysa varsayılan set koltuk tüketmez — Görüntüleyici", async () => {
    h.seats = { limit: 4, used: 4, pendingSeatInvites: 0, usedBuy: 0, usedSell: 4, tier: "SILVER" };
    await submitValid();
    expect(h.invite.mock.calls[0][0].permissions).toEqual(["buy:view", "sell:view"]);
  });

  it("suppress edilmiş adres: uyarı, yeniden gönder eylemi YOK (aynı adrese yine gitmez)", async () => {
    h.invite.mockResolvedValue({ id: "inv1", email: "ali@firma.com", emailSent: false, emailFailureReason: "suppressed" });
    await submitValid();
    await waitFor(() => expect(h.toast.warning).toHaveBeenCalledTimes(1));
    const [, opts] = h.toast.warning.mock.calls[0] as [string, { action?: unknown }];
    expect(opts.action).toBeUndefined();
  });
});
