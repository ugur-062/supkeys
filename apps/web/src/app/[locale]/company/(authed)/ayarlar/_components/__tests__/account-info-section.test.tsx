// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  roles: string[];
  isOwner: boolean;
};

const h = vi.hoisted(() => ({
  updateMeAsync: vi.fn(),
  // Kararlı nesne: bileşen `[user]` değişince formu yeniden kurar — her çizimde
  // yeni nesne yazılanı silerdi. Testler `auth.user`ı baştan atar.
  auth: { user: null as unknown },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/use-company-account", () => ({
  NOTIFICATION_PREFS: [],
  useChangePassword: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMe: () => ({ mutateAsync: h.updateMeAsync, isPending: false }),
  useUpdateNotificationPrefs: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => h.auth }));
vi.mock("sonner", () => ({ toast: h.toast }));

import { AccountInfoSection } from "../account-settings-section";

const makeUser = (over: Partial<TestUser> = {}): TestUser => ({
  id: "u1",
  email: "ada@firma.com",
  firstName: "Ada",
  lastName: "Yılmaz",
  phone: null,
  roles: ["SAHIP", "SATISCI"],
  isOwner: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.updateMeAsync.mockResolvedValue({});
  h.auth.user = makeUser();
});

const openEditor = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Düzenle" }));
  return screen.getByLabelText("Telefon");
};
const saveButton = () => screen.getByRole("button", { name: "Kaydet" });
/** Salt okunur görünümde "Telefon" satırının değeri. */
const phoneRow = () => screen.getByText("Telefon", { selector: "dt" }).nextElementSibling;

/**
 * AYARLAR › HESAP BİLGİLERİ — TELEFON İSTEĞE BAĞLI (sahip kararı 2026-10-08).
 *
 * Kayıt ve davet kabul formları telefonu artık sormuyor: yeni hesapta
 * `user.phone` null'dır. Bu ekran numaranın eklenebildiği TEK yerdir ve alan
 * isteğe bağlı kalır: boş bırakılabilir, kayıtlı numara silinebilir, yazılan
 * numara eskisi gibi (ülkeye göre uzunluk) doğrulanır.
 */
describe("AccountInfoSection — telefon isteğe bağlı", () => {
  it("telefonsuz hesap: salt okunur satır '—' gösterir, 'null' yazmaz", () => {
    render(<AccountInfoSection />);
    expect(phoneRow()).toHaveTextContent(/^—$/);
    expect(document.body.textContent).not.toMatch(/null|undefined/);
  });

  it("telefonsuz hesap: telefon boşken öteki alanlar kaydedilir (telefon hatası yok)", async () => {
    const user = userEvent.setup();
    render(<AccountInfoSection />);
    const phone = await openEditor(user);
    expect(phone).toHaveValue("");
    // Hiçbir şey değişmedi → kaydedilecek bir şey yok.
    expect(saveButton()).toBeDisabled();

    const firstName = screen.getByLabelText("Ad");
    await user.clear(firstName);
    await user.type(firstName, "Adile");
    expect(saveButton()).toBeEnabled();
    await user.click(saveButton());

    expect(screen.queryByText("Geçerli bir telefon numarası girin")).toBeNull();
    expect(h.updateMeAsync).toHaveBeenCalledTimes(1);
    // Boş telefon "" gider → API numarayı null saklar.
    expect(h.updateMeAsync).toHaveBeenCalledWith({ firstName: "Adile", lastName: "Yılmaz", phone: "" });
    expect(h.toast.success).toHaveBeenCalledWith("Bilgiler güncellendi");
  });

  it("telefonsuz hesap numara ekler: geçerli numara ülke koduyla gider", async () => {
    const user = userEvent.setup();
    render(<AccountInfoSection />);
    const phone = await openEditor(user);
    await user.type(phone, "5321234567");
    await user.click(saveButton());
    expect(h.updateMeAsync).toHaveBeenCalledWith({
      firstName: "Ada",
      lastName: "Yılmaz",
      phone: "+90 5321234567",
    });
  });

  it("kayıtlı numara SİLİNEBİLİR: alan boşaltılınca kayıt açılır ve boş telefon gider", async () => {
    h.auth.user = makeUser({ phone: "+90 5321234567" });
    const user = userEvent.setup();
    render(<AccountInfoSection />);
    expect(phoneRow()).toHaveTextContent("+90 5321234567");

    const phone = await openEditor(user);
    expect(phone).toHaveValue("5321234567");
    expect(saveButton()).toBeDisabled();
    await user.clear(phone);
    expect(saveButton()).toBeEnabled();
    await user.click(saveButton());

    expect(screen.queryByText("Geçerli bir telefon numarası girin")).toBeNull();
    expect(h.updateMeAsync).toHaveBeenCalledWith({ firstName: "Ada", lastName: "Yılmaz", phone: "" });
  });

  it("yazılan numara eskisi gibi doğrulanır: eksik numara satır içi hata verir, istek atılmaz", async () => {
    const user = userEvent.setup();
    render(<AccountInfoSection />);
    const phone = await openEditor(user);
    await user.type(phone, "532123");
    await user.click(saveButton());
    expect(screen.getByText("Geçerli bir telefon numarası girin")).toBeInTheDocument();
    expect(h.updateMeAsync).not.toHaveBeenCalled();

    // Rus kullanıcı bayrağı değiştirmeden "8 916…" yazdı → "+90 89161234567" geçmez.
    await user.clear(phone);
    await user.type(phone, "89161234567");
    await user.click(saveButton());
    expect(screen.getByText("Geçerli bir telefon numarası girin")).toBeInTheDocument();
    expect(h.updateMeAsync).not.toHaveBeenCalled();

    // Düzeltilince gider.
    await user.clear(phone);
    await user.type(phone, "5321234567");
    await user.click(saveButton());
    expect(h.updateMeAsync).toHaveBeenCalledWith({
      firstName: "Ada",
      lastName: "Yılmaz",
      phone: "+90 5321234567",
    });
  });

  // İnceleme R1 (2026-10-08): telefon isteğe bağlı olduğu için reddedilen numarayı silmek
  // formu "değişmemiş" yapar ve Kaydet pasifleşir — hata ekranda takılı kalmamalı.
  it("reddedilen numara silinince hata kaybolur; hatalıyken kutu geçersiz işaretlenir", async () => {
    const user = userEvent.setup();
    render(<AccountInfoSection />);
    const phone = await openEditor(user);
    await user.type(phone, "532123");
    await user.click(saveButton());
    expect(screen.getByText("Geçerli bir telefon numarası girin")).toBeInTheDocument();
    expect(phone).toHaveAttribute("aria-invalid", "true");

    await user.clear(phone);
    expect(screen.queryByText("Geçerli bir telefon numarası girin")).toBeNull();
    expect(phone).not.toHaveAttribute("aria-invalid", "true");
    expect(h.updateMeAsync).not.toHaveBeenCalled();
  });

  it("vazgeç: yazılan numara atılır, telefonsuz hesap telefonsuz kalır", async () => {
    const user = userEvent.setup();
    render(<AccountInfoSection />);
    const phone = await openEditor(user);
    await user.type(phone, "5321234567");
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(h.updateMeAsync).not.toHaveBeenCalled();
    expect(phoneRow()).toHaveTextContent(/^—$/);
    expect(await openEditor(user)).toHaveValue("");
  });
});
