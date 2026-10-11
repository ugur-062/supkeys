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
 * Karakter karakter `user.type` her tuşta tüm formu yeniden çizdiriyordu; tam
 * suite paralel koşarken bu kurulum adımları testleri 15 sn zaman aşımına
 * itiyordu.
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
  // Sahip kararı 2026-10-08: davet kabul formu telefonu SORMAZ (kayıt formuyla
  // aynı gerekçe: numara doğrulanmıyordu, başka firmaya gösterilmiyordu).
  it("telefon alanı YOK: ne etiket, ne ülke kodu seçici, ne tel kutusu", () => {
    render(<AcceptInviteClient token="tok" />);
    expect(screen.queryByText(/telefon/i)).toBeNull();
    expect(screen.queryByLabelText("Ülke kodu")).toBeNull();
    expect(screen.queryByPlaceholderText("5XX XXX XX XX")).toBeNull();
    expect(document.querySelector('input[type="tel"]')).toBeNull();
    // Formun alanları sırasıyla: ad, soyad, şifre, şifre tekrarı.
    const labels = Array.from(submitButton().closest("form")!.querySelectorAll("label[data-slot='label']"))
      .slice(0, 4)
      .map((l) => l.textContent);
    expect(labels).toEqual(["Ad", "Soyad", "Şifre", "Şifre (tekrar)"]);
  });

  it("kabul gider; gövdede `phone` YOKTUR ve panele yönlenir", async () => {
    const user = userEvent.setup();
    h.acceptAsync.mockResolvedValue({ user: { id: "u1" }, company: { id: "c1" } });
    render(<AcceptInviteClient token="tok" />);
    await fillRequired(user);
    expect(submitButton()).toBeEnabled();
    await user.click(submitButton());
    await waitFor(() => expect(h.acceptAsync).toHaveBeenCalledTimes(1));
    const body = h.acceptAsync.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("phone");
    expect(body).toMatchObject({ firstName: "Ada", lastName: "Yılmaz", password: "Guclu!Parola9" });
    expect(Object.keys(body).sort()).toEqual(
      [
        "firstName",
        "kvkkAccepted",
        "lastName",
        "marketingConsent",
        "mediationAccepted",
        "password",
        "profileImprovementConsent",
        "termsAccepted",
      ].sort(),
    );
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

  // CLAUDE.md "Arayüz tuzakları" (webC-09): `<Field>` içindeki denetim etiketin
  // HEMEN ardından gelen `data-slot="control"` kökü olmalı — araya giren
  // sarmalayıcı div etiket boşluğunu düşürür.
  it("her etiketin hemen ardındaki öğe data-slot=control taşır (etiket boşluğu tüm alanlarda aynı)", () => {
    render(<AcceptInviteClient token="tok" />);
    for (const label of ["Ad", "Soyad", "Şifre", "Şifre (tekrar)"]) {
      const el = screen.getByText(label, { selector: "[data-slot='label']" }).nextElementSibling;
      expect(el, label).toHaveAttribute("data-slot", "control");
    }
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
