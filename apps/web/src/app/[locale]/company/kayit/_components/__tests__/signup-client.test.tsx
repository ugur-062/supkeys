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

/**
 * Kurulum alanını TEK `paste` olayıyla doldurur (son toparlama 2026-10-04).
 * Karakter karakter `user.type` her tuşta tüm formu (telefon/ülke seçicisi
 * dahil) yeniden çizdiriyordu; tam suite paralel koşarken bu kurulum adımları
 * testleri 15 sn zaman aşımına itiyordu. Tuş-tuş davranışı sınanan alanlar
 * (telefon, IBAN, kod…) testin kendisinde `user.type` ile kalır.
 */
async function fill(user: ReturnType<typeof userEvent.setup>, el: HTMLElement, text: string) {
  await user.click(el);
  await user.paste(text);
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await fill(user, screen.getByLabelText("Ad"), "Ada");
  await fill(user, screen.getByLabelText("Soyad", { exact: true }), "Yılmaz");
  await fill(user, screen.getByLabelText("Kurumsal e-posta"), "ada@firma.com");
  await fill(user, screen.getByLabelText("Telefon"), "5551112233");
  await fill(user, screen.getByLabelText("Şifre", { exact: true }), "Guclu!Parola9");
  await fill(user, screen.getByLabelText("Şifre (tekrar)"), "Guclu!Parola9");
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

  // Arayüz testi 2026-10 signup-tr-8 / code-auth-9: düğme sessizce pasif
  // KALMAZ. Basılınca geçersiz her alan iletisini alır, `aria-invalid` olur,
  // ileti alanın `aria-describedby`ına bağlanır ve odak ilk geçersiz alana gider.
  it("boş formda düğme AÇIK; basınca her geçersiz alan iletisini alır, odak ilk alana gider, istek atılmaz", async () => {
    const user = userEvent.setup();
    render(<CompanySignupClient />);
    const submit = screen.getByRole("button", { name: "Hesap Oluştur" });
    expect(submit).toBeEnabled();
    // Tarayıcı baloncuğu yok: doğrulama formun kendisinde.
    expect(submit.closest("form")).toHaveAttribute("novalidate");
    await user.click(submit);

    expect(h.signupAsync).not.toHaveBeenCalled();
    const expected: Array<[string, string]> = [
      ["Ad", "Adınızı girin."],
      ["Soyad", "Soyadınızı girin."],
      ["Kurumsal e-posta", "Geçerli bir e-posta adresi giriniz"],
      ["Telefon", "Seçili ülke için geçerli bir telefon numarası girin."],
      ["Şifre", "En az 10 karakter"],
      ["Şifre (tekrar)", "Şifrenizi tekrar girin."],
    ];
    for (const [label, message] of expected) {
      const input = screen.getByLabelText(label, { exact: true });
      expect(input, label).toHaveAttribute("aria-invalid", "true");
      // İleti girdiye BAĞLI (ekran okuyucu alanla birlikte okur).
      expect(input, label).toHaveAccessibleDescription(message);
    }
    // Zorunlu üç onay işaretsiz → her biri hatalı; isteğe bağlı iki kutu değil.
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.slice(0, 3).every((b) => b.getAttribute("aria-invalid") === "true")).toBe(true);
    expect(boxes.slice(3).some((b) => b.hasAttribute("aria-invalid"))).toBe(false);
    expect(boxes[0]).toHaveAccessibleDescription("Devam etmek için bu onay gereklidir.");
    expect(screen.getAllByText("Devam etmek için bu onay gereklidir.")).toHaveLength(3);
    // Odak ilk geçersiz alanda.
    expect(screen.getByLabelText("Ad")).toHaveFocus();
  });

  it("hata düzeltildikçe kalkar; odak kalan ilk geçersiz alana (onay kutusu) gider", async () => {
    const user = userEvent.setup();
    h.signupAsync.mockResolvedValue({ email: "ada@firma.com" });
    render(<CompanySignupClient />);
    await fillValidForm(user);
    const kvkk = screen.getByRole("checkbox", { name: /^KVKK Aydınlatma Metni bilgilendirmesini okudum/ });
    await user.click(kvkk); // onayı geri al
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    expect(h.signupAsync).not.toHaveBeenCalled();
    expect(kvkk).toHaveAttribute("aria-invalid", "true");
    expect(kvkk).toHaveFocus();
    expect(screen.getAllByText("Devam etmek için bu onay gereklidir.")).toHaveLength(1);
    await user.click(kvkk);
    expect(screen.queryByText("Devam etmek için bu onay gereklidir.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    expect(h.signupAsync).toHaveBeenCalledTimes(1);
  });

  it("e-posta: 'ayse@firma' ve içinde boşluk olan adres alan hatası alır (tarayıcıya bırakılmaz)", async () => {
    const user = userEvent.setup();
    render(<CompanySignupClient />);
    await fillValidForm(user);
    const email = screen.getByLabelText("Kurumsal e-posta");
    for (const bad of ["ayse@firma", "ayse veli@firma.com"]) {
      await user.clear(email);
      await fill(user, email, bad);
      await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
      expect(screen.getByText("Geçerli bir e-posta adresi giriniz")).toBeInTheDocument();
      expect(email).toHaveAttribute("aria-invalid", "true");
      expect(email).toHaveFocus();
    }
    expect(h.signupAsync).not.toHaveBeenCalled();
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
    h.signupAsync.mockResolvedValue({ email: "ada@firma.com" });
    const ad = screen.getByLabelText("Ad");
    const submit = screen.getByRole("button", { name: "Hesap Oluştur" });
    await user.clear(ad);
    await user.type(ad, "   ");
    await user.click(submit);
    expect(screen.getByText("Adınızı girin.")).toBeInTheDocument();
    expect(h.signupAsync).not.toHaveBeenCalled();
    await user.clear(ad);
    await user.type(ad, "Li");
    await user.clear(screen.getByLabelText("Soyad", { exact: true }));
    await user.type(screen.getByLabelText("Soyad", { exact: true }), "W");
    expect(screen.queryByText("Adınızı girin.")).toBeNull();
    await user.click(submit);
    expect(h.signupAsync).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Li", lastName: "W" }),
    );
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
    expect(
      screen.getByText("Seçili ülke için geçerli bir telefon numarası girin."),
    ).toBeInTheDocument();
    // Arayüz testi 2026-10 code-auth-11: hata yalnız kırmızı çerçeve değil —
    // numara kutusu `aria-invalid` olur ve ileti ona bağlanır.
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAccessibleDescription("Seçili ülke için geçerli bir telefon numarası girin.");
    await user.click(submit);
    expect(h.signupAsync).not.toHaveBeenCalled();
    // Kısa ama geçerli numara (eskiden "en az 10 hane" kuralı reddediyordu).
    await user.selectOptions(screen.getByLabelText("Ülke kodu"), "AD");
    await user.clear(phone);
    await user.type(phone, "312345");
    expect(phone).not.toHaveAttribute("aria-invalid");
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
    expect(await screen.findByText("E-postanızı doğrulayın")).toBeInTheDocument();
  });
});

