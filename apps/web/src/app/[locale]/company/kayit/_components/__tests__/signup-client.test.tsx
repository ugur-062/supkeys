// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { AxiosError } from "axios";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  signupAsync: vi.fn(),
  verifyAsync: vi.fn(),
  resendAsync: vi.fn(),
  changeEmailAsync: vi.fn(),
  search: "",
  storeUser: null as { id: string } | null,
  setAuth: vi.fn(),
  replace: vi.fn(),
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace }),
  useSearchParams: () => new URLSearchParams(h.search),
  // AuthShell'deki dil seçici (2026-09-27) aynı sayfanın adresini okur.
  usePathname: () => "/company/kayit",
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: h.storeUser, isHydrated: true }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanySignup: () => ({ mutateAsync: h.signupAsync, isPending: false }),
  useVerifyEmail: () => ({ mutateAsync: h.verifyAsync, isPending: false }),
  useResendEmailCode: () => ({ mutateAsync: h.resendAsync, isPending: false }),
  useChangeSignupEmail: () => ({ mutateAsync: h.changeEmailAsync, isPending: false }),
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
  // Erişilebilir ad görünen metnin kendisi (arayüz testi O-120, Field/Label).
  await user.click(
    screen.getByRole("checkbox", { name: "Kullanıcı sözleşmesini okudum ve kabul ediyorum" }),
  );
  await user.click(
    screen.getByRole("checkbox", {
      name: "Platform aracılık ve kullanım sözleşmesini kabul ediyorum",
    }),
  );
  await user.click(
    screen.getByRole("checkbox", {
      name: /^KVKK Aydınlatma Metni bilgilendirmesini okudum/,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.search = "";
  h.storeUser = null;
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("CompanySignupClient — form aşaması", () => {
  it("?email= bağlantısı e-posta alanını doldurur (misafir talebi aynı adresle bağlanır)", () => {
    h.search = "email=misafir%40firma.com";
    render(<CompanySignupClient />);
    expect(screen.getByLabelText("Kurumsal e-posta")).toHaveValue("misafir@firma.com");
  });

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

  it("e-posta değiştir → yeni kayıt AÇILMAZ; aynı hesabın adresi değişir, kod yeni adrese gider", async () => {
    const user = userEvent.setup();
    h.changeEmailAsync.mockResolvedValue({ email: "ada@firma.com.tr", emailSent: true });
    await reachVerify(user);
    await user.click(
      screen.getByRole("button", { name: "← E-posta adresini değiştir" }),
    );
    const input = screen.getByLabelText("Yeni e-posta adresi");
    await user.clear(input);
    await user.type(input, "ada@firma.com.tr");
    await user.click(screen.getByRole("button", { name: "Kodu yeni adrese gönder" }));

    expect(h.changeEmailAsync).toHaveBeenCalledWith({
      email: "ada@firma.com",
      password: "Guclu!Parola9",
      newEmail: "ada@firma.com.tr",
    });
    expect(h.signupAsync).toHaveBeenCalledTimes(1);
    // Kod adımına yeni adresle döner.
    expect(await screen.findByText("E-postanı doğrula")).toBeInTheDocument();
    expect(screen.getByText(/ada@firma\.com\.tr/)).toBeInTheDocument();
  });
});

describe("CompanySignupClient — arayüz testi webA-02", () => {
  async function reachVerify(user: ReturnType<typeof userEvent.setup>) {
    h.signupAsync.mockResolvedValue({ email: "ada@firma.com" });
    render(<CompanySignupClient />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    await screen.findByText("E-postanı doğrula");
  }

  it("O-113: zaten girişli kullanıcı `redirect`e gider (talep bağlamı korunur)", () => {
    h.storeUser = { id: "u1" };
    h.search = "intent=teklif&redirect=%2Fcompany%2Fsatis%3Fq%3DROT-000001%23acik-talepler";
    render(<CompanySignupClient />);
    expect(h.replace).toHaveBeenCalledWith("/company/satis?q=ROT-000001#acik-talepler");
  });

  it("O-113: girişli kullanıcı, site dışı `redirect` → yoksayılır, niyet yoksa `/company`", () => {
    h.storeUser = { id: "u1" };
    h.search = "redirect=%2F%2Fkotu.example";
    render(<CompanySignupClient />);
    expect(h.replace).toHaveBeenCalledWith("/company");
  });

  it("D-090 + D-351: yapıştırılan koddan rakamlar ayıklanır, Enter gönderir", async () => {
    const user = userEvent.setup();
    h.verifyAsync.mockResolvedValue({ token: "jwt", user: { id: "u1" }, company: { id: "c1" } });
    await reachVerify(user);
    const input = screen.getByLabelText("Doğrulama kodu");
    fireEvent.change(input, { target: { value: "Kod: 123 456" } });
    expect(input).toHaveValue("123456");
    fireEvent.change(input, { target: { value: "12ab34cd5678" } });
    expect(input).toHaveValue("123456");
    await user.type(input, "{Enter}");
    expect(h.verifyAsync).toHaveBeenCalledWith({ email: "ada@firma.com", code: "123456" });
  });

  it("Y-08: doğrulamada niyet + dönüş adresi saklanır, form `/company`ye gider", async () => {
    const user = userEvent.setup();
    h.search = "intent=teklif&redirect=%2Fcompany%2Filan%2Fl1";
    h.verifyAsync.mockResolvedValue({ token: "jwt", user: { id: "u1" }, company: { id: "c1" } });
    await reachVerify(user);
    await user.type(screen.getByLabelText("Doğrulama kodu"), "123456{Enter}");
    expect(sessionStorage.getItem("rothern.signup-redirect")).toBe("/company/ilan/l1");
    expect(h.replace).toHaveBeenCalledWith("/company");
  });

  it("D-066: kod adımında dil seçici yok (form adımında var)", async () => {
    const user = userEvent.setup();
    h.signupAsync.mockResolvedValue({ email: "ada@firma.com" });
    render(<CompanySignupClient />);
    expect(screen.getByRole("button", { name: "Dil" })).toBeInTheDocument();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    await screen.findByText("E-postanı doğrula");
    expect(screen.queryByRole("button", { name: "Dil" })).toBeNull();
  });

  it("D-066: e-posta zaten kayıtlı (409) → hata yanında giriş bağlantısı", async () => {
    const user = userEvent.setup();
    h.signupAsync.mockRejectedValue(
      new AxiosError("conflict", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 409,
        // API iletisi noktasız biter (gerçek yanıt) — istemci tam cümle basar.
        data: { message: "Bu e-posta ile zaten bir hesap var" },
        statusText: "Conflict",
        headers: {},
        config: {} as never,
      } as never),
    );
    render(<CompanySignupClient />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    const link = await screen.findByRole("link", { name: /Giriş yapın; e-postanız doğrulanmadıysa/ });
    expect(link).toHaveAttribute("href", "/company/login");
    // İleti ile bağlantı arasında cümle sonu var (webA-02 yeniden doğrulama).
    expect(screen.getByRole("alert").textContent).toMatch(/^Bu e-posta adresiyle zaten bir hesap var\. Giriş yapın;/);
  });
});
