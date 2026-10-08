// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  post: vi.fn(),
  /** `POST /auth/password-reset/check` yanıtı (sayfa açılışındaki denetim). */
  check: vi.fn(),
  /** `POST /auth/password-reset/confirm` yanıtı. */
  confirm: vi.fn(),
  push: vi.fn(),
  token: "a".repeat(64) as string | null,
  setup: null as string | null,
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  useSearchParams: () => ({
    get: (k: string) => (k === "token" ? h.token : k === "setup" ? h.setup : null),
  }),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { post: h.post },
}));

import { LINK_CHECK_WAIT_MS, ResetPasswordForm } from "../reset-password-form";

const CHECK = "/auth/password-reset/check";
const CONFIRM = "/auth/password-reset/confirm";

beforeEach(() => {
  vi.clearAllMocks();
  h.token = "a".repeat(64);
  h.setup = null;
  // Varsayılan: bağlantı geçerli; istekler uca göre ayrışır.
  h.check.mockResolvedValue({ data: { valid: true } });
  h.confirm.mockResolvedValue({ data: { success: true } });
  h.post.mockImplementation((url: string, ...rest: unknown[]) =>
    url === CHECK ? h.check(url, ...rest) : h.confirm(url, ...rest),
  );
});
afterEach(() => {
  vi.useRealTimers();
});

/** Sayfa açılışındaki bağlantı denetimi bitince form gelir. */
async function renderForm() {
  render(<ResetPasswordForm />);
  return screen.findByLabelText("Yeni Şifre");
}

async function fillBoth(user: ReturnType<typeof userEvent.setup>, password: string, repeat = password) {
  await user.clear(screen.getByLabelText("Yeni Şifre"));
  await user.type(screen.getByLabelText("Yeni Şifre"), password);
  await user.clear(screen.getByLabelText("Şifreyi Tekrar"));
  await user.type(screen.getByLabelText("Şifreyi Tekrar"), repeat);
}

