// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
  update: vi.fn(),
  setPermissions: vi.fn(),
  seats: undefined as unknown,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  permissionCatalog: {
    data: {
      catalog: [
        { key: "buy:view", label: "Satınalma görüntüleme", group: "buy", seat: false },
        { key: "buy:listing:manage", label: "Talep açma ve yönetme", group: "buy", seat: true },
        { key: "sell:view", label: "Satış görüntüleme", group: "sell", seat: false },
        { key: "sell:bid:submit", label: "Teklif verme", group: "sell", seat: true },
        { key: "approval:act", label: "Onaylama", group: "approval", seat: false },
        { key: "users:manage", label: "Kullanıcı ve yetki", group: "management", seat: false, ownerGrantsOnly: true },
      ],
      groups: { buy: "Satınalma", sell: "Satış", approval: "Onay", management: "Yönetim" },
      presets: {
        SATIN_ALMACI: ["buy:view", "buy:listing:manage"],
        SATISCI: ["sell:view", "sell:bid:submit"],
        ONAYLAYICI: ["approval:act"],
        YONETICI: ["buy:view", "sell:view", "approval:act", "users:manage"],
        GORUNTULEYICI: ["buy:view", "sell:view"],
      },
      roleDefaults: {},
    },
  },
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
  useUpdateUser: () => ({ mutateAsync: h.update, isPending: false }),
  useUpdateUserPermissions: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetUserPermissions: () => ({ mutateAsync: h.setPermissions, isPending: false }),
  // Yetki tablosu (Faz 4): davet dialogu kataloğun hazır setiyle dolar.
  // Referans SABİT (react-query verisi gibi): her render'da yeni nesne,
  // gerçekte olmayan bir kimlik değişimi üretir.
  usePermissionCatalog: () => h.permissionCatalog,
  useSeats: () => ({ data: h.seats }),
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
  h.seats = undefined;
});

/** Koltuk özeti — `tier` paket kapısını (satınalma yalnız GOLD) sürer. */
function seats(tier: "STANDART" | "SILVER" | "GOLD", used = 1) {
  const limit = { STANDART: 2, SILVER: 4, GOLD: 6 }[tier];
  return { limit, used, usedBuy: 0, usedSell: used, pendingSeatInvites: 0, pendingBuy: 0, pendingSell: 0, overflow: 0, tier };
}

