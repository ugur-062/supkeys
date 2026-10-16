// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  clearStore: vi.fn(),
  clearQueries: vi.fn(),
  clearTenant: vi.fn(),
  markLoggingOut: vi.fn(),
}));

vi.mock("@/hooks/use-company-account", () => ({
  useDeleteAccount: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (selector: (s: { clear: () => void }) => unknown) =>
    selector({ clear: h.clearStore }),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ clear: h.clearQueries }) }));
vi.mock("@/lib/company-auth/tenant-storage", () => ({ clearTenantSessionData: h.clearTenant }));
vi.mock("@/lib/company-auth/logout-flag", () => ({ markCompanyLoggingOut: h.markLoggingOut }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DeleteAccountSection } from "../delete-account-section";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("DeleteAccountSection", () => {
  async function openForm() {
    const user = userEvent.setup();
    render(<DeleteAccountSection />);
    await user.click(screen.getByRole("button", { name: "Hesabımı sil" }));
    return user;
  }

  /* Mağaza incelemesi (2026-10-16): silmenin ön koşulları kartta önceden yazılı;
     neyin silinip neyin saklandığı herkese açık sayfada, gizlilik politikası
     uygulama içinden bir dokunuşla açılır (Apple 5.1.1). */
  it("Kurucu devri ve son kullanıcı kuralı yazılı; hesap silme, gizlilik ve kullanıcı yönetimi bağlantıları", () => {
    render(<DeleteAccountSection />);
    expect(screen.getByText(/önce .*kuruculuğu devredin/)).toBeInTheDocument();
    // Pasif kullanıcı da devri gerektirir (API `others` deletedAt=null sayar).
    expect(screen.getByText(/pasif olanlar dahil/)).toBeInTheDocument();
    expect(screen.getByText(/süren sipariş ya da açık talep varken bu yapılamaz/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kullanıcı Yönetimi" })).toHaveAttribute("href", "/company/ayarlar/kullanicilar");
    expect(screen.getByRole("link", { name: "Hesap silme" })).toHaveAttribute("href", "/hesap-silme");
    expect(screen.getByRole("link", { name: "Gizlilik Politikası" })).toHaveAttribute("href", "/sozlesmeler/gizlilik");
    // Gövde artık "kişisel bilgileriniz olmadan" demiyor: mesajlarda gönderen adı kalıyor.
    expect(screen.queryByText(/kişisel bilgileriniz olmadan/)).toBeNull();
    // Koşulu yerine getiremeyen için destek yolu (Google Play: ek adım varsa destek yolu).
    expect(screen.getByRole("link", { name: "kvkk@rothern.com" })).toHaveAttribute("href", "mailto:kvkk@rothern.com");
  });

  it("şifre alanı ancak düğmeye basınca açılır; boş şifreyle istek atılmaz", async () => {
    render(<DeleteAccountSection />);
    expect(screen.queryByLabelText("Onaylamak için şifreniz")).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Hesabımı sil" }));
    await user.click(screen.getByRole("button", { name: "Hesabımı kalıcı olarak sil" }));
    expect(screen.getByText("Şifrenizi girin")).toBeInTheDocument();
    expect(h.mutateAsync).not.toHaveBeenCalled();
  });

  it("sunucu reddi satır içinde gösterilir, oturum temizlenmez", async () => {
    window.localStorage.setItem("rothern:push-token", "fcm-token-1");
    h.mutateAsync.mockRejectedValueOnce(
      new AxiosError("403", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 403,
        data: { message: "Mevcut şifre hatalı" },
      } as never),
    );
    const user = await openForm();
    await user.type(screen.getByLabelText("Onaylamak için şifreniz"), "Yanlis!Sifre12");
    await user.click(screen.getByRole("button", { name: "Hesabımı kalıcı olarak sil" }));
    expect(await screen.findByText("Mevcut şifre hatalı")).toBeInTheDocument();
    expect(h.clearStore).not.toHaveBeenCalled();
    expect(h.clearTenant).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("rothern:push-token")).toBe("fcm-token-1");
  });

  it("başarıda şifre gönderilir ve istemci oturumu çıkıştaki gibi temizlenir", async () => {
    // Mobil kabuk: sunucu cihaz kayıtlarını hesapla birlikte sildi; yerel belirteç de gider.
    window.localStorage.setItem("rothern:push-token", "fcm-token-1");
    h.mutateAsync.mockResolvedValueOnce({ ok: true, companyClosed: false });
    const user = await openForm();
    await user.type(screen.getByLabelText("Onaylamak için şifreniz"), "Dogru!Sifre12");
    await user.click(screen.getByRole("button", { name: "Hesabımı kalıcı olarak sil" }));
    expect(h.mutateAsync).toHaveBeenCalledWith({ password: "Dogru!Sifre12" });
    expect(h.markLoggingOut).toHaveBeenCalled();
    expect(h.clearStore).toHaveBeenCalled();
    expect(h.clearQueries).toHaveBeenCalled();
    expect(h.clearTenant).toHaveBeenCalled();
    expect(window.localStorage.getItem("rothern:push-token")).toBeNull();
    // Onay tam sayfa yüklemesini aşar: giriş sayfası okur ("Hesabınız silindi").
    expect(window.sessionStorage.getItem("rothern.account-deleted-notice")).toBe("1");
  });

  it("sunucu reddinde onay işareti yazılmaz", async () => {
    h.mutateAsync.mockRejectedValueOnce(
      new AxiosError("400", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        data: { code: "ACCOUNT_HAS_OPEN_WORK", message: "Süren siparişleriniz varken hesap silinemez." },
      } as never),
    );
    const user = await openForm();
    await user.type(screen.getByLabelText("Onaylamak için şifreniz"), "Dogru!Sifre12");
    await user.click(screen.getByRole("button", { name: "Hesabımı kalıcı olarak sil" }));
    expect(await screen.findByText("Süren siparişleriniz varken hesap silinemez.")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("rothern.account-deleted-notice")).toBeNull();
  });

  it("Vazgeç yazılan şifreyi ve hatayı siler", async () => {
    const user = await openForm();
    await user.type(screen.getByLabelText("Onaylamak için şifreniz"), "abc");
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByLabelText("Onaylamak için şifreniz")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Hesabımı sil" }));
    expect(screen.getByLabelText("Onaylamak için şifreniz")).toHaveValue("");
  });

  // Mobil denetim 2026-10 g11: "Vazgeç" tek başına kalıp silme düğmesi alta kırılıyordu.
  it("telefonda iki düğme tam genişlik alt alta, silme üstte; sm ve üstünde sağda yan yana", async () => {
    await openForm();
    const del = screen.getByRole("button", { name: "Hesabımı kalıcı olarak sil" });
    const cancel = screen.getByRole("button", { name: "Vazgeç" });
    const row = del.parentElement!;
    expect(cancel.parentElement).toBe(row);
    expect(row.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["flex-col-reverse", "*:w-full", "sm:flex-row", "sm:justify-end", "sm:*:w-auto"]),
    );
    // DOM: Vazgeç önce → col-reverse ile silme üstte görünür.
    expect(cancel.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
