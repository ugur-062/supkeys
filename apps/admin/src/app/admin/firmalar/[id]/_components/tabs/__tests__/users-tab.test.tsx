// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  users: { data: [] as unknown[], isLoading: false, isError: false },
  recoveryMutate: vi.fn(),
  setActiveMutate: vi.fn(),
  changeEmailMutate: vi.fn(),
  addUserMutate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-admin-company-users", () => ({
  useAdminCompanyUsers: () => h.users,
  useUserRecoveryAction: () => ({ mutate: h.recoveryMutate, isPending: false }),
  useSetUserActive: () => ({ mutate: h.setActiveMutate, isPending: false }),
  useChangeUserEmail: () => ({ mutate: h.changeEmailMutate, isPending: false }),
  useAddCompanyUser: () => ({ mutate: h.addUserMutate, isPending: false }),
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
      { userId: "u1", action: "password-reset" },
      expect.anything(),
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
      { userId: "u1", action: "resend-verification" },
      expect.anything(),
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
    expect(h.setActiveMutate).toHaveBeenCalledWith(
      { userId: "u1", active: false },
      expect.anything(),
    );
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
      },
      expect.anything(),
    );
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
    expect(h.changeEmailMutate).toHaveBeenCalledWith(
      { userId: "u1", email: "degisen@firma.com" },
      expect.anything(),
    );
  });
});
