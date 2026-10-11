// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  users: { data: [] as unknown[], isLoading: false, isError: false },
  recoveryMutate: vi.fn(),
  setActiveMutate: vi.fn((_v: unknown) => Promise.resolve(undefined)),
  changeEmailMutate: vi.fn((_v: { email: string }) =>
    Promise.resolve({ email: _v.email }),
  ),
  addUserMutate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-admin-company-users", () => ({
  useAdminCompanyUsers: () => h.users,
  useUserRecoveryAction: () => ({ mutate: h.recoveryMutate, mutateAsync: (...a: unknown[]) => { (h.recoveryMutate as (...x: unknown[]) => unknown)(...a); return Promise.resolve(undefined); }, isPending: false }),
  useSetUserActive: () => ({ mutateAsync: h.setActiveMutate, isPending: false }),
  useChangeUserEmail: () => ({ mutateAsync: h.changeEmailMutate, isPending: false }),
  useAddCompanyUser: () => ({ mutate: h.addUserMutate, mutateAsync: (...a: unknown[]) => { (h.addUserMutate as (...x: unknown[]) => unknown)(...a); return Promise.resolve(undefined); }, isPending: false }),
}));

import { UsersTab } from "../users-tab";

function user(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    email: `${id}@firma.com`,
    firstName: "Kişi",
    lastName: id.toUpperCase(),
    phone: null,
    roles: ["SATISCI"],
    isActive: true,
    emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    twoFactorEnabled: false,
    lastLoginAt: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    isOwner: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.users = { data: [user("u1")], isLoading: false, isError: false };
});

