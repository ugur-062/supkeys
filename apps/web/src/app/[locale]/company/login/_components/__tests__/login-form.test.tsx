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

// ---------------------------------------------------------------------------
// Arayüz testi 2026-10 (kayıt/giriş incelemesi)
// ---------------------------------------------------------------------------
function rejected(status: number, data: Record<string, unknown>) {
  return new AxiosError("hata", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data,
    statusText: "x",
    headers: {},
    config: {} as never,
  } as never);
}

describe("CompanyLoginForm — e-posta denetimi (code-auth-7, login-6)", () => {
  it("form noValidate: 'abc' sayfa dilinde alan hatası alır, istek atılmaz, odak alanda", async () => {
    const user = userEvent.setup();
    render(<CompanyLoginForm nextPath="/company" />);
    const email = screen.getByLabelText("E-posta");
    expect(email.closest("form")).toHaveAttribute("novalidate");
    for (const bad of ["abc", "abc@", "a b@c.com", "a@b"]) {
      await user.clear(email);
      await user.type(email, bad);
      await user.type(screen.getByLabelText("Şifre"), "x");
      await user.click(screen.getByRole("button", { name: "Giriş Yap" }));
      expect(await screen.findByText("Geçerli bir e-posta adresi giriniz")).toBeInTheDocument();
      expect(email).toHaveAttribute("aria-invalid", "true");
      expect(email).toHaveAccessibleDescription("Geçerli bir e-posta adresi giriniz");
      expect(email).toHaveFocus();
    }
    expect(h.loginAsync).not.toHaveBeenCalled();
  });

  it("kayıt ve API'nin kabul ettiği adresler girişte de kabul edilir; adres kırpılarak gönderilir", async () => {
    const user = userEvent.setup();
    h.loginAsync.mockResolvedValue({ twoFactorRequired: true });
    render(<CompanyLoginForm nextPath="/company" />);
    await user.type(screen.getByLabelText("E-posta"), "  satis&pazarlama@firma.com ");
    await user.type(screen.getByLabelText("Şifre"), "parola123");
    await user.click(screen.getByRole("button", { name: "Giriş Yap" }));
    expect(h.loginAsync).toHaveBeenCalledWith(
      expect.objectContaining({ email: "satis&pazarlama@firma.com" }),
    );
    expect(screen.queryByText("Geçerli bir e-posta adresi giriniz")).toBeNull();
  });
});

