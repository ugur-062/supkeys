// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  users: [] as unknown[],
  usersLoading: false,
  invitations: [] as unknown[],
  invite: vi.fn(),
  setActive: vi.fn(),
  removeUser: vi.fn(),
  cancel: vi.fn(),
  resend: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-users", () => ({
  useCompanyUsers: () => ({ data: h.users, isLoading: h.usersLoading }),
  useCompanyInvitations: () => ({ data: h.invitations }),
  useInviteUser: () => ({ mutateAsync: h.invite, isPending: false }),
  useCancelInvitation: () => ({ mutateAsync: h.cancel, isPending: false }),
  useResendInvitation: () => ({ mutateAsync: h.resend, isPending: false }),
  useSetUserActive: () => ({ mutateAsync: h.setActive, isPending: false }),
  useRemoveUser: () => ({ mutateAsync: h.removeUser, isPending: false }),
  useUpdateUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateUserPermissions: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePermissionCatalog: () => ({ data: undefined }),
  useSeats: () => ({ data: undefined }),
  useSeatSelection: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { CompanyUsersSection } from "../company-users-section";

function user(over: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "ada@firma.com",
    firstName: "Ada",
    lastName: "Yılmaz",
    phone: null,
    roles: ["SATIN_ALMACI"],
    isOwner: false,
    isActive: true,
    lastLoginAt: null,
    rolePermissions: [],
    permissionsOverride: { added: [], removed: [] },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.usersLoading = false;
  h.users = [
    user({ id: "owner", email: "sahip@firma.com", firstName: "Umut", isOwner: true, roles: ["SAHIP"] }),
    user(),
  ];
  h.invitations = [];
});

describe("CompanyUsersSection", () => {
  it("kullanıcı listesi: isim, e-posta, rol rozeti ve sahip etiketi", () => {
    render(<CompanyUsersSection canManage meId="owner" />);
    expect(screen.getByText("Kullanıcılar (2)")).toBeInTheDocument();
    expect(screen.getByText("ada@firma.com")).toBeInTheDocument();
    // Rol rozetleri Türkçe etiketle.
    expect(screen.getByText("Satın Almacı")).toBeInTheDocument();
    // Kurucu için rol rozeti "Kurucu".
    expect(screen.getAllByText("Kurucu").length).toBeGreaterThanOrEqual(1);
    // Aktif durum rozeti.
    expect(screen.getAllByText("Aktif").length).toBeGreaterThanOrEqual(1);
  });

  it("yükleniyorken 'Yükleniyor…' gösterir", () => {
    h.usersLoading = true;
    h.users = [];
    render(<CompanyUsersSection canManage meId="owner" />);
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
  });

  it("canManage: 'Üye Davet Et' butonu görünür ve davet dialogunu açar", async () => {
    const user2 = userEvent.setup();
    render(<CompanyUsersSection canManage meId="owner" />);
    const inviteBtn = screen.getByRole("button", { name: "Üye Davet Et" });
    await user2.click(inviteBtn);
    // Davet dialogu içeriği görünür.
    expect(
      await screen.findByPlaceholderText("kisi@firma.com"),
    ).toBeInTheDocument();
  });

  it("davet dialogu: e-posta girip gönderince useInviteUser çağrılır", async () => {
    const user2 = userEvent.setup();
    h.invite.mockResolvedValue({});
    render(<CompanyUsersSection canManage meId="owner" />);
    await user2.click(screen.getByRole("button", { name: "Üye Davet Et" }));
    const email = await screen.findByPlaceholderText("kisi@firma.com");
    await user2.type(email, "yeni@firma.com");
    await user2.click(screen.getByRole("button", { name: /Davet Gönder/ }));

    expect(h.invite).toHaveBeenCalledWith({
      email: "yeni@firma.com",
      roles: ["SATIN_ALMACI"],
    });
  });

  it("canManage=false: davet butonu ve aksiyon menüsü gizli", () => {
    render(<CompanyUsersSection canManage={false} meId="owner" />);
    expect(
      screen.queryByRole("button", { name: "Üye Davet Et" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Aksiyonlar" }),
    ).not.toBeInTheDocument();
  });

  it("kendisi olmayan üye için aksiyon menüsü butonu görünür", () => {
    render(<CompanyUsersSection canManage meId="owner" />);
    // owner=me → menü yok; u1 (ada) me değil → menü var.
    expect(
      screen.getByRole("button", { name: "Aksiyonlar" }),
    ).toBeInTheDocument();
  });

  it("bekleyen davetler render edilir (canManage)", () => {
    h.invitations = [
      {
        id: "inv1",
        email: "bekleyen@firma.com",
        roles: ["SATISCI"],
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        invitedByName: "Umut",
        createdAt: new Date().toISOString(),
      },
    ];
    render(<CompanyUsersSection canManage meId="owner" />);
    expect(screen.getByText("Bekleyen Davetler (1)")).toBeInTheDocument();
    expect(screen.getByText("bekleyen@firma.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Yeniden Gönder" }),
    ).toBeInTheDocument();
  });

  it("bekleyen davet: yeniden gönder → useResendInvitation çağrılır", async () => {
    const user2 = userEvent.setup();
    h.resend.mockResolvedValue({});
    h.invitations = [
      {
        id: "inv1",
        email: "bekleyen@firma.com",
        roles: ["SATISCI"],
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        invitedByName: "Umut",
        createdAt: new Date().toISOString(),
      },
    ];
    render(<CompanyUsersSection canManage meId="owner" />);
    await user2.click(screen.getByRole("button", { name: "Yeniden Gönder" }));
    expect(h.resend).toHaveBeenCalledWith("inv1");
  });
});
