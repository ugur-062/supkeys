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

  it("geçersiz e-postayla buton pasif — istek atılmaz", async () => {
    const user = userEvent.setup();
    render(<CompanyForgotPasswordClient />);
    await user.type(screen.getByLabelText("E-posta"), "gecersiz");
    expect(
      screen.getByRole("button", { name: "Sıfırlama bağlantısı gönder" }),
    ).toBeDisabled();
    expect(h.post).not.toHaveBeenCalled();
  });
});
