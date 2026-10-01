// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
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
    // API sözleşmesi: 403 + yapısal `code` (form mesaj METNİNE değil koda bakar;
    // i18n Faz 2'de metin eşleşmesi kaldırıldı — mesaj istek dilinde gelir).
    data: { message: "Giriş yapmadan önce e-posta adresinizi doğrulayın.", code: "EMAIL_NOT_VERIFIED" },
    statusText: "Forbidden",
    headers: {},
    config: {} as never,
  } as never);
}

async function login(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("E-posta"), "ada@firma.com");
  await user.type(screen.getByLabelText("Şifre"), "parola123");
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

    // Oturum httpOnly cookie'de — setAuth artık token taşımaz (user+company).
    expect(h.setAuth).toHaveBeenCalledWith({
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

  it("doğrulama yolu 'Oturumumu açık bırak' tercihini API'ye taşır (derin denetim MU-23)", async () => {
    const user = userEvent.setup();
    h.loginAsync.mockRejectedValue(unverifiedError());
    h.resendAsync.mockResolvedValue({ success: true });
    h.verifyAsync.mockResolvedValue({
      token: "jwt",
      user: { id: "u1" },
      company: { id: "c1" },
    });
    render(<CompanyLoginForm nextPath="/company" />);
    await user.click(screen.getByRole("checkbox"));
    await login(user);
    await screen.findByText(/gönderilen 6 haneli kodu girin/i);

    await user.type(screen.getByLabelText("Doğrulama kodu"), "123456");
    await user.click(
      screen.getByRole("button", { name: "Doğrula ve Giriş Yap" }),
    );

    expect(h.verifyAsync).toHaveBeenCalledWith({
      email: "ada@firma.com",
      code: "123456",
      rememberMe: false,
    });
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

describe("CompanyLoginForm — arayüz testi webA-02", () => {
  async function reachVerifyMode(user: ReturnType<typeof userEvent.setup>) {
    h.loginAsync.mockRejectedValue(unverifiedError());
    h.resendAsync.mockResolvedValue({ success: true });
    render(<CompanyLoginForm nextPath="/company" />);
    await login(user);
    await screen.findByText(/gönderilen 6 haneli kodu girin/i);
  }

  it("D-090 + D-351: doğrulama modunda yapıştırılan kod ayıklanır, Enter gönderir", async () => {
    const user = userEvent.setup();
    h.verifyAsync.mockResolvedValue({ token: "jwt", user: { id: "u1" }, company: { id: "c1" } });
    await reachVerifyMode(user);
    const input = screen.getByLabelText("Doğrulama kodu");
    fireEvent.change(input, { target: { value: "Kod: 123456" } });
    expect(input).toHaveValue("123456");
    await user.type(input, "{Enter}");
    expect(h.verifyAsync).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ada@firma.com", code: "123456" }),
    );
  });

  it("D-346: doğrulama modundan başka e-postayla girişe dönülür", async () => {
    const user = userEvent.setup();
    await reachVerifyMode(user);
    await user.click(screen.getByRole("button", { name: /Başka bir e-postayla giriş yap/ }));
    expect(await screen.findByRole("button", { name: "Giriş Yap" })).toBeInTheDocument();
    expect(screen.queryByText(/gönderilen 6 haneli kodu girin/i)).toBeNull();
  });

  it("D-346: e-posta 2FA adımında kod yeniden gönderilir (kodsuz giriş), 60 sn bekleme", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      h.loginAsync.mockResolvedValue({ twoFactorRequired: true, method: "email" });
      render(<CompanyLoginForm nextPath="/company" />);
      await login(user);
      // İlk kod az önce gitti → düğme geri sayımda.
      const btn = await screen.findByRole("button", { name: /Yeniden gönder \(\d+sn\)/ });
      expect(btn).toBeDisabled();
      // Geri sayım saniyede bir zincirli zamanlayıcı → saniye saniye ilerlet.
      for (let i = 0; i < 61; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });
      }
      h.loginAsync.mockClear();
      await user.click(await screen.findByRole("button", { name: "Kodu yeniden gönder" }));
      expect(h.loginAsync).toHaveBeenCalledWith({
        email: "ada@firma.com",
        password: "parola123",
        code: undefined,
        rememberMe: true,
      });
      expect(h.toast.success).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("authenticator 2FA adımında 'yeniden gönder' YOK", async () => {
    const user = userEvent.setup();
    h.loginAsync.mockResolvedValue({ twoFactorRequired: true, method: "authenticator" });
    render(<CompanyLoginForm nextPath="/company" />);
    await login(user);
    await screen.findByText(/iki adımlı doğrulama açık/i);
    expect(screen.queryByRole("button", { name: /yeniden gönder/i })).toBeNull();
  });
});
