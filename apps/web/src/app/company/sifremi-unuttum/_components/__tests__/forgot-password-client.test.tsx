// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("GÜVENLİK: ağ hatasında bile aynı generic mesaj (enumeration sızdırmaz)", async () => {
    const user = userEvent.setup();
    h.post.mockRejectedValue(new Error("network"));
    render(<CompanyForgotPasswordClient />);

    await user.type(screen.getByLabelText("E-posta"), "biri@firma.com");
    await user.click(
      screen.getByRole("button", { name: "Sıfırlama bağlantısı gönder" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /Eğer bu e-posta kayıtlıysa/,
    );
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