describe("CompanyUsersSection", () => {
  it("kullanıcı listesi: isim, e-posta, rol rozeti ve sahip etiketi", () => {
    render(<CompanyUsersSection canManage meId="owner" />);
    expect(screen.getByText("Kullanıcılar (2)")).toBeInTheDocument();
    expect(screen.getByText("ada@firma.com")).toBeInTheDocument();
    // Rol rozetleri Türkçe etiketle.
    // Dar ekran kopyası (sm:hidden) da DOM'da (O-111).
    expect(screen.getAllByText("Satın Almacı").length).toBeGreaterThanOrEqual(1);
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
    h.seats = seats("GOLD");
    h.invite.mockResolvedValue({});
    render(<CompanyUsersSection canManage meId="owner" />);
    await user2.click(screen.getByRole("button", { name: "Üye Davet Et" }));
    const email = await screen.findByPlaceholderText("kisi@firma.com");
    await user2.type(email, "yeni@firma.com");
    await user2.click(screen.getByRole("button", { name: /Davet Gönder/ }));

    expect(h.invite).toHaveBeenCalledWith({
      email: "yeni@firma.com",
      // Davet dili varsayılanı arayüz dili (2026-09-27).
      locale: "tr",
      permissions: expect.arrayContaining(["buy:listing:manage"]),
    });
  });

  it("davet dialogu Gold DEĞİLSE satınalma yetkisi seçmez: varsayılan Satışçı, davet paket kapısına takılmaz (derin denetim MU-13)", async () => {
    const user2 = userEvent.setup();
    h.seats = seats("STANDART");
    h.invite.mockResolvedValue({});
    render(<CompanyUsersSection canManage meId="owner" />);
    await user2.click(screen.getByRole("button", { name: "Üye Davet Et" }));
    await user2.type(await screen.findByPlaceholderText("kisi@firma.com"), "yeni@firma.com");
    await user2.click(screen.getByRole("button", { name: /Davet Gönder/ }));
    expect(h.invite).toHaveBeenCalledTimes(1);
    const sent = h.invite.mock.calls[0][0].permissions as string[];
    expect(sent).toEqual(["sell:view", "sell:bid:submit"]);
    expect(sent).not.toContain("buy:listing:manage");
  });

  it("kuruculuk devri: Gold değilse eski Kurucuya satınalma rolü SUNULMAZ (derin denetim MU-13)", async () => {
    const u = userEvent.setup();
    h.seats = seats("STANDART");
    h.update.mockResolvedValue({ ok: true });
    render(<CompanyUsersSection canManage meId="owner" />);
    const menus = screen.getAllByRole("button", { name: "Aksiyonlar" });
    await u.click(menus[1]);
    await u.click(await screen.findByText("Düzenle"));
    await u.click(await screen.findByRole("button", { name: "Kuruculuğu bu kullanıcıya devret" }));
    await u.click(screen.getByRole("button", { name: "Devir sonrası rolünüz" }));
    const options = within(await screen.findByRole("listbox")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Yönetici (yönetim; işlem yok)", "Satışçı (yalnız satış)"]);
  });

  it("kuruculuk devri: Gold'da dört seçenek de sunulur", async () => {
    const u = userEvent.setup();
    h.seats = seats("GOLD");
    render(<CompanyUsersSection canManage meId="owner" />);
    const menus = screen.getAllByRole("button", { name: "Aksiyonlar" });
    await u.click(menus[1]);
    await u.click(await screen.findByText("Düzenle"));
    await u.click(await screen.findByRole("button", { name: "Kuruculuğu bu kullanıcıya devret" }));
    await u.click(screen.getByRole("button", { name: "Devir sonrası rolünüz" }));
    expect(within(await screen.findByRole("listbox")).getAllByRole("option")).toHaveLength(4);
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

  it("aksiyon menüsü kendi satırında da görünür; yıkıcı aksiyonlar kendine kapalı", async () => {
    const user2 = userEvent.setup();
    render(<CompanyUsersSection canManage meId="owner" />);
    // Her iki satırda da menü var — kurucu kendi rollerini (SA/ST koltuk)
    // düzenleyebilmeli.
    const menus = screen.getAllByRole("button", { name: "Aksiyonlar" });
    expect(menus).toHaveLength(2);
    // Kendi satırında Düzenle var; Pasif Yap / Çıkar yok.
    await user2.click(menus[0]);
    expect(await screen.findByText("Düzenle")).toBeInTheDocument();
    expect(screen.queryByText("Pasif Yap")).not.toBeInTheDocument();
    expect(screen.queryByText("Çıkar")).not.toBeInTheDocument();
  });

  it("düzenle: değişiklik yokken Kaydet pasif; boş ad satır içi hata (toast değil), tek harf geçerli", async () => {
    const u = userEvent.setup();
    render(<CompanyUsersSection canManage meId="owner" />);
    const menus = screen.getAllByRole("button", { name: "Aksiyonlar" });
    await u.click(menus[1]);
    await u.click(await screen.findByText("Düzenle"));
    const save = await screen.findByRole("button", { name: "Kaydet" });
    expect(save).toBeDisabled();
    const ad = screen.getByLabelText("Ad");
    await u.clear(ad);
    await u.type(ad, "A");
    expect(save).toBeEnabled();
    // Tek harfli ad meşru (Çin, Kore …) — hata çizilmez.
    expect(screen.queryByText("Ad boş olamaz")).not.toBeInTheDocument();
    await u.clear(ad);
    await u.type(ad, " ");
    await u.click(save);
    expect(await screen.findByText("Ad boş olamaz")).toBeInTheDocument();
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it("Kurucu olmayan yönetici kendi satırında yetki tablosunu düzenleyemez (backend assertNotSelf aynası)", async () => {
    h.users = [
      user({ id: "owner", email: "sahip@firma.com", firstName: "Umut", isOwner: true, roles: ["SAHIP"] }),
      user({ id: "yon", email: "yon@firma.com", firstName: "Yön", roles: ["YONETICI"], permissions: ["users:manage"] }),
    ];
    const u = userEvent.setup();
    render(<CompanyUsersSection canManage meId="yon" />);
    const menus = screen.getAllByRole("button", { name: "Aksiyonlar" });
    await u.click(menus[1]);
    await u.click(await screen.findByText("Düzenle"));
    expect(await screen.findByText(/Kendi yetkilerinizi düzenleyemezsiniz/)).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.every((b) => (b as HTMLInputElement).disabled || b.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("Kurucu olmayan yönetici Kurucunun yetki tablosunu düzenleyemez (backend setPermissions aynası, derin denetim LU-20)", async () => {
    h.users = [
      user({ id: "owner", email: "sahip@firma.com", firstName: "Umut", isOwner: true, roles: ["SAHIP"], permissions: ["sell:bid:submit"] }),
      user({ id: "yon", email: "yon@firma.com", firstName: "Yön", roles: ["YONETICI"], permissions: ["users:manage"] }),
    ];
    const u = userEvent.setup();
    render(<CompanyUsersSection canManage meId="yon" />);
    const menus = screen.getAllByRole("button", { name: "Aksiyonlar" });
    await u.click(menus[0]);
    await u.click(await screen.findByText("Düzenle"));
    expect(await screen.findByText("Kurucunun yetkilerini yalnız Kurucu düzenleyebilir.")).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.every((b) => (b as HTMLInputElement).disabled || b.getAttribute("aria-disabled") === "true")).toBe(true);
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

  it("Pasif Yap onay sorar ve yan etkisini yazar; Vazgeç istek atmaz, onay atar (arayüz testi D-302)", async () => {
    const u = userEvent.setup();
    h.setActive.mockResolvedValue({ ok: true });
    render(<CompanyUsersSection canManage meId="owner" />);
    const menus = screen.getAllByRole("button", { name: "Aksiyonlar" });
    await u.click(menus[1]);
    await u.click(await screen.findByText("Pasif Yap"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/devredilir/)).toBeInTheDocument();
    expect(h.setActive).not.toHaveBeenCalled();
    await u.click(within(dialog).getByRole("button", { name: "Vazgeç" }));
    expect(h.setActive).not.toHaveBeenCalled();

    await u.click(screen.getAllByRole("button", { name: "Aksiyonlar" })[1]);
    await u.click(await screen.findByText("Pasif Yap"));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Pasif Yap" }));
    expect(h.setActive).toHaveBeenCalledWith({ id: "u1", active: false });
  });

  it("Pasif Yap onayı: koltuk maddesi API davranışını yazar; hızlı çift tıklama tek istek atar (FX-00)", async () => {
    const u = userEvent.setup();
    let resolve!: (v: unknown) => void;
    h.setActive.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<CompanyUsersSection canManage meId="owner" />);
    await u.click(screen.getAllByRole("button", { name: "Aksiyonlar" })[1]);
    await u.click(await screen.findByText("Pasif Yap"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/yetkileri korunur/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Pasif Yap" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(h.setActive).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true }));
    expect(h.toast.success).toHaveBeenCalledTimes(1);
  });

  it("Daveti iptal et onayı: hızlı çift tıklama tek istek atar (FX-00)", async () => {
    let resolve!: (v: unknown) => void;
    h.cancel.mockReturnValue(new Promise((r) => (resolve = r)));
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
    fireEvent.click(screen.getByRole("button", { name: "Daveti iptal et" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Daveti iptal et" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(h.cancel).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true }));
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it("pasif kullanıcıyı tekrar aktif etmek onaysız (yan etkisi yok)", async () => {
    const u = userEvent.setup();
    h.setActive.mockResolvedValue({ ok: true });
    h.users = [
      user({ id: "owner", email: "sahip@firma.com", firstName: "Umut", isOwner: true, roles: ["SAHIP"] }),
      user({ isActive: false }),
    ];
    render(<CompanyUsersSection canManage meId="owner" />);
    await u.click(screen.getAllByRole("button", { name: "Aksiyonlar" })[1]);
    await u.click(await screen.findByText("Tekrar Aktif Et"));
    expect(h.setActive).toHaveBeenCalledWith({ id: "u1", active: true });
  });

  it("bekleyen daveti iptal etmek onay sorar (arayüz testi D-302)", async () => {
    const u = userEvent.setup();
    h.cancel.mockResolvedValue({ ok: true });
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
    await u.click(screen.getByRole("button", { name: "Daveti iptal et" }));
    expect(h.cancel).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("bekleyen@firma.com")).toBeInTheDocument();
    await u.click(within(dialog).getByRole("button", { name: "Daveti iptal et" }));
    expect(h.cancel).toHaveBeenCalledWith("inv1");
  });

  it("düzenle: yetki isteği reddedilirse ad hiç gönderilmez — yarım kayıt yok (arayüz testi O-110)", async () => {
    const u = userEvent.setup();
    h.seats = seats("GOLD");
    h.setPermissions.mockRejectedValue(new Error("Koltuk dolu"));
    render(<CompanyUsersSection canManage meId="owner" />);
    await u.click(screen.getAllByRole("button", { name: "Aksiyonlar" })[1]);
    await u.click(await screen.findByText("Düzenle"));
    const ad = screen.getByLabelText("Ad");
    await u.clear(ad);
    await u.type(ad, "Ayşe");
    // Satır yazısına tıklamak kutuyu işaretler (D-134).
    await u.click(screen.getByText("Onaylama"));
    await u.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.setPermissions).toHaveBeenCalledTimes(1);
    expect(h.setPermissions.mock.calls[0][0].permissions).toContain("approval:act");
    expect(h.update).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalledWith("Koltuk dolu");
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it("düzenle: yetki kaydedilip kişi bilgisi düşerse bu açıkça söylenir", async () => {
    const u = userEvent.setup();
    h.seats = seats("GOLD");
    h.setPermissions.mockResolvedValue({ ok: true });
    h.update.mockRejectedValue(new Error("Ağ hatası"));
    render(<CompanyUsersSection canManage meId="owner" />);
    await u.click(screen.getAllByRole("button", { name: "Aksiyonlar" })[1]);
    await u.click(await screen.findByText("Düzenle"));
    const ad = screen.getByLabelText("Ad");
    await u.clear(ad);
    await u.type(ad, "Ayşe");
    await u.click(screen.getByText("Onaylama"));
    await u.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.setPermissions).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.toast.error).toHaveBeenCalledWith(
      "Yetkiler kaydedildi, ancak kişi bilgileri kaydedilemedi: Ağ hatası",
    );
  });

  it("koltuk seçimi: Gold altında satınalma koltuğu satırı listelenmez (O-069 diyalog kısmı)", async () => {
    const u = userEvent.setup();
    h.users = [
      user({ id: "owner", email: "sahip@firma.com", firstName: "Umut", isOwner: true, roles: ["SAHIP", "SATIN_ALMACI", "SATISCI"] }),
      user({ roles: ["SATIN_ALMACI", "SATISCI"] }),
    ];
    h.seats = { ...seats("SILVER", 5), overflow: 1 };
    render(<CompanyUsersSection canManage meId="owner" />);
    await u.click(screen.getByRole("button", { name: "Kalacak Koltukları Seç" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText(/Satınalma koltuğu/)).not.toBeInTheDocument();
    expect(within(dialog).getAllByText(/Satış koltuğu/)).toHaveLength(2);
  });
});
