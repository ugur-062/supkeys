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
  eraseMutate: vi.fn<(userId: string) => Promise<unknown>>(() =>
    Promise.resolve({ ok: true, companyClosed: false, alreadyRemoved: false }),
  ),
  preview: { data: undefined as unknown, isError: false, refetch: vi.fn() },
  previewUserId: null as string | null,
  role: "SALES" as string,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-admin-company-users", () => ({
  useAdminCompanyUsers: () => h.users,
  useUserRecoveryAction: () => ({ mutate: h.recoveryMutate, mutateAsync: (...a: unknown[]) => { (h.recoveryMutate as (...x: unknown[]) => unknown)(...a); return Promise.resolve(undefined); }, isPending: false }),
  useSetUserActive: () => ({ mutateAsync: h.setActiveMutate, isPending: false }),
  useChangeUserEmail: () => ({ mutateAsync: h.changeEmailMutate, isPending: false }),
  useAddCompanyUser: () => ({ mutate: h.addUserMutate, mutateAsync: (...a: unknown[]) => { (h.addUserMutate as (...x: unknown[]) => unknown)(...a); return Promise.resolve(undefined); }, isPending: false }),
  useEraseCompanyUser: () => ({ mutateAsync: h.eraseMutate, isPending: false }),
  useEraseUserPreview: (_companyId: string, userId: string | null) => {
    h.previewUserId = userId;
    return userId ? h.preview : { data: undefined, isError: false, refetch: vi.fn() };
  },
}));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: { role: h.role } }),
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

