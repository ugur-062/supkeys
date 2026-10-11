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
import { useCompanyAuthStore } from "@/lib/company-auth/store";

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

  it("davet sonrası taze koltuk verisi varsayılanı günceller — bekleyen davet koltuğu doldurduysa Görüntüleyici (MU-13 gözden geçirme)", async () => {
    h.seats = { limit: 2, used: 1, pendingSeatInvites: 0, usedBuy: 0, usedSell: 1, tier: "STANDART" };
    const { rerender } = render(<InviteUserDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("kisi@firma.com"), { target: { value: "ali@firma.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Davet Gönder" }));
    await waitFor(() => expect(h.invite).toHaveBeenCalledTimes(1));
    expect(h.invite.mock.calls[0][0].permissions).toEqual(["sell:view", "sell:bid:submit"]);
    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());

    // Davet `company-seats`'i yeniden çeker: bekleyen davet son koltuğu doldurdu.
    h.seats = { limit: 2, used: 1, pendingSeatInvites: 1, usedBuy: 0, usedSell: 1, tier: "STANDART" };
    rerender(<InviteUserDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("kisi@firma.com"), { target: { value: "veli@firma.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Davet Gönder" }));
    await waitFor(() => expect(h.invite).toHaveBeenCalledTimes(2));
    expect(h.invite.mock.calls[1][0].permissions).toEqual(["buy:view", "sell:view"]);
  });

  it("suppress edilmiş adres: uyarı, yeniden gönder eylemi YOK (aynı adrese yine gitmez)", async () => {
    h.invite.mockResolvedValue({ id: "inv1", email: "ali@firma.com", emailSent: false, emailFailureReason: "suppressed" });
    await submitValid();
    await waitFor(() => expect(h.toast.warning).toHaveBeenCalledTimes(1));
    const [, opts] = h.toast.warning.mock.calls[0] as [string, { action?: unknown }];
    expect(opts.action).toBeUndefined();
  });

  it("teslim edilemez alan adı: 'alan adına teslim edilemez' uyarısı ('geri çevirdi' DEĞİL), yeniden gönder eylemi YOK", async () => {
    h.invite.mockResolvedValue({ id: "inv1", email: "ali@firma.com", emailSent: false, emailFailureReason: "undeliverable" });
    await submitValid();
    await waitFor(() => expect(h.toast.warning).toHaveBeenCalledTimes(1));
    const [msg, opts] = h.toast.warning.mock.calls[0] as [string, { action?: unknown }];
    expect(msg).toContain("bu alan adına e-posta teslim edilemez");
    expect(msg).not.toContain("geri çevirdi");
    expect(opts.action).toBeUndefined();
  });

  it("staging izin listesi: 'bu ortamda gönderilmedi' uyarısı ('geri çevirdi' DEĞİL), yeniden gönder eylemi YOK", async () => {
    h.invite.mockResolvedValue({ id: "inv1", email: "ali@firma.com", emailSent: false, emailFailureReason: "allowlist" });
    await submitValid();
    await waitFor(() => expect(h.toast.warning).toHaveBeenCalledTimes(1));
    const [msg, opts] = h.toast.warning.mock.calls[0] as [string, { action?: unknown }];
    expect(msg).toContain("izin listesindeki");
    expect(msg).not.toContain("geri çevirdi");
    expect(opts.action).toBeUndefined();
  });

  it("Vazgeç girilen e-postayı ve dili sıfırlar — yeniden açılınca boş form (arayüz testi D-310)", () => {
    const onClose = vi.fn();
    const { rerender } = render(<InviteUserDialog open onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText("kisi@firma.com"), { target: { value: "ali@firma.com" } });
    fireEvent.change(screen.getByLabelText("Davet dili"), { target: { value: "ru" } });
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<InviteUserDialog open={false} onClose={onClose} />);
    rerender(<InviteUserDialog open onClose={onClose} />);
    expect((screen.getByPlaceholderText("kisi@firma.com") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Davet dili") as HTMLSelectElement).value).toBe("tr");
    expect(h.invite).not.toHaveBeenCalled();
  });

  it("tam erişimli (efektif GOLD) firmada koltuk doluyken doğrulama önerilmez, koltuk boşaltma söylenir (arayüz testi D-188)", () => {
    h.seats = { limit: 6, used: 6, pendingSeatInvites: 0, usedBuy: 3, usedSell: 3, tier: "GOLD" };
    render(<InviteUserDialog open onClose={() => {}} />);
    expect(screen.getByText(/bekleyen bir daveti iptal edin/)).toBeInTheDocument();
    expect(screen.queryByText(/yükseltin|doğrulayın/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /doğrula/i })).not.toBeInTheDocument();
  });

  // Eski sözleşme ("alt pakette Paketler bağlantısı") kalktı: daha fazla
  // koltuk firma doğrulamasıyla gelir — paket adı/bağlantısı yok.
  it.each([
    ["UNVERIFIED", "Firmanızı doğrulayın"],
    ["PENDING", "Doğrulama durumunu gör"],
    ["REJECTED", "Yeniden başvurun"],
  ])("doğrulanmamış firmada (%s) koltuk doluyken doğrulama akışına yönlendirilir", (status, cta) => {
    h.seats = { limit: 2, used: 2, pendingSeatInvites: 0, usedBuy: 0, usedSell: 2, tier: "STANDART" };
    useCompanyAuthStore.setState({ company: { companyVerificationStatus: status } as never } as never);
    try {
      render(<InviteUserDialog open onClose={() => {}} />);
      const note = screen.getByText(/doğrulanmış firmalar daha fazla kullanıcıya işlem yetkisi verebilir/);
      expect(note.textContent).not.toMatch(/paket|silver|gold|yükselt/i);
      expect(screen.getByRole("link", { name: cta })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
    } finally {
      useCompanyAuthStore.setState({ company: null } as never);
    }
  });
});

