// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  signupAsync: vi.fn(),
  verifyAsync: vi.fn(),
  resendAsync: vi.fn(),
  setAuth: vi.fn(),
  replace: vi.fn(),
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace }),
  useSearchParams: () => new URLSearchParams(),
  // AuthShell'deki dil seçici (2026-09-27) aynı sayfanın adresini okur.
  usePathname: () => "/company/kayit",
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: null, isHydrated: true }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanySignup: () => ({ mutateAsync: h.signupAsync, isPending: false }),
  useVerifyEmail: () => ({ mutateAsync: h.verifyAsync, isPending: false }),
  useResendEmailCode: () => ({ mutateAsync: h.resendAsync, isPending: false }),
  useSetCompanyAuth: () => h.setAuth,
}));

import { CompanySignupClient } from "../signup-client";

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Ad"), "Ada");
  await user.type(screen.getByLabelText("Soyad", { exact: true }), "Yılmaz");
  await user.type(screen.getByLabelText("Kurumsal e-posta"), "ada@firma.com");
  await user.type(screen.getByLabelText("Telefon"), "5551112233");
  await user.type(screen.getByLabelText("Şifre", { exact: true }), "Guclu!Parola9");
  await user.type(screen.getByLabelText("Şifre (tekrar)"), "Guclu!Parola9");
  await user.click(
    screen.getByRole("checkbox", { name: "Kullanıcı sözleşmesini kabul ediyorum" }),
  );
  await user.click(
    screen.getByRole("checkbox", {
      name: "Platform aracılık ve kullanım sözleşmesini kabul ediyorum",
    }),
  );
  await user.click(
    screen.getByRole("checkbox", {
      name: "KVKK Aydınlatma Metni bilgilendirmesini okudum",
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("CompanySignupClient — form aşaması", () => {
  it("zorunlu alanlar/onaylar eksikken 'Hesap Oluştur' devre dışı", () => {
    render(<CompanySignupClient />);
    expect(
      screen.getByRole("button", { name: "Hesap Oluştur" }),
    ).toBeDisabled();
  });

  it("parola tekrarı eşleşmezse hata gösterir", async () => {
    const user = userEvent.setup();
    render(<CompanySignupClient />);
    await user.type(screen.getByLabelText("Şifre", { exact: true }), "Guclu!Parola9");
    await user.type(screen.getByLabelText("Şifre (tekrar)"), "Baska1!parola");
    expect(screen.getByText("Şifreler eşleşmiyor")).toBeInTheDocument();
  });

  it("tek harfli ad/soyad geçerli (Çin, Kore …); yalnız boşluk geçersiz", async () => {
    const user = userEvent.setup();
    render(<CompanySignupClient />);
    await fillValidForm(user);
    const ad = screen.getByLabelText("Ad");
    const submit = screen.getByRole("button", { name: "Hesap Oluştur" });
    await user.clear(ad);
    await user.type(ad, "Li");
    await user.clear(screen.getByLabelText("Soyad", { exact: true }));
    await user.type(screen.getByLabelText("Soyad", { exact: true }), "W");
    expect(submit).toBeEnabled();
    await user.clear(ad);
    await user.type(ad, "   ");
    expect(submit).toBeDisabled();
  });

  it("telefon ülke uzunluğuna göre: TR'de 11 hane geçersiz, Andorra'da 6 hane geçerli", async () => {
    const user = userEvent.setup();
    h.signupAsync.mockResolvedValue({ email: "ada@firma.com" });
    render(<CompanySignupClient />);
    await fillValidForm(user);
    const phone = screen.getByLabelText("Telefon");
    const submit = screen.getByRole("button", { name: "Hesap Oluştur" });
    // Rus kullanıcı bayrağı değiştirmeden "8 916…" yazdı → "+90 89161234567" GEÇMEZ.
    await user.clear(phone);
    await user.type(phone, "89161234567");
    await user.tab();
    expect(submit).toBeDisabled();
    expect(
      screen.getByText("Seçili ülke için geçerli bir telefon numarası girin."),
    ).toBeInTheDocument();
    // Kısa ama geçerli numara (eskiden "en az 10 hane" kuralı reddediyordu).
    await user.selectOptions(screen.getByLabelText("Ülke kodu"), "AD");
    await user.clear(phone);
    await user.type(phone, "312345");
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(h.signupAsync).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "+376 312345" }),
    );
  });

  it("tüm alanlar geçerli + onaylar → buton aktif; submit trimli veri gönderir", async () => {
    const user = userEvent.setup();
    h.signupAsync.mockResolvedValue({ email: "ada@firma.com" });
    render(<CompanySignupClient />);
    await fillValidForm(user);

    const submit = screen.getByRole("button", { name: "Hesap Oluştur" });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(h.signupAsync).toHaveBeenCalledTimes(1);
    expect(h.signupAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "Ada",
        lastName: "Yılmaz",
        email: "ada@firma.com",
        termsAccepted: true,
        mediationAccepted: true,
        kvkkAccepted: true,
        marketingConsent: false,
      }),
    );
    // Doğrulama adımına geçer.
    expect(await screen.findByText("E-postanı doğrula")).toBeInTheDocument();
  });
});

