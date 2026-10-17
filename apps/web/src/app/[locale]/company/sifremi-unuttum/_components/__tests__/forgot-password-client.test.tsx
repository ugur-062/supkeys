// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("@/lib/company-auth/api", () => ({ companyApi: { post: h.post } }));

import { CompanyForgotPasswordClient } from "../forgot-password-client";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CompanyForgotPasswordClient", () => {
  it("e-posta normalize edilir (trim+lowercase) ve generic başarı mesajı gösterilir", async () => {
    const user = userEvent.setup();
    h.post.mockResolvedValue({ data: { success: true } });
    render(<CompanyForgotPasswordClient />);

    await user.type(screen.getByLabelText("E-posta"), "  Ada@Firma.COM  ");
    await user.click(
      screen.getByRole("button", { name: "Sıfırlama bağlantısı gönder" }),
    );

    expect(h.post).toHaveBeenCalledWith("/company-auth/forgot-password", {
      email: "ada@firma.com",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      /Eğer bu e-posta kayıtlıysa/,
    );
  });

  it("ağ hatasında 'gönderildi' DENMEZ: hata gösterilir, form kalır (derin denetim LU-22)", async () => {
    const user = userEvent.setup();
    h.post.mockRejectedValue(new AxiosError("Network Error"));
    render(<CompanyForgotPasswordClient />);

    await user.type(screen.getByLabelText("E-posta"), "biri@firma.com");
    await user.click(
      screen.getByRole("button", { name: "Sıfırlama bağlantısı gönder" }),
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Bağlantı gönderilemedi");
    // Yeniden denenebilir.
    expect(
      screen.getByRole("button", { name: "Sıfırlama bağlantısı gönder" }),
    ).toBeEnabled();
  });

  it("429 hız sınırı: sunucu mesajı gösterilir, 'gönderildi' denmez", async () => {
    const user = userEvent.setup();
    const err = new AxiosError("Too Many Requests");
    err.response = {
      status: 429,
      data: { message: "Çok fazla istek" },
    } as AxiosError["response"];
    h.post.mockRejectedValue(err);
    render(<CompanyForgotPasswordClient />);

    await user.type(screen.getByLabelText("E-posta"), "biri@firma.com");
    await user.click(
      screen.getByRole("button", { name: "Sıfırlama bağlantısı gönder" }),
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Çok fazla istek");
  });

  // Arayüz testi 2026-10 login-6: "abc" yazınca düğme sessizce pasif kalıyor,
  // Enter hiçbir şey yapmıyordu. Düğme açık; basınca sayfa dilinde alan hatası.
  it("geçersiz e-posta: düğme AÇIK, basınca alan hatası + odak, istek atılmaz", async () => {
    const user = userEvent.setup();
    render(<CompanyForgotPasswordClient />);
    const email = screen.getByLabelText("E-posta");
    const submit = screen.getByRole("button", { name: "Sıfırlama bağlantısı gönder" });
    expect(email.closest("form")).toHaveAttribute("novalidate");
    expect(submit).toBeEnabled();
    for (const bad of ["abc", "abc@", "a b@c.com"]) {
      await user.clear(email);
      await user.type(email, bad);
      await user.type(email, "{Enter}");
      expect(screen.getByText("Geçerli bir e-posta adresi girin")).toBeInTheDocument();
      expect(email).toHaveAttribute("aria-invalid", "true");
      expect(email).toHaveAccessibleDescription("Geçerli bir e-posta adresi girin");
      expect(email).toHaveFocus();
    }
    expect(h.post).not.toHaveBeenCalled();
    // Yazmaya başlayınca hata kalkar.
    await user.type(email, "x");
    expect(screen.queryByText("Geçerli bir e-posta adresi girin")).toBeNull();
  });

  it("boş alanla gönderim de alan hatası verir (sessiz pasif düğme yok)", async () => {
    const user = userEvent.setup();
    render(<CompanyForgotPasswordClient />);
    await user.click(screen.getByRole("button", { name: "Sıfırlama bağlantısı gönder" }));
    expect(screen.getByText("Geçerli bir e-posta adresi girin")).toBeInTheDocument();
    expect(h.post).not.toHaveBeenCalled();
  });

  it("Türkçe metin 'siz' kipinde (arayüz testi 2026-10 login-13)", async () => {
    const user = userEvent.setup();
    h.post.mockResolvedValue({ data: { success: true } });
    render(<CompanyForgotPasswordClient />);
    expect(screen.getByText("E-posta adresinize sıfırlama bağlantısı gönderelim")).toBeInTheDocument();
    expect(screen.getByText("Hatırladınız mı?", { exact: false })).toBeInTheDocument();
    await user.type(screen.getByLabelText("E-posta"), "ada@firma.com");
    await user.click(screen.getByRole("button", { name: "Sıfırlama bağlantısı gönder" }));
    expect(screen.getByRole("status")).toHaveTextContent("Gelen kutunuzu (ve spam klasörünüzü) kontrol edin.");
  });
});