describe("CompanySignupClient — doğrulama aşaması", () => {
  async function reachVerify(user: ReturnType<typeof userEvent.setup>) {
    h.signupAsync.mockResolvedValue({ email: "ada@firma.com" });
    render(<CompanySignupClient />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    await screen.findByText("E-postanızı doğrulayın");
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
    await screen.findByText("E-postanızı doğrulayın");
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
    expect(await screen.findByText("E-postanızı doğrulayın")).toBeInTheDocument();
    expect(screen.getByText(/ada@firma\.com\.tr/)).toBeInTheDocument();
  });
});

describe("CompanySignupClient — arayüz testi webA-02", () => {
  async function reachVerify(user: ReturnType<typeof userEvent.setup>) {
    h.signupAsync.mockResolvedValue({ email: "ada@firma.com" });
    render(<CompanySignupClient />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    await screen.findByText("E-postanızı doğrulayın");
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
    await screen.findByText("E-postanızı doğrulayın");
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

// ---------------------------------------------------------------------------
// Arayüz testi 2026-10 (kayıt/giriş incelemesi)
// ---------------------------------------------------------------------------
describe("CompanySignupClient — şifre kuralları (signup-tr-10, code-auth-12)", () => {
  it("Türkçe harf harftir: 'Çiçekler12!' geçer; simgesiz 'Sifrem12345ş' özel karakter hatası alır", async () => {
    const user = userEvent.setup();
    h.signupAsync.mockResolvedValue({ email: "ada@firma.com" });
    render(<CompanySignupClient />);
    await fillValidForm(user);
    const pw = screen.getByLabelText("Şifre", { exact: true });
    const pw2 = screen.getByLabelText("Şifre (tekrar)");

    // "ş" özel karakter DEĞİL → kural karşılanmaz, kayıt gitmez.
    for (const el of [pw, pw2]) {
      await user.clear(el);
      await fill(user, el, "Sifrem12345ş");
    }
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    expect(screen.getByText("En az bir özel karakter içermeli")).toBeInTheDocument();
    expect(h.signupAsync).not.toHaveBeenCalled();

    // "Ç" büyük harf, "ç" küçük harf sayılır.
    for (const el of [pw, pw2]) {
      await user.clear(el);
      await fill(user, el, "Çiçekler12!");
    }
    expect(screen.queryByText("En az bir özel karakter içermeli")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    expect(h.signupAsync).toHaveBeenCalledWith(expect.objectContaining({ password: "Çiçekler12!" }));
  });

  it("iki şifre alanı AYNI tavanı taşır (72): uzun şifre ikisinde de aynı yerde kesilir", () => {
    render(<CompanySignupClient />);
    expect(screen.getByLabelText("Şifre", { exact: true })).toHaveAttribute("maxlength", "72");
    expect(screen.getByLabelText("Şifre (tekrar)")).toHaveAttribute("maxlength", "72");
  });
});

describe("CompanySignupClient — taslak: dil değişimi ve yenileme (code-auth-5/10, signup-enru-1, signup-tr-15)", () => {
  const DRAFT_KEY = "rothern:signup-draft";

  it("yeniden bağlanınca alanlar ve onaylar geri gelir; ŞİFRELER gelmez ve depoya yazılmaz", async () => {
    const user = userEvent.setup();
    const first = render(<CompanySignupClient />);
    await fillValidForm(user);
    await user.click(screen.getByRole("checkbox", { name: "Pazarlama ve analitik / ticari ileti (opsiyonel)" }));
    // Depoda şifre YOK.
    const raw = sessionStorage.getItem(DRAFT_KEY) ?? "";
    expect(raw).toContain("ada@firma.com");
    expect(raw).not.toContain("Guclu!Parola9");
    expect(raw).not.toMatch(/password/i);

    // Dil seçici / yenileme = sayfa ağacı yeniden bağlanır.
    first.unmount();
    render(<CompanySignupClient />);
    expect(screen.getByLabelText("Ad")).toHaveValue("Ada");
    expect(screen.getByLabelText("Soyad", { exact: true })).toHaveValue("Yılmaz");
    expect(screen.getByLabelText("Kurumsal e-posta")).toHaveValue("ada@firma.com");
    expect(screen.getByLabelText("Telefon")).toHaveValue("5551112233");
    expect(screen.getByLabelText("Şifre", { exact: true })).toHaveValue("");
    expect(screen.getByLabelText("Şifre (tekrar)")).toHaveValue("");
    for (const name of [
      "Kullanıcı sözleşmesini okudum ve kabul ediyorum",
      "Platform aracılık ve kullanım sözleşmesini kabul ediyorum",
      "Pazarlama ve analitik / ticari ileti (opsiyonel)",
    ]) {
      expect(screen.getByRole("checkbox", { name })).toHaveAttribute("aria-checked", "true");
    }
    expect(
      screen.getByRole("checkbox", { name: "Profil ve hizmet iyileştirme (opsiyonel)" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("kod adımında yenileme: kod adımı aynı adresle geri gelir (boş forma dönmez)", async () => {
    const user = userEvent.setup();
    h.signupAsync.mockResolvedValue({ email: "ada@firma.com" });
    const first = render(<CompanySignupClient />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    await screen.findByText("E-postanızı doğrulayın");

    first.unmount();
    render(<CompanySignupClient />);
    expect(await screen.findByText("E-postanızı doğrulayın")).toBeInTheDocument();
    expect(screen.getByText("ada@firma.com adresine gönderilen 6 haneli kodu girin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hesap Oluştur" })).toBeNull();
    // Yeniden kayıt isteği YOK; kod bu adresle doğrulanır.
    h.verifyAsync.mockResolvedValue({ user: { id: "u1" }, company: { id: "c1" } });
    await user.type(screen.getByLabelText("Doğrulama kodu"), "123456{Enter}");
    expect(h.signupAsync).toHaveBeenCalledTimes(1);
    expect(h.verifyAsync).toHaveBeenCalledWith({ email: "ada@firma.com", code: "123456" });
    // Hesap doğrulandı → taslak kapanır.
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("geri yüklenen kod adımında 'e-posta adresini değiştir' ŞİFREYİ yeniden sorar", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        firstName: "Ada",
        lastName: "Yılmaz",
        email: "ada@firma.com",
        phone: "+90 5551112233",
        consents: { terms: true, mediation: true, kvkk: true, marketing: false, profile: false },
        verifyEmail: "ada@firma.com",
        emailSeed: "",
      }),
    );
    h.changeEmailAsync.mockResolvedValue({ email: "ada@firma.com.tr", emailSent: true });
    render(<CompanySignupClient />);
    await screen.findByText("E-postanızı doğrulayın");
    await user.click(screen.getByRole("button", { name: "← E-posta adresini değiştir" }));

    const email = screen.getByLabelText("Yeni e-posta adresi");
    const password = screen.getByLabelText("Şifre", { exact: true });
    expect(password).toHaveAccessibleDescription("Kayıt olurken belirlediğiniz şifreyi girin.");
    await user.clear(email);
    await fill(user, email, "ada@firma.com.tr");
    // Şifresiz gönderim: istek yok, alan hatası + odak.
    await user.click(screen.getByRole("button", { name: "Kodu yeni adrese gönder" }));
    expect(h.changeEmailAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Şifrenizi girin.")).toBeInTheDocument();
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveFocus();

    await fill(user, password, "Guclu!Parola9");
    await user.click(screen.getByRole("button", { name: "Kodu yeni adrese gönder" }));
    expect(h.changeEmailAsync).toHaveBeenCalledWith({
      email: "ada@firma.com",
      password: "Guclu!Parola9",
      newEmail: "ada@firma.com.tr",
    });
    expect(await screen.findByText(/ada@firma\.com\.tr adresine gönderilen/)).toBeInTheDocument();
    // Yeni adres taslağa yazılır; şifre yine yazılmaz.
    const raw = sessionStorage.getItem(DRAFT_KEY) ?? "";
    expect(raw).toContain('"verifyEmail":"ada@firma.com.tr"');
    expect(raw).not.toContain("Guclu!Parola9");
  });

  it("e-posta düzeltme: aynı adres ve bozuk adres alan hatası alır (düğme sessizce pasif değil)", async () => {
    const user = userEvent.setup();
    h.signupAsync.mockResolvedValue({ email: "ada@firma.com" });
    render(<CompanySignupClient />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    await screen.findByText("E-postanızı doğrulayın");
    await user.click(screen.getByRole("button", { name: "← E-posta adresini değiştir" }));
    // Şifre bellekte → şifre alanı yok.
    expect(screen.queryByLabelText("Şifre", { exact: true })).toBeNull();
    const send = screen.getByRole("button", { name: "Kodu yeni adrese gönder" });
    expect(send).toBeEnabled();
    await user.click(send);
    expect(screen.getByText("Yeni adres mevcut adresle aynı.")).toBeInTheDocument();
    const input = screen.getByLabelText("Yeni e-posta adresi");
    await user.clear(input);
    await fill(user, input, "ada@firma");
    expect(screen.getByText("Geçerli bir e-posta adresi giriniz")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(h.changeEmailAsync).not.toHaveBeenCalled();
  });

  it("yeni bir `?email=` bağlantısı eski taslağın adresini ezer; aynı bağlantıda yazılan adres korunur", () => {
    const draft = (emailSeed: string) =>
      JSON.stringify({
        firstName: "Ada",
        lastName: "",
        email: "ada@firma.com",
        phone: "",
        consents: { terms: false, mediation: false, kvkk: false, marketing: false, profile: false },
        verifyEmail: null,
        emailSeed,
      });
    sessionStorage.setItem(DRAFT_KEY, draft(""));
    h.search = "email=misafir%40firma.com";
    const first = render(<CompanySignupClient />);
    expect(screen.getByLabelText("Kurumsal e-posta")).toHaveValue("misafir@firma.com");
    expect(screen.getByLabelText("Ad")).toHaveValue("Ada");
    first.unmount();

    sessionStorage.setItem(DRAFT_KEY, draft("misafir@firma.com"));
    render(<CompanySignupClient />);
    expect(screen.getByLabelText("Kurumsal e-posta")).toHaveValue("ada@firma.com");
  });
});

describe("CompanySignupClient — kod adımı (code-auth-3, login-8, signup-tr-20)", () => {
  async function reachVerify(user: ReturnType<typeof userEvent.setup>) {
    h.signupAsync.mockResolvedValue({ email: "ada@firma.com", emailSent: false });
    render(<CompanySignupClient />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    await screen.findByText("E-postanızı doğrulayın");
    h.toast.success.mockClear();
  }

  it("adım açılınca odak kod alanında; eksik kodla 'Doğrula' alan hatası verir", async () => {
    const user = userEvent.setup();
    await reachVerify(user);
    const input = screen.getByLabelText("Doğrulama kodu");
    expect(input).toHaveFocus();
    const verify = screen.getByRole("button", { name: "Doğrula ve Giriş Yap" });
    expect(verify).toBeEnabled();
    await user.type(input, "123");
    await user.click(verify);
    expect(h.verifyAsync).not.toHaveBeenCalled();
    expect(screen.getByText("6 haneli doğrulama kodunu girin.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveFocus();
  });

  it("saatlik tavan (capped): 'gönderildi' DENMEZ, bir saat sonra deneyin denir, geri sayım başlamaz", async () => {
    const user = userEvent.setup();
    await reachVerify(user);
    h.resendAsync.mockResolvedValue({ success: true, sent: false, capped: true });
    await user.click(screen.getByRole("button", { name: "Kod gelmedi mi? Yeniden gönder" }));
    expect(h.resendAsync).toHaveBeenCalledWith("ada@firma.com");
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Çok fazla kod istediniz. Yeni kod bir saat sonra gönderilebilir");
    expect(screen.getByRole("button", { name: "Kod gelmedi mi? Yeniden gönder" })).toBeEnabled();
  });

  it("gönderim düştü (sent:false): 'Kod gönderilemedi', başarı toast'ı yok", async () => {
    const user = userEvent.setup();
    await reachVerify(user);
    h.resendAsync.mockResolvedValue({ success: true, sent: false });
    await user.click(screen.getByRole("button", { name: "Kod gelmedi mi? Yeniden gönder" }));
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Kod gönderilemedi");
  });

  it("kod gerçekten gitti (sent:true ya da eski API): başarı toast'ı + 60 sn geri sayım", async () => {
    const user = userEvent.setup();
    await reachVerify(user);
    h.resendAsync.mockResolvedValue({ success: true, sent: true });
    await user.click(screen.getByRole("button", { name: "Kod gelmedi mi? Yeniden gönder" }));
    expect(h.toast.success).toHaveBeenCalledWith("Yeni kod gönderildi");
    expect(screen.getByRole("button", { name: /Yeniden gönder \(\d+sn\)/ })).toBeDisabled();
  });

  it("küçük ikincil bağlantılar zinc-400 değil (beyazda 2,6:1) ve en az 32 px dokunma alanı taşır", async () => {
    const user = userEvent.setup();
    await reachVerify(user);
    const change = screen.getByRole("button", { name: "← E-posta adresini değiştir" });
    expect(change.className).not.toContain("text-zinc-400");
    expect(change.className).toContain("text-zinc-500");
    expect(change.className).toContain("py-2");
    await user.click(change);
    const cancel = screen.getByRole("button", { name: "Vazgeç" });
    expect(cancel.className).not.toContain("text-zinc-400");
    expect(cancel.className).toContain("py-2");
  });
});

describe("CompanySignupClient — giriş bağlantıları dönüş hedefini taşır (code-auth-8)", () => {
  it("alt bilgideki 'Giriş yap' `redirect`i `next`, `ref`i olduğu gibi taşır", () => {
    h.search = "ref=tok123&redirect=%2Fcompany%2Filan%2Fl1&intent=teklif";
    render(<CompanySignupClient />);
    expect(screen.getByRole("link", { name: "Giriş yap" })).toHaveAttribute(
      "href",
      "/company/login?next=%2Fcompany%2Filan%2Fl1&ref=tok123&intent=teklif",
    );
  });

  it("'hesap var' hatasındaki giriş bağlantısı da hedefi taşır; site dışı `redirect` taşınmaz", async () => {
    const user = userEvent.setup();
    h.search = "redirect=%2Fcompany%2Filan%2Fl1";
    h.signupAsync.mockRejectedValue(
      new AxiosError("conflict", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 409,
        data: { message: "Bu e-posta ile zaten bir hesap var" },
        statusText: "Conflict",
        headers: {},
        config: {} as never,
      } as never),
    );
    const first = render(<CompanySignupClient />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Hesap Oluştur" }));
    const link = await screen.findByRole("link", { name: /Giriş yapın; e-postanız doğrulanmadıysa/ });
    expect(link).toHaveAttribute("href", "/company/login?next=%2Fcompany%2Filan%2Fl1");
    first.unmount();

    sessionStorage.clear();
    h.search = "redirect=%2F%2Fkotu.example";
    render(<CompanySignupClient />);
    expect(screen.getByRole("link", { name: "Giriş yap" })).toHaveAttribute("href", "/company/login");
  });
});

describe("CompanySignupClient — alan yerleşimi ve erişilebilirlik (code-auth-11, signup-enru-9)", () => {
  it("her etiketin hemen ardındaki öğe data-slot=control taşır (etiket boşluğu tüm alanlarda aynı)", () => {
    render(<CompanySignupClient />);
    for (const label of ["Ad", "Soyad", "Kurumsal e-posta", "Telefon", "Şifre", "Şifre (tekrar)"]) {
      const el = screen.getByText(label, { exact: true, selector: "label" }).nextElementSibling;
      expect(el, label).toHaveAttribute("data-slot", "control");
    }
  });

  it("görünen 'Telefon' etiketine tıklamak numara kutusunu odaklar", async () => {
    const user = userEvent.setup();
    render(<CompanySignupClient />);
    await user.click(screen.getByText("Telefon", { selector: "label" }));
    expect(screen.getByLabelText("Telefon")).toHaveFocus();
  });
});
