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
});

describe("DeleteAccountSection", () => {
  async function openForm() {
    const user = userEvent.setup();
    render(<DeleteAccountSection />);
    await user.click(screen.getByRole("button", { name: "Hesabımı sil" }));
    return user;
  }

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
