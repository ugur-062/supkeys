// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  loginAsync: vi.fn(),
  verifyAsync: vi.fn(),
  resendAsync: vi.fn(),
  setAuth: vi.fn(),
  replace: vi.fn(),
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace }),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyLogin: () => ({ mutateAsync: h.loginAsync, isPending: false }),
  useVerifyEmail: () => ({ mutateAsync: h.verifyAsync, isPending: false }),
  useResendEmailCode: () => ({ mutateAsync: h.resendAsync, isPending: false }),
  useSetCompanyAuth: () => h.setAuth,
}));

import { CompanyLoginForm } from "../login-form";

function unverifiedError() {
  return new AxiosError("hata", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 403,
    data: { message: "E-postanızı doğrulayın" },
    statusText: "Forbidden",
    headers: {},
    config: {} as never,
  } as never);
}

async function login(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("E-posta"), "ada@firma.com");
  await user.type(screen.getByLabelText("Parola"), "parola123");
  await user.click(screen.getByRole("button", { name: "Giriş Yap" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CompanyLoginForm", () => {
  it("başarılı giriş → setAuth + nextPath'e yönlenir", async () => {
    const user = userEvent.setup();
    h.loginAsync.mockResolvedValue({
      token: "jwt",
      user: { id: "u1" },
      company: { id: "c1" },
    });
    render(<CompanyLoginForm nextPath="/company/satinalma" />);
    await login(user);

    expect(h.setAuth).toHaveBeenCalledWith({
      token: "jwt",
      user: { id: "u1" },
      company: { id: "c1" },
    });
    expect(h.replace).toHaveBeenCalledWith("/company/satinalma");
  });

  it("twoFactorRequired → 2FA kod alanı görünür", async () => {
    const user = userEvent.setup();
    h.loginAsync.mockResolvedValue({ twoFactorRequired: true });
    render(<CompanyLoginForm nextPath="/company" />);
    await login(user);

    expect(
      await screen.findByText(/iki adımlı doğrulama açık/i),
    ).toBeInTheDocument();
  });

  it("e-posta doğrulanmamış (403) → doğrulama moduna geçer + kod gönderir", async () => {
    const user = userEvent.setup();
    h.loginAsync.mockRejectedValue(unverifiedError());
    h.resendAsync.mockResolvedValue({ success: true });
    render(<CompanyLoginForm nextPath="/company" />);
    await login(user);

    expect(
      await screen.findByText(/gönderilen 6 haneli kodu girin/i),
    ).toBeInTheDocument();
    expect(h.resendAsync).toHaveBeenCalledWith("ada@firma.com");
  });

  it("doğrulama modunda geçerli kod → setAuth + yönlenir", async () => {
    const user = userEvent.setup();
    h.loginAsync.mockRejectedValue(unverifiedError());
    h.resendAsync.mockResolvedValue({ success: true });
    h.verifyAsync.mockResolvedValue({
      token: "jwt",
      user: { id: "u1" },
      company: { id: "c1" },
    });
    render(<CompanyLoginForm nextPath="/company" />);
    await login(user);
    await screen.findByText(/gönderilen 6 haneli kodu girin/i);

    await user.type(screen.getByLabelText("Doğrulama kodu"), "123456");
    await user.click(
      screen.getByRole("button", { name: "Doğrula ve Giriş Yap" }),
    );

    expect(h.setAuth).toHaveBeenCalled();
    expect(h.replace).toHaveBeenCalledWith("/company");
  });

  it("GÜVENLİK: doğrulama modunda alreadyVerified → token yok, giriş formuna döner", async () => {
    const user = userEvent.setup();
    h.loginAsync.mockRejectedValue(unverifiedError());
    h.resendAsync.mockResolvedValue({ success: true });
    h.verifyAsync.mockResolvedValue({ alreadyVerified: true });
    render(<CompanyLoginForm nextPath="/company" />);
    await login(user);
    await screen.findByText(/gönderilen 6 haneli kodu girin/i);

    await user.type(screen.getByLabelText("Doğrulama kodu"), "123456");
    await user.click(
      screen.getByRole("button", { name: "Doğrula ve Giriş Yap" }),
    );

    expect(h.setAuth).not.toHaveBeenCalled();
    expect(h.toast.info).toHaveBeenCalled();
    // Giriş formuna geri dönmüş olmalı.
    expect(
      await screen.findByRole("button", { name: "Giriş Yap" }),
    ).toBeInTheDocument();
  });
});
