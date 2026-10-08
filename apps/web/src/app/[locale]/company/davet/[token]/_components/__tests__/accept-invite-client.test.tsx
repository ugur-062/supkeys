// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  acceptAsync: vi.fn(),
  setAuth: vi.fn(),
  replace: vi.fn(),
  storeUser: null as { id: string; email: string } | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/company/davet/tok",
}));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) => sel({ user: h.storeUser, isHydrated: true }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useInvitationPreview: () => ({
    data: { email: "yeni@firma.com", roles: ["SATISCI"], companyName: "Örnek AŞ", expiresAt: "2026-12-01" },
    isLoading: false,
    error: null,
  }),
  useAcceptInvitation: () => ({ mutateAsync: h.acceptAsync, isPending: false }),
  useSetCompanyAuth: () => h.setAuth,
}));

import { AcceptInviteClient } from "../accept-invite-client";

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

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await fill(user, screen.getByLabelText("Ad"), "Ada");
  await fill(user, screen.getByLabelText("Soyad", { exact: true }), "Yılmaz");
  await fill(user, screen.getByLabelText("Şifre", { exact: true }), "Guclu!Parola9");
  await fill(user, screen.getByLabelText(/Şifre \(/), "Guclu!Parola9");
  await user.click(screen.getByRole("checkbox", { name: "Kullanıcı sözleşmesini okudum ve kabul ediyorum" }));
  await user.click(screen.getByRole("checkbox", { name: "Platform aracılık ve kullanım sözleşmesini kabul ediyorum" }));
  await user.click(screen.getByRole("checkbox", { name: /^KVKK Aydınlatma Metni/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.storeUser = null;
});

const submitButton = () => screen.getByRole("button", { name: "Daveti Kabul Et ve Katıl" });
const password = () => screen.getByLabelText("Şifre", { exact: true });
const passwordRepeat = () => screen.getByLabelText(/Şifre \(/);

describe("AcceptInviteClient", () => {
  // Arayüz testi O-121: eksik numara kaydediliyordu (istemci kontrolü yoktu).
  // 2026-10: düğme artık pasifleşmez — basılınca numara alanı işaretlenir,
  // odak ona gider ve istek atılmaz.
  it("eksik telefon: satır içi uyarı, gönderim durur ve odak numaraya gider; boş telefon serbest", async () => {
    const user = userEvent.setup();
    h.acceptAsync.mockResolvedValue({ user: { id: "u1" }, company: { id: "c1" } });
    render(<AcceptInviteClient token="tok" />);
    await fillRequired(user);
    expect(submitButton()).toBeEnabled();
    const phone = screen.getByPlaceholderText("5XX XXX XX XX");
    await user.type(phone, "532123");
    await user.tab();
    expect(screen.getByText(/geçerli bir telefon numarası girin/)).toBeInTheDocument();
    // Sessizce pasif DEĞİL: tıklanabilir, ama eksik numarayla kabul isteği gitmez.
    expect(submitButton()).toBeEnabled();
    await user.click(submitButton());
    expect(h.acceptAsync).not.toHaveBeenCalled();
    expect(phone).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(phone).toHaveFocus());
    await user.clear(phone);
    await user.type(phone, "5321234567");
    expect(screen.queryByText(/geçerli bir telefon numarası girin/)).toBeNull();
    await user.click(submitButton());
    await waitFor(() => expect(h.acceptAsync).toHaveBeenCalledTimes(1));
    expect(h.acceptAsync.mock.calls[0]![0]).toMatchObject({ phone: "+90 5321234567", firstName: "Ada" });
  });

  it("boş telefonla (isteğe bağlı) kabul gider; telefon gövdede yok", async () => {
    const user = userEvent.setup();
    h.acceptAsync.mockResolvedValue({ user: { id: "u1" }, company: { id: "c1" } });
    render(<AcceptInviteClient token="tok" />);
    await fillRequired(user);
    await user.click(submitButton());
    await waitFor(() => expect(h.acceptAsync).toHaveBeenCalledTimes(1));
    expect(h.acceptAsync.mock.calls[0]![0].phone).toBeUndefined();
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/company"));
  });

  // Arayüz testi 2026-10 code-auth-9: düğme eskiden form geçerli olana dek
  // sessizce pasifti — neyin eksik olduğunu hiçbir şey söylemiyordu.
  it("boş formda düğme tıklanabilir: her eksik alan iletisini gösterir, odak ilk geçersiz alanda, istek yok", async () => {
    const user = userEvent.setup();
    render(<AcceptInviteClient token="tok" />);
    expect(submitButton()).toBeEnabled();
    // Basılmadan önce hiçbir alan hata taşımaz.
    expect(screen.queryByText("Adınızı girin")).toBeNull();
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();

    await user.click(submitButton());

    expect(h.acceptAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Adınızı girin")).toBeInTheDocument();
    expect(screen.getByText("Soyadınızı girin")).toBeInTheDocument();
    expect(screen.getByText("En az 10 karakter", { selector: "[data-slot='error']" })).toBeInTheDocument();
    expect(screen.getByText("Şifrenizi tekrar girin")).toBeInTheDocument();
    // Üç zorunlu onayın her biri kendi iletisini taşır; isteğe bağlı ikisi taşımaz.
    expect(screen.getAllByText("Devam etmek için bu onay gereklidir")).toHaveLength(3);
    for (const el of [screen.getByLabelText("Ad"), screen.getByLabelText("Soyad", { exact: true }), password(), passwordRepeat()]) {
      expect(el).toHaveAttribute("aria-invalid", "true");
    }
    // Telefon isteğe bağlı: boşken hata almaz.
    expect(screen.getByPlaceholderText("5XX XXX XX XX")).not.toHaveAttribute("aria-invalid");
    // İleti alana bağlı (ekran okuyucu alanla birlikte okur).
    const first = screen.getByLabelText("Ad");
    expect(first).toHaveAccessibleDescription("Adınızı girin");
    // Odak DOM sırasındaki ilk geçersiz alanda.
    await waitFor(() => expect(first).toHaveFocus());

    // Hatalar düzeltildikçe kendiliğinden kalkar.
    await fill(user, first, "Ada");
    expect(screen.queryByText("Adınızı girin")).toBeNull();
    await user.click(submitButton());
    await waitFor(() => expect(screen.getByLabelText("Soyad", { exact: true })).toHaveFocus());
  });

  it("şifre kuralı eksikse ileti şifre alanının altında (ilk karşılanmayan kural) ve odak şifrede", async () => {
    const user = userEvent.setup();
    render(<AcceptInviteClient token="tok" />);
    await fillRequired(user);
    await user.clear(password());
    await fill(user, password(), "gucluparola!9");
    await user.clear(passwordRepeat());
    await fill(user, passwordRepeat(), "gucluparola!9");
    await user.click(submitButton());
    expect(h.acceptAsync).not.toHaveBeenCalled();
    expect(password()).toHaveAccessibleDescription("En az bir büyük harf içermeli");
    await waitFor(() => expect(password()).toHaveFocus());
  });

  // Arayüz testi 2026-10 code-auth-12: tekrar alanı sınırsızdı — uzun şifre
  // ilk alanda kesiliyor, ikincisinde kesilmiyor ve "eşleşmiyor" deniyordu.
  it("iki şifre alanı da aynı tavanda durur (maxLength 72)", async () => {
    const user = userEvent.setup();
    render(<AcceptInviteClient token="tok" />);
    expect(password()).toHaveAttribute("maxLength", "72");
    expect(passwordRepeat()).toHaveAttribute("maxLength", "72");
    // 73 karakter YAPIŞTIRILIR (146 tuş vuruşu tam koşuda 15 sn sınırını aşıyordu):
    // iki alan da 72'de keser, "eşleşmiyor" çıkmaz.
    const long = `Aa1!${"x".repeat(69)}`;
    await fill(user, password(), long);
    await fill(user, passwordRepeat(), long);
    expect(password()).toHaveValue(long.slice(0, 72));
    expect(passwordRepeat()).toHaveValue(long.slice(0, 72));
    expect(screen.queryByText("Şifreler eşleşmiyor")).toBeNull();
  });

  // Üst sınır 72 UTF-8 BAYT: 40 Kiril harf 72 karakteri aşmaz ama 80 bayttır.
  it("72 baytı aşan (ASCII dışı harfli) şifre gönderilmez; tek açık ileti gösterilir", async () => {
    const user = userEvent.setup();
    render(<AcceptInviteClient token="tok" />);
    await fillRequired(user);
    const cyrillic = `Aa1!${"я".repeat(40)}`;
    await user.clear(password());
    await fill(user, password(), cyrillic);
    await user.clear(passwordRepeat());
    await fill(user, passwordRepeat(), cyrillic);
    await user.click(submitButton());
    expect(h.acceptAsync).not.toHaveBeenCalled();
    expect(password()).toHaveAttribute("aria-invalid", "true");
    expect(password()).toHaveAccessibleDescription(/72/);
  });

  // CLAUDE.md "Arayüz tuzakları" (webC-09): `<Field>` içindeki özel denetim
  // etiketin HEMEN ardından gelen `data-slot="control"` kökü olmalı — araya
  // giren sarmalayıcı div etiket boşluğunu düşürür (Telefon etiketi 12 px kayar).
  it("telefon kutusu etiketin hemen ardındaki data-slot=control öğesidir (diğer alanlarla aynı boşluk)", () => {
    render(<AcceptInviteClient token="tok" />);
    const controlAfterLabel = (labelText: string | RegExp) => {
      const label = screen.getByText(labelText, { selector: "[data-slot='label']" });
      return label.nextElementSibling;
    };
    const phoneControl = controlAfterLabel("Telefon (opsiyonel)");
    expect(phoneControl).toHaveAttribute("data-slot", "control");
    expect(phoneControl).toContainElement(screen.getByPlaceholderText("5XX XXX XX XX"));
    // Aynı kural öteki alanlarda da sağlanıyor (kıyas).
    expect(controlAfterLabel("Ad")).toHaveAttribute("data-slot", "control");
    expect(controlAfterLabel("Şifre")).toHaveAttribute("data-slot", "control");
    // Görünen etiket numara kutusunun erişilebilir adıdır.
    expect(screen.getByLabelText("Telefon (opsiyonel)")).toBe(screen.getByPlaceholderText("5XX XXX XX XX"));
  });

  it("telefon hatası alana bağlı ErrorMessage'dır (aria-describedby)", async () => {
    const user = userEvent.setup();
    render(<AcceptInviteClient token="tok" />);
    const phone = screen.getByPlaceholderText("5XX XXX XX XX");
    await user.type(phone, "532123");
    await user.tab();
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAccessibleDescription(/geçerli bir telefon numarası girin/);
  });

  // Arayüz testi D-348: başka hesapla oturum açıkken uyarı.
  it("başka hesapla oturum açıkken kabulün oturumu değiştireceğini söyler", () => {
    h.storeUser = { id: "u9", email: "eski@baska.com" };
    render(<AcceptInviteClient token="tok" />);
    expect(screen.getByRole("status")).toHaveTextContent(/eski@baska\.com/);
    expect(screen.getByRole("status")).toHaveTextContent(/yeni@firma\.com/);
  });

  it("oturum yoksa uyarı yok", () => {
    render(<AcceptInviteClient token="tok" />);
    expect(screen.queryByText(/olarak oturum açık/)).toBeNull();
  });
});