describe("CompanySignupClient — doğrulama aşaması", () => {
  async function reachVerify(user: ReturnType<typeof userEvent.setup>) {
    h.signupAsync.mockResolvedValue({ email: "ada@firma.com" });
    render(<CompanySignupClient />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    await screen.findByText("E-postanı doğrula");
  }

  it("6 haneli kod + doğrula → setAuth çağrılır, panele yönlenir", async () => {
    const user = userEvent.setup();
    h.verifyAsync.mockResolvedValue({
      token: "jwt",
      user: { id: "u1" },
      company: { id: "c1" },
    });
    await reachVerify(user);

    await user.type(screen.getByLabelText("Doğrulama kodu"), "123456");
    await user.click(
      screen.getByRole("button", { name: "Doğrula ve Giriş Yap" }),
    );

    expect(h.verifyAsync).toHaveBeenCalledWith({
      email: "ada@firma.com",
      code: "123456",
    });
    // Oturum httpOnly cookie'de — setAuth artık token taşımaz (user+company).
    expect(h.setAuth).toHaveBeenCalledWith({
      user: { id: "u1" },
      company: { id: "c1" },
    });
    expect(h.replace).toHaveBeenCalledWith("/company");
  });

  it("GÜVENLİK: alreadyVerified → token YOK, setAuth çağrılmaz, girişe yönlenir", async () => {
    const user = userEvent.setup();
    h.verifyAsync.mockResolvedValue({ alreadyVerified: true });
    await reachVerify(user);

    await user.type(screen.getByLabelText("Doğrulama kodu"), "123456");
    await user.click(
      screen.getByRole("button", { name: "Doğrula ve Giriş Yap" }),
    );

    expect(h.setAuth).not.toHaveBeenCalled();
    expect(h.replace).toHaveBeenCalledWith("/company/login");
    expect(h.toast.info).toHaveBeenCalled();
  });

  it("kayıt sonrası yeniden gönder cooldown'da (60sn) başlar", async () => {
    const user = userEvent.setup();
    await reachVerify(user);
    // signup sonrası setCooldown(60) → buton devre dışı + geri sayım metni.
    const resendBtn = screen.getByRole("button", { name: /Yeniden gönder \(\d+sn\)/ });
    expect(resendBtn).toBeDisabled();
  });

  it("emailSent:false → 'gönderildi' yalanı YOK: hata + success toast yok + resend HEMEN aktif", async () => {
    const user = userEvent.setup();
    h.signupAsync.mockResolvedValue({ email: "ada@firma.com", emailSent: false });
    render(<CompanySignupClient />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    await screen.findByText("E-postanı doğrula");
    // Dürüst sinyal: "gönderildi" toast'ı YOK, bunun yerine hata görünür.
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/gönderilemedi/i);
    // cooldown 0 → kullanıcı hemen tekrar deneyebilir.
    expect(
      screen.getByRole("button", { name: "Kod gelmedi mi? Yeniden gönder" }),
    ).toBeEnabled();
  });

  it("e-posta değiştir → forma döner", async () => {
    const user = userEvent.setup();
    await reachVerify(user);
    await user.click(
      screen.getByRole("button", { name: "← E-posta adresini değiştir" }),
    );
    expect(
      screen.getByRole("button", { name: "Hesap Oluştur" }),
    ).toBeInTheDocument();
  });
});