/** API `adminErasurePreview` yanıtı — varsayılan: silinebilir, ekipte bir üye. */
function preview(over: Record<string, unknown> = {}) {
  return {
    name: "Kişi U1",
    email: "u1@firma.com",
    lastKnownEmail: null,
    removedAt: null,
    nothingLeft: false,
    closesCompany: false,
    companySuspension: null,
    sameNameCount: 0,
    blocker: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.role = "SALES";
  h.users = { data: [user("u1")], isLoading: false, isError: false };
  h.preview = { data: preview(), isError: false, refetch: vi.fn() };
  h.previewUserId = null;
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

/**
 * KVKK SİLME TALEBİ (2026-10-16): metinler giriş yapamayan kişiye kvkk@ yolunu
 * vaat ediyor; operatör bunu SQL'siz yapar. Geri alınamaz → yalnız SUPER_ADMIN;
 * ekipten çıkarılmış hesapta kalan ad / telefon için de çıkar; kural retleri
 * admin cümlesiyle.
 */
describe("UsersTab — KVKK silme talebi", () => {
  it("SALES menüde KVKK silmesini görmez", async () => {
    const uev = userEvent.setup();
    render(<UsersTab companyId="c1" />);
    await uev.click(screen.getByRole("button", { name: "u1@firma.com işlemleri" }));
    expect(screen.queryByRole("menuitem", { name: /KVKK/ })).toBeNull();
  });

  it("SUPER_ADMIN: menü → onay penceresi; Vazgeç'te istek gitmez, onayda gider", async () => {
    h.role = "SUPER_ADMIN";
    const uev = userEvent.setup();
    render(<UsersTab companyId="c1" />);
    await uev.click(screen.getByRole("button", { name: "u1@firma.com işlemleri" }));
    await uev.click(await screen.findByRole("menuitem", { name: "KVKK: Hesabı Sil" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Geri alınamaz/)).toBeInTheDocument();
    await uev.click(within(dialog).getByRole("button", { name: "Vazgeç" }));
    expect(h.eraseMutate).not.toHaveBeenCalled();
    await uev.click(screen.getByRole("button", { name: "u1@firma.com işlemleri" }));
    await uev.click(await screen.findByRole("menuitem", { name: "KVKK: Hesabı Sil" }));
    await uev.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Kalıcı Olarak Sil" }));
    expect(h.eraseMutate).toHaveBeenCalledWith("u1");
    expect(h.toast.success).toHaveBeenCalledWith("Hesap silindi");
  });

  it("kural reddi (Kurucu devri) admin cümlesiyle gösterilir", async () => {
    h.role = "SUPER_ADMIN";
    const { AxiosError } = await import("axios");
    h.eraseMutate.mockRejectedValueOnce(
      new AxiosError("400", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        data: { code: "ACCOUNT_OWNER_MUST_TRANSFER", message: "Hesabınızı silmeden önce…" },
      } as never),
    );
    const uev = userEvent.setup();
    render(<UsersTab companyId="c1" />);
    await uev.click(screen.getByRole("button", { name: "u1@firma.com işlemleri" }));
    await uev.click(await screen.findByRole("menuitem", { name: "KVKK: Hesabı Sil" }));
    await uev.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Kalıcı Olarak Sil" }));
    // Önleyicinin bastığı API iletisinin YERİNE (aynı kimlik) — iki toast çıkmaz.
    expect(h.toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/^Kurucu silinemez/),
      expect.objectContaining({ id: "api-error:Hesabınızı silmeden önce…" }),
    );
  });

  /* İnceleme 2026-10-16: silme yalnız bir e-postaya dayanır. Giriş yapabilen
     hesap kişinin kendisi tarafından uygulamada silinir; askıdaki firmanın son
     kullanıcısı silinirse askı kaydının yerine kapanış yazılırdı. API 409 verir,
     pencere onayı hiç sunmaz ve nedenini yazar. */
  it("giriş yapabilen hesap: onay pasif, kişinin uygulamadan silmesi söylenir", async () => {
    h.role = "SUPER_ADMIN";
    h.preview = { data: preview({ blocker: "ACCOUNT_CAN_SIGN_IN" }), isError: false, refetch: vi.fn() };
    const uev = userEvent.setup();
    render(<UsersTab companyId="c1" />);
    await uev.click(screen.getByRole("button", { name: "u1@firma.com işlemleri" }));
    await uev.click(await screen.findByRole("menuitem", { name: "KVKK: Hesabı Sil" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("erase-blocker")).toHaveTextContent(/hâlâ giriş yapabiliyor/);
    expect(within(dialog).getByRole("button", { name: "Kalıcı Olarak Sil" })).toBeDisabled();
    expect(h.eraseMutate).not.toHaveBeenCalled();
  });

  it("askıdaki firmanın son kullanıcısı: onay pasif, önce askı kararı", async () => {
    h.role = "SUPER_ADMIN";
    h.preview = {
      data: preview({
        blocker: "ACCOUNT_COMPANY_SUSPENDED",
        closesCompany: true,
        companySuspension: { reason: "Dolandırıcılık şüphesi", since: "2026-09-01T10:00:00.000Z" },
      }),
      isError: false,
      refetch: vi.fn(),
    };
    const uev = userEvent.setup();
    render(<UsersTab companyId="c1" />);
    await uev.click(screen.getByRole("button", { name: "u1@firma.com işlemleri" }));
    await uev.click(await screen.findByRole("menuitem", { name: "KVKK: Hesabı Sil" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("erase-blocker")).toHaveTextContent(/Önce askı kararını sonuçlandırın/);
    expect(within(dialog).getByRole("button", { name: "Kalıcı Olarak Sil" })).toBeDisabled();
  });

  it("ekipten çıkarılmış hesap: yer tutucu yerine son kullandığı adres, çıkarılma tarihi, aynı ad uyarısı; o adrese yazarak doğrulama", async () => {
    h.role = "SUPER_ADMIN";
    h.users = {
      data: [user("u1", { deletedAt: "2026-09-01T10:00:00.000Z", isActive: false, email: "deleted-u1@deleted.rothern" })],
      isLoading: false,
      isError: false,
    };
    h.preview = {
      data: preview({
        email: null,
        lastKnownEmail: "ayse@firma.com",
        removedAt: "2026-09-01T10:00:00.000Z",
        sameNameCount: 1,
      }),
      isError: false,
      refetch: vi.fn(),
    };
    const uev = userEvent.setup();
    render(<UsersTab companyId="c1" />);
    await uev.click(screen.getByRole("button", { name: "KVKK: Kişisel Verileri Sil" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("ayse@firma.com");
    expect(dialog).not.toHaveTextContent("deleted-u1@deleted.rothern");
    expect(dialog).toHaveTextContent("Ekipten çıkarılma");
    expect(dialog).toHaveTextContent(/aynı adı taşıyan 1 kayıt daha var/);
    expect(dialog).toHaveTextContent(/yukarıdaki son kullanılan adrese/);
    expect(dialog).toHaveTextContent(/gönderen adresi\s+tek başına kanıt değildir/);
    await uev.click(within(dialog).getByRole("button", { name: "Kalıcı Olarak Sil" }));
    expect(h.eraseMutate).toHaveBeenCalledWith("u1");
  });

  it("ekipten çıkarılmış hesapta yalnız KVKK düğmesi; silinmiş (yer tutucu adlı) hesapta hiç işlem yok", () => {
    h.role = "SUPER_ADMIN";
    h.users = {
      data: [
        user("u1", { deletedAt: "2026-10-01T00:00:00.000Z", isActive: false }),
        user("u2", {
          deletedAt: "2026-10-01T00:00:00.000Z",
          isActive: false,
          firstName: "Silinmiş",
          lastName: "Kullanıcı",
        }),
      ],
      isLoading: false,
      isError: false,
    };
    render(<UsersTab companyId="c1" />);
    expect(screen.getAllByRole("button", { name: "KVKK: Kişisel Verileri Sil" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Şifre/ })).toBeNull();
  });
});