describe("CompanyLoginForm — doğrulama kodu gönderimi dürüst (code-auth-3, login-7)", () => {
  it("otomatik gönderim DÜŞTÜ (429): hata gösterilir, 'gönderilen kodu girin' denmez, yeniden gönder hemen açık", async () => {
    const user = userEvent.setup();
    h.loginAsync.mockRejectedValue(unverifiedError());
    h.resendAsync.mockRejectedValue(rejected(429, { message: "Çok fazla deneme yapıldı. Lütfen bir dakika bekleyip yeniden deneyin." }));
    render(<CompanyLoginForm nextPath="/company" />);
    await login(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Çok fazla deneme yapıldı");
    expect(screen.queryByText(/gönderilen 6 haneli kodu girin/i)).toBeNull();
    expect(screen.getByText(/adresi için 6 haneli doğrulama kodunu girin/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kodu yeniden gönder" })).toBeEnabled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it("otomatik gönderimde saatlik tavan (capped): bir saat sonra deneyin; geri sayım başlamaz", async () => {
    const user = userEvent.setup();
    h.loginAsync.mockRejectedValue(unverifiedError());
    h.resendAsync.mockResolvedValue({ success: true, sent: false, capped: true });
    render(<CompanyLoginForm nextPath="/company" />);
    await login(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Çok fazla kod istediniz. Yeni kod bir saat sonra gönderilebilir",
    );
    // Son gönderilen kod hâlâ geçerli olabilir → kod alanı ve metin durur.
    expect(screen.getByText(/gönderilen 6 haneli kodu girin/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kodu yeniden gönder" })).toBeEnabled();
  });

  it("elle 'yeniden gönder' sent:false dönerse başarı toast'ı YOK, hata var", async () => {
    const user = userEvent.setup();
    h.loginAsync.mockRejectedValue(unverifiedError());
    h.resendAsync.mockResolvedValueOnce({ success: true, sent: false });
    render(<CompanyLoginForm nextPath="/company" />);
    await login(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Doğrulama kodu şu anda gönderilemedi");

    h.resendAsync.mockResolvedValueOnce({ success: true, sent: true });
    await user.click(screen.getByRole("button", { name: "Kodu yeniden gönder" }));
    expect(h.toast.success).toHaveBeenCalledWith("Yeni kod gönderildi");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/gönderilen 6 haneli kodu girin/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Yeniden gönder \(\d+sn\)/ })).toBeDisabled();
  });
});

describe("CompanyLoginForm — kod adımı ve odak (login-8, login-15, code-auth-9)", () => {
  it("adımı sayfa kabuğuna bildirir; doğrulama adımında odak kod alanında", async () => {
    const user = userEvent.setup();
    const onStepChange = vi.fn();
    h.loginAsync.mockRejectedValue(unverifiedError());
    h.resendAsync.mockResolvedValue({ success: true, sent: true });
    render(<CompanyLoginForm nextPath="/company" onStepChange={onStepChange} />);
    expect(onStepChange).toHaveBeenLastCalledWith("login");
    await login(user);
    await screen.findByText(/gönderilen 6 haneli kodu girin/i);
    expect(onStepChange).toHaveBeenLastCalledWith("verify");
    expect(screen.getByLabelText("Doğrulama kodu")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: /Başka bir e-postayla giriş yap/ }));
    expect(onStepChange).toHaveBeenLastCalledWith("login");
  });

  it("2FA adımı da bildirilir; kodsuz gönderimde hata KOD ALANINDA (aria-invalid) ve odak orada", async () => {
    const user = userEvent.setup();
    const onStepChange = vi.fn();
    h.loginAsync.mockResolvedValue({ twoFactorRequired: true, method: "authenticator" });
    render(<CompanyLoginForm nextPath="/company" onStepChange={onStepChange} />);
    await login(user);
    await screen.findByText(/iki adımlı doğrulama açık/i);
    expect(onStepChange).toHaveBeenLastCalledWith("twoFactor");
    h.loginAsync.mockClear();
    await user.click(screen.getByRole("button", { name: "Giriş Yap" }));
    expect(h.loginAsync).not.toHaveBeenCalled();
    const code = screen.getByLabelText("Doğrulama kodu");
    expect(code).toHaveAttribute("aria-invalid", "true");
    expect(code).toHaveAccessibleDescription(/Doğrulama kodunu ya da kurtarma kodunuzu girin/);
    expect(code).toHaveFocus();
  });

  it("doğrulama adımında eksik kodla gönderim: alan hatası, istek yok", async () => {
    const user = userEvent.setup();
    h.loginAsync.mockRejectedValue(unverifiedError());
    h.resendAsync.mockResolvedValue({ success: true });
    render(<CompanyLoginForm nextPath="/company" />);
    await login(user);
    await screen.findByText(/gönderilen 6 haneli kodu girin/i);
    const verify = screen.getByRole("button", { name: "Doğrula ve Giriş Yap" });
    expect(verify).toBeEnabled();
    await user.type(screen.getByLabelText("Doğrulama kodu"), "12");
    await user.click(verify);
    expect(h.verifyAsync).not.toHaveBeenCalled();
    expect(screen.getByText("6 haneli doğrulama kodunu girin.")).toBeInTheDocument();
    expect(screen.getByLabelText("Doğrulama kodu")).toHaveAttribute("aria-invalid", "true");
  });

  it("başarısız girişten sonra odak <body>'ye düşmez: şifre alanına gider", async () => {
    const user = userEvent.setup();
    h.loginAsync.mockRejectedValue(rejected(401, { message: "E-posta veya şifre hatalı" }));
    render(<CompanyLoginForm nextPath="/company" />);
    await login(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("E-posta veya şifre hatalı");
    expect(screen.getByLabelText("Şifre")).toHaveFocus();
  });
});

describe("CompanyLoginForm — okunurluk ve dokunma alanları (login-5, login-9, login-10)", () => {
  it("'Başka bir e-postayla giriş yap' zinc-400 değil; ikincil bağlantılar en az 32 px yüksek", async () => {
    const user = userEvent.setup();
    h.loginAsync.mockRejectedValue(unverifiedError());
    h.resendAsync.mockResolvedValue({ success: true });
    render(<CompanyLoginForm nextPath="/company" />);
    await login(user);
    await screen.findByText(/gönderilen 6 haneli kodu girin/i);
    for (const name of [/Başka bir e-postayla giriş yap/, /Yeniden gönder/]) {
      const btn = screen.getByRole("button", { name });
      expect(btn.className).not.toContain("text-zinc-400");
      expect(btn.className).toContain("text-zinc-500");
      expect(btn.className).toContain("py-2");
    }
  });

  it("'Oturumumu açık bırak' etiketi ve 'Şifremi unuttum' bağlantısı en az 32 px (min-h-8); bağlantı soru işaretsiz", () => {
    render(<CompanyLoginForm nextPath="/company" />);
    expect(screen.getByText("Oturumumu açık bırak").className).toContain("min-h-8");
    const forgot = screen.getByRole("link", { name: "Şifremi unuttum" });
    expect(forgot.className).toContain("min-h-8");
    expect(forgot).toHaveAttribute("href", "/company/sifremi-unuttum");
  });

  it("E-posta ve Şifre etiketlerinin ardındaki öğe data-slot=control taşır (etiket boşluğu eşit)", () => {
    render(<CompanyLoginForm nextPath="/company" />);
    for (const label of ["E-posta", "Şifre"]) {
      const el = screen.getByText(label, { selector: "label" }).nextElementSibling;
      expect(el, label).toHaveAttribute("data-slot", "control");
    }
  });
});