describe("UsersTab — kullanıcı kurtarma", () => {
  it("Şifre → password-reset aksiyonu mutate edilir", async () => {
    const uev = userEvent.setup();
    render(<UsersTab companyId="c1" />);
    await uev.click(screen.getByRole("button", { name: /Şifre/ }));
    expect(h.recoveryMutate).toHaveBeenCalledWith(
      { userId: "u1", action: "password-reset" }
    );
  });

  it("doğrulanmamış kullanıcıda Doğrulama butonu görünür ve mutate eder", async () => {
    h.users = {
      data: [user("u1", { emailVerifiedAt: null })],
      isLoading: false,
      isError: false,
    };
    const uev = userEvent.setup();
    render(<UsersTab companyId="c1" />);
    await uev.click(
      screen.getByRole("button", { name: "u1@firma.com işlemleri" }),
    );
    await uev.click(
      await screen.findByRole("menuitem", { name: /Doğrulama Kodunu Gönder/ }),
    );
    expect(h.recoveryMutate).toHaveBeenCalledWith(
      { userId: "u1", action: "resend-verification" }
    );
  });

  it("Devre Dışı → active:false mutate; Kurucu satırında buton yok", async () => {
    h.users = {
      data: [user("u1"), user("owner", { isOwner: true })],
      isLoading: false,
      isError: false,
    };
    const uev = userEvent.setup();
    render(<UsersTab companyId="c1" />);
    // Kurucu satırında kebab menüde Devre Dışı yok; normal üyede var.
    await uev.click(
      screen.getByRole("button", { name: "owner@firma.com işlemleri" }),
    );
    expect(
      screen.queryByRole("menuitem", { name: "Devre Dışı Bırak" }),
    ).not.toBeInTheDocument();
    await uev.keyboard("{Escape}");
    await uev.click(
      screen.getByRole("button", { name: "u1@firma.com işlemleri" }),
    );
    await uev.click(
      await screen.findByRole("menuitem", { name: "Devre Dışı Bırak" }),
    );
    // Önce kısa onay (D-209) — tek tıkla uygulanmaz.
    const dialog = await screen.findByRole("dialog");
    expect(h.setActiveMutate).not.toHaveBeenCalled();
    expect(within(dialog).getByText("u1@firma.com")).toBeInTheDocument();
    await uev.click(
      within(dialog).getByRole("button", { name: "Devre Dışı Bırak" }),
    );
    expect(h.setActiveMutate).toHaveBeenCalledWith({
      userId: "u1",
      active: false,
    });
  });

  it("Oturumları Düşür → onay penceresi; Vazgeç'te istek gitmez, onayda gider (D-209)", async () => {
    const uev = userEvent.setup();
    render(<UsersTab companyId="c1" />);
    await uev.click(
      screen.getByRole("button", { name: "u1@firma.com işlemleri" }),
    );
    await uev.click(
      await screen.findByRole("menuitem", { name: "Oturumları Düşür" }),
    );
    let dialog = await screen.findByRole("dialog");
    await uev.click(within(dialog).getByRole("button", { name: "Vazgeç" }));
    expect(h.recoveryMutate).not.toHaveBeenCalled();

    await uev.click(
      screen.getByRole("button", { name: "u1@firma.com işlemleri" }),
    );
    await uev.click(
      await screen.findByRole("menuitem", { name: "Oturumları Düşür" }),
    );
    dialog = await screen.findByRole("dialog");
    await uev.click(
      within(dialog).getByRole("button", { name: "Oturumları Düşür" }),
    );
    expect(h.recoveryMutate).toHaveBeenCalledWith({
      userId: "u1",
      action: "drop-sessions",
    });
  });

  it("Kullanıcı Ekle → dialog → form → addUser mutate", async () => {
    const uev = userEvent.setup();
    render(<UsersTab companyId="c1" />);
    await uev.click(screen.getByRole("button", { name: /Kullanıcı Ekle/ }));
    const dialog = await screen.findByRole("dialog");
    await uev.type(
      within(dialog).getByLabelText(/E-posta/),
      "yeni@firma.com",
    );
    await uev.type(within(dialog).getByLabelText("Ad"), "Yeni");
    await uev.type(within(dialog).getByLabelText("Soyad"), "Üye");
    await uev.selectOptions(
      within(dialog).getByLabelText("Rol"),
      "SATIN_ALMACI",
    );
    await uev.click(within(dialog).getByRole("button", { name: "Ekle" }));
    expect(h.addUserMutate).toHaveBeenCalledWith(
      {
        email: "yeni@firma.com",
        firstName: "Yeni",
        lastName: "Üye",
        role: "SATIN_ALMACI",
      }
    );
  });

  it("tam yetkili olmayan (doğrulanmamış) firmada Satın Almacı seçeneği kilitli; neden doğrulama (derin denetim MU-04)", async () => {
    const uev = userEvent.setup();
    render(<UsersTab companyId="c1" canGrantBuy={false} verification="PENDING" />);
    await uev.click(screen.getByRole("button", { name: /Kullanıcı Ekle/ }));
    const dialog = await screen.findByRole("dialog");
    const buyer = within(dialog).getByRole("option", {
      name: /Satın Almacı/,
    }) as HTMLOptionElement;
    expect(buyer.disabled).toBe(true);
    expect(buyer.textContent).toMatch(/doğrulama gerekli/);
    expect(
      within(dialog).getByText(/yalnız doğrulanmış firmada verilebilir.*doğrulaması inceleniyor/),
    ).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/gold|silver|paket/i);
    const seller = within(dialog).getByRole("option", {
      name: "Satışçı",
    }) as HTMLOptionElement;
    expect(seller.disabled).toBe(false);
  });

  it("E-posta → prompt → changeEmail mutate", async () => {
    const uev = userEvent.setup();
    render(<UsersTab companyId="c1" />);
    await uev.click(
      screen.getByRole("button", { name: "u1@firma.com işlemleri" }),
    );
    await uev.click(
      await screen.findByRole("menuitem", { name: "E-posta Adresini Değiştir" }),
    );
    const dialog = await screen.findByRole("dialog");
    await uev.type(
      within(dialog).getByLabelText(/Yeni e-posta/),
      "degisen@firma.com",
    );
    await uev.click(within(dialog).getByRole("button", { name: "Değiştir" }));
    expect(h.changeEmailMutate).toHaveBeenCalledWith({
      userId: "u1",
      email: "degisen@firma.com",
    });
  });

  it("E-posta: geçersiz adres gönderilmez, alan hatası; sunucu hatasında diyalog açık kalır (D-204)", async () => {
    const uev = userEvent.setup();
    render(<UsersTab companyId="c1" />);
    await uev.click(
      screen.getByRole("button", { name: "u1@firma.com işlemleri" }),
    );
    await uev.click(
      await screen.findByRole("menuitem", { name: "E-posta Adresini Değiştir" }),
    );
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText(/Yeni e-posta/);
    expect(input).toHaveAttribute("maxLength", "200");
    await uev.type(input, "gecersiz-adres");
    expect(within(dialog).getByText(/Geçerli bir e-posta/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Değiştir" })).toBeDisabled();
    expect(h.changeEmailMutate).not.toHaveBeenCalled();

    h.changeEmailMutate.mockImplementationOnce(() => Promise.reject(new Error("409")));
    await uev.clear(input);
    await uev.type(input, "dolu@firma.com");
    await uev.click(within(dialog).getByRole("button", { name: "Değiştir" }));
    await vi.waitFor(() => expect(h.changeEmailMutate).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByLabelText(/Yeni e-posta/)).toHaveValue("dolu@firma.com");
  });
});

// Arayüz testi son tur api-2 (D-305): rolsüz Görüntüleyici üye admin Rol
// sütununda "—" değil, firma paneliyle aynı "Görüntüleyici" yazar.
describe("UsersTab — rol sütunu", () => {
  it("rolsüz izinli üye Görüntüleyici, izinsiz üye Yetki yok yazar", () => {
    h.users = {
      data: [
        user("v1", { roles: [], permissions: ["buy:view", "sell:view", "buy:reports:view"] }),
        user("n1", { roles: [], permissions: [] }),
      ],
      isLoading: false,
      isError: false,
    };
    render(<UsersTab companyId="c1" />);
    const v = screen.getByText("v1@firma.com").closest("tr")!;
    const n = screen.getByText("n1@firma.com").closest("tr")!;
    expect(within(v).getByText("Görüntüleyici")).toBeTruthy();
    expect(within(n).getByText("Yetki yok")).toBeTruthy();
  });
});
