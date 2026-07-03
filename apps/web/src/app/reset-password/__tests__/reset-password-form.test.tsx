// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  post: vi.fn(),
  push: vi.fn(),
  token: "a".repeat(64) as string | null,
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  useSearchParams: () => ({
    get: (k: string) => (k === "token" ? h.token : null),
  }),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { post: h.post },
}));

import { ResetPasswordForm } from "../reset-password-form";

beforeEach(() => {
  vi.clearAllMocks();
  h.token = "a".repeat(64);
});

describe("ResetPasswordForm", () => {
  it("token yoksa hata kutusu + YENİ BAĞLANTI linki /company/sifremi-unuttum'a gider", () => {
    h.token = null;
    render(<ResetPasswordForm />);
    expect(screen.getByRole("alert")).toHaveTextContent("Geçersiz bağlantı");
    expect(
      screen.getByRole("link", { name: "Yeni bağlantı iste" }),
    ).toHaveAttribute("href", "/company/sifremi-unuttum");
  });

  it("politika backend ile hizalı: büyük harfsiz parola frontend'de reddedilir (istek atılmaz)", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm />);
    await user.type(screen.getByLabelText("Yeni Parola"), "kucukharf1");
    await user.type(screen.getByLabelText("Parolayı Tekrar"), "kucukharf1");
    await user.click(
      screen.getByRole("button", { name: "Parolayı Değiştir" }),
    );
    expect(
      screen.getByText("En az bir büyük harf içermeli"),
    ).toBeInTheDocument();
    expect(h.post).not.toHaveBeenCalled();
  });

  it("eşleşmeyen parolalar reddedilir", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm />);
    await user.type(screen.getByLabelText("Yeni Parola"), "GucluParola1");
    await user.type(screen.getByLabelText("Parolayı Tekrar"), "Farkli1234");
    await user.click(
      screen.getByRole("button", { name: "Parolayı Değiştir" }),
    );
    expect(screen.getByText("Parolalar eşleşmiyor")).toBeInTheDocument();
    expect(h.post).not.toHaveBeenCalled();
  });

  it("başarılı sıfırlama: token+parola POST edilir, başarı ekranı → /company/login", async () => {
    const user = userEvent.setup();
    h.post.mockResolvedValue({ data: { success: true } });
    render(<ResetPasswordForm />);
    await user.type(screen.getByLabelText("Yeni Parola"), "GucluParola1");
    await user.type(screen.getByLabelText("Parolayı Tekrar"), "GucluParola1");
    await user.click(
      screen.getByRole("button", { name: "Parolayı Değiştir" }),
    );

    expect(h.post).toHaveBeenCalledWith("/auth/password-reset/confirm", {
      token: "a".repeat(64),
      newPassword: "GucluParola1",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Parolanız değiştirildi",
    );
    await user.click(screen.getByRole("button", { name: "Giriş Yap" }));
    expect(h.push).toHaveBeenCalledWith("/company/login");
  });

  it("backend hatası (süresi dolmuş token) alert olarak gösterilir", async () => {
    const user = userEvent.setup();
    h.post.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "Bağlantının süresi dolmuş" } },
    });
    render(<ResetPasswordForm />);
    await user.type(screen.getByLabelText("Yeni Parola"), "GucluParola1");
    await user.type(screen.getByLabelText("Parolayı Tekrar"), "GucluParola1");
    await user.click(
      screen.getByRole("button", { name: "Parolayı Değiştir" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/süresi dolmuş/i);
    // Form ekranda kalır — kullanıcı yeni bağlantı isteyebilir.
    expect(screen.getByLabelText("Yeni Parola")).toBeInTheDocument();
  });
});