describe("ResetPasswordForm", () => {
  it("token yoksa hata kutusu + YENİ BAĞLANTI linki /company/sifremi-unuttum'a gider", () => {
    h.token = null;
    render(<ResetPasswordForm />);
    expect(screen.getByRole("alert")).toHaveTextContent("Geçersiz bağlantı");
    expect(
      screen.getByRole("link", { name: "Yeni bağlantı iste" }),
    ).toHaveAttribute("href", "/company/sifremi-unuttum");
    // Biçimi bozuk jeton için sunucuya sorulmaz.
    expect(h.post).not.toHaveBeenCalled();
  });

  it("politika backend ile hizalı: büyük harfsiz parola frontend'de reddedilir (istek atılmaz)", async () => {
    const user = userEvent.setup();
    await renderForm();
    await fillBoth(user, "kucukharf1");
    await user.click(
      screen.getByRole("button", { name: "Şifreyi Değiştir" }),
    );
    expect(
      screen.getByText("En az bir büyük harf içermeli"),
    ).toBeInTheDocument();
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("politika kayıtla AYNI: özel karaktersiz ve 10 karakterden kısa şifre reddedilir (yayın denetimi Bölüm 9)", async () => {
    const user = userEvent.setup();
    await renderForm();
    await fillBoth(user, "GucluParola12");
    await user.click(screen.getByRole("button", { name: "Şifreyi Değiştir" }));
    expect(screen.getByText("En az bir özel karakter içermeli")).toBeInTheDocument();
    await fillBoth(user, "Parola12!");
    await user.click(screen.getByRole("button", { name: "Şifreyi Değiştir" }));
    // Alan hatası girdiye bağlı (kural listesindeki aynı metinden ayrı).
    expect(screen.getByLabelText("Yeni Şifre")).toHaveAccessibleDescription("En az 10 karakter");
    expect(screen.getByLabelText("Yeni Şifre")).toHaveAttribute("aria-invalid", "true");
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("eşleşmeyen parolalar reddedilir", async () => {
    const user = userEvent.setup();
    await renderForm();
    await fillBoth(user, "Guclu!Parola1", "Farkli1234");
    await user.click(
      screen.getByRole("button", { name: "Şifreyi Değiştir" }),
    );
    expect(screen.getByText("Şifreler eşleşmiyor")).toBeInTheDocument();
    expect(screen.getByLabelText("Şifreyi Tekrar")).toHaveAccessibleDescription("Şifreler eşleşmiyor");
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("başarılı sıfırlama: token+parola POST edilir, başarı ekranı → /company/login", async () => {
    const user = userEvent.setup();
    await renderForm();
    await fillBoth(user, "Guclu!Parola1");
    await user.click(
      screen.getByRole("button", { name: "Şifreyi Değiştir" }),
    );

    expect(h.post).toHaveBeenCalledWith(CONFIRM, {
      token: "a".repeat(64),
      newPassword: "Guclu!Parola1",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Şifreniz değiştirildi",
    );
    await user.click(screen.getByRole("button", { name: "Giriş Yap" }));
    expect(h.push).toHaveBeenCalledWith("/company/login");
  });

  it("hesap kurulum bağlantısı (setup=1): 'Şifremi Belirle' düğmesi ve 'belirlendi' ekranı; oturum kapatma metni yok", async () => {
    const user = userEvent.setup();
    h.setup = "1";
    await renderForm();
    expect(screen.queryByRole("button", { name: "Şifreyi Değiştir" })).toBeNull();
    await fillBoth(user, "Guclu!Parola1");
    await user.click(screen.getByRole("button", { name: "Şifremi Belirle" }));
    expect(h.post).toHaveBeenCalledWith(CONFIRM, {
      token: "a".repeat(64),
      newPassword: "Guclu!Parola1",
    });
    expect(h.toast.success).toHaveBeenCalledWith("Şifre belirlendi");
    const done = screen.getByRole("status");
    expect(done).toHaveTextContent("Şifreniz belirlendi");
    expect(done).not.toHaveTextContent("oturumlarınız kapatıldı");
  });

  it("backend hatası (süresi dolmuş token) alert olarak gösterilir", async () => {
    const user = userEvent.setup();
    h.confirm.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "Bağlantının süresi dolmuş" } },
    });
    await renderForm();
    await fillBoth(user, "Guclu!Parola1");
    await user.click(
      screen.getByRole("button", { name: "Şifreyi Değiştir" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/süresi dolmuş/i);
    // Form ekranda kalır — kullanıcı yeni bağlantı isteyebilir.
    expect(screen.getByLabelText("Yeni Şifre")).toBeInTheDocument();
  });

  // Arayüz testi D-085: kesik/kullanılmış bağlantı ham doğrulama metni ya da
  // form içi hata yerine "geçersiz bağlantı" kartı + yeni bağlantı yolu.
  it("kesik token (deadbeef): form yerine geçersiz bağlantı kartı", () => {
    h.token = "deadbeef";
    render(<ResetPasswordForm />);
    expect(screen.getByRole("alert")).toHaveTextContent("Geçersiz bağlantı");
    expect(screen.getByRole("link", { name: "Yeni bağlantı iste" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Yeni Şifre")).toBeNull();
  });

  it("403 (kullanılmış bağlantı): sunucu nedeniyle geçersiz bağlantı kartı", async () => {
    const user = userEvent.setup();
    h.confirm.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { message: "Bu bağlantı zaten kullanılmış" } },
    });
    await renderForm();
    await fillBoth(user, "Guclu!Parola1");
    await user.click(screen.getByRole("button", { name: "Şifreyi Değiştir" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Bu bağlantı zaten kullanılmış");
    expect(screen.getByRole("link", { name: "Yeni bağlantı iste" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Yeni Şifre")).toBeNull();
  });

  it("400 token alan hatası da bağlantı kartına gider", async () => {
    const user = userEvent.setup();
    h.confirm.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "Doğrulama hatası", errors: { token: "Geçersiz veya kullanılmış bağlantı" } } },
    });
    await renderForm();
    await fillBoth(user, "Guclu!Parola1");
    await user.click(screen.getByRole("button", { name: "Şifreyi Değiştir" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Geçersiz veya kullanılmış bağlantı");
    expect(screen.queryByLabelText("Yeni Şifre")).toBeNull();
  });
});

// Arayüz testi 2026-10 login-16: kullanılmış / yenisiyle değiştirilmiş bağlantı
// tam formu gösteriyor, kullanıcı ölü olduğunu şifreyi iki kez yazınca öğreniyordu.
describe("ResetPasswordForm — bağlantı sayfa AÇILIRKEN denetlenir (login-16)", () => {
  it("açılışta POST check { token } sorulur (global hata toast'ı kapalı); yanıt gelene dek form yok", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    h.check.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ResetPasswordForm />);
    expect(h.post).toHaveBeenCalledWith(CHECK, { token: "a".repeat(64) }, { skipErrorToast: true });
    expect(screen.getByRole("status")).toHaveTextContent("Bağlantı denetleniyor…");
    expect(screen.queryByLabelText("Yeni Şifre")).toBeNull();
    await act(async () => resolve({ data: { valid: true } }));
    expect(await screen.findByLabelText("Yeni Şifre")).toBeInTheDocument();
  });

  it("valid:false → form HİÇ çizilmeden geçersiz bağlantı kartı + yeni bağlantı yolu", async () => {
    h.check.mockResolvedValue({ data: { valid: false } });
    render(<ResetPasswordForm />);
    const card = await screen.findByRole("alert");
    expect(card).toHaveTextContent("Geçersiz bağlantı");
    expect(within(card).getByRole("link", { name: "Yeni bağlantı iste" })).toHaveAttribute(
      "href",
      "/company/sifremi-unuttum",
    );
    expect(screen.queryByLabelText("Yeni Şifre")).toBeNull();
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it.each([
    ["404 (uç henüz dağıtılmamış)", () => Promise.reject({ isAxiosError: true, response: { status: 404 } })],
    ["ağ hatası", () => Promise.reject(new Error("Network Error"))],
    ["429 hız sınırı", () => Promise.reject({ isAxiosError: true, response: { status: 429 } })],
    ["403 (ör. CSRF) — 'geçersiz' SAYILMAZ", () => Promise.reject({ isAxiosError: true, response: { status: 403 } })],
    ["tanınmayan gövde", () => Promise.resolve({ data: { success: true } })],
  ])("%s → karar verilemez, FORM açılır", async (_name, answer) => {
    h.check.mockImplementation(answer);
    render(<ResetPasswordForm />);
    expect(await screen.findByLabelText("Yeni Şifre")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it(`yanıt ${LINK_CHECK_WAIT_MS} ms içinde gelmezse form açılır; sonradan gelen 'geçersiz' yine karta çevirir`, async () => {
    vi.useFakeTimers();
    let resolve: (v: unknown) => void = () => undefined;
    h.check.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ResetPasswordForm />);
    expect(screen.queryByLabelText("Yeni Şifre")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LINK_CHECK_WAIT_MS);
    });
    expect(screen.getByLabelText("Yeni Şifre")).toBeInTheDocument();
    await act(async () => {
      resolve({ data: { valid: false } });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Geçersiz bağlantı");
    expect(screen.queryByLabelText("Yeni Şifre")).toBeNull();
  });
});

describe("ResetPasswordForm — kurallar görünür kontrol listesi (login-3, login-4)", () => {
  it("kurallar yer tutucuda değil, yazmadan ÖNCE de okunan listede (kayıt formuyla aynı bileşen)", async () => {
    const input = await renderForm();
    expect(input).not.toHaveAttribute("placeholder");
    const list = screen.getByRole("list");
    for (const rule of ["En az 10 karakter", "Küçük harf", "Büyük harf", "Rakam", "Özel karakter"]) {
      expect(within(list).getByText(rule)).toBeInTheDocument();
    }
    // Boş alanda güç etiketi yazılmaz.
    expect(screen.queryByText("Çok Zayıf")).toBeNull();
  });

  it("liste yazarken güncellenir; karşılanmayan kural zinc-400 değil", async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.type(screen.getByLabelText("Yeni Şifre"), "abc");
    const list = screen.getByRole("list");
    expect(within(list).getByText("Küçük harf").className).toContain("text-emerald-600");
    const unmet = within(list).getByText("Büyük harf");
    expect(unmet.className).toContain("text-zinc-500");
    expect(unmet.className).not.toContain("text-zinc-400");
  });

  it.each(["Пароль-Секрет1!", "ŞİĞÜÖÇ-şığüöç1!"])(
    "Unicode: %s — Kiril/Türkçe harf harftir, 'küçük harf yok' denmez, şifre kabul edilir",
    async (password) => {
      const user = userEvent.setup();
      await renderForm();
      await fillBoth(user, password);
      await user.click(screen.getByRole("button", { name: "Şifreyi Değiştir" }));
      expect(screen.queryByText("En az bir küçük harf içermeli")).toBeNull();
      expect(h.confirm).toHaveBeenCalledWith(CONFIRM, { token: "a".repeat(64), newPassword: password });
    },
  );

  it("harf 'özel karakter' sayılmaz: simgesiz 'şifreŞİFRE12' reddedilir", async () => {
    const user = userEvent.setup();
    await renderForm();
    await fillBoth(user, "şifreŞİFRE12");
    await user.click(screen.getByRole("button", { name: "Şifreyi Değiştir" }));
    expect(screen.getByText("En az bir özel karakter içermeli")).toBeInTheDocument();
    expect(h.confirm).not.toHaveBeenCalled();
  });

  // relogin-1: 35 büyük Kiril harf + "ж1!" (38 karakter, 74 bayt) beş kuralı
  // karşılar ama form onu reddeder. Kırmızı "şifre çok uzun" iletisinin hemen
  // altında çubuk dolu yeşil, etiket "Çok Güçlü" ve beş kural da işaretliydi.
  it("üst sınırı aşan şifre: etiket 'Çok Güçlü' demez, liste üst sınırı karşılanmamış gösterir", async () => {
    const user = userEvent.setup();
    await renderForm();
    const tooLong = "Я".repeat(35) + "ж1!";
    const input = screen.getByLabelText("Yeni Şifre");
    await user.click(input);
    await user.paste(tooLong);
    const meter = screen.getByRole("status");
    expect(within(meter).queryByText("Çok Güçlü")).toBeNull();
    expect(within(meter).getByText("Orta")).toBeInTheDocument();
    // Çubuk dolu yeşil değil.
    const bar = meter.querySelector<HTMLElement>("[style*='width']")!;
    expect(bar.className).not.toContain("bg-emerald-500");
    expect(bar.style.width).toBe("80%");
    // Üst sınır öteki kuralların yanında, karşılanmamış olarak.
    const list = within(meter).getByRole("list");
    const max = within(list).getByText("En fazla 72 karakter");
    expect(max.className).toContain("text-red-600");
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    // Gönderimde alan iletisi aynı sebebi söyler; istek atılmaz.
    await user.click(screen.getByLabelText("Şifreyi Tekrar"));
    await user.paste(tooLong);
    await user.click(screen.getByRole("button", { name: "Şifreyi Değiştir" }));
    expect(input).toHaveAccessibleDescription(/Şifre çok uzun/);
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("sınırın içindeki güçlü şifre: 'Çok Güçlü', çubuk dolu yeşil, üst sınır satırı yok", async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.click(screen.getByLabelText("Yeni Şifre"));
    await user.paste("Guclu!Parola9");
    const meter = screen.getByRole("status");
    expect(within(meter).getByText("Çok Güçlü")).toBeInTheDocument();
    const bar = meter.querySelector<HTMLElement>("[style*='width']")!;
    expect(bar.className).toContain("bg-emerald-500");
    expect(within(meter).queryByText("En fazla 72 karakter")).toBeNull();
    expect(within(meter).getAllByRole("listitem")).toHaveLength(5);
  });

  it("iki şifre alanı da 72 karakter tavanı taşır", async () => {
    await renderForm();
    expect(screen.getByLabelText("Yeni Şifre")).toHaveAttribute("maxlength", "72");
    expect(screen.getByLabelText("Şifreyi Tekrar")).toHaveAttribute("maxlength", "72");
  });
});
