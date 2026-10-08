// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock("@/hooks/use-company-account", () => ({
  NOTIFICATION_PREFS: [],
  useChangePassword: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
  useUpdateMe: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateNotificationPrefs: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => ({ user: null }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PASSWORD_MAX_LENGTH } from "@/lib/company-auth/password-rules";
import { PasswordSection } from "../account-settings-section";

beforeEach(() => vi.clearAllMocks());

/**
 * AYARLAR › ŞİFRE politikası kayıt/davetle AYNI kaynaktan (`usePasswordRules`):
 * 10 karakter + küçük/büyük harf + rakam + özel karakter. Eskiden bu ekran
 * 8 karakter ve özel karaktersiz şifreyi kabul ediyordu (yayın denetimi
 * 2026-09-28 Bölüm 9; API tarafı `password-policy-parity.spec`).
 */
describe("PasswordSection", () => {
  async function fill(next: string) {
    const user = userEvent.setup();
    render(<PasswordSection />);
    await user.type(screen.getByLabelText("Mevcut Şifre"), "Eski!Sifre12");
    await user.type(screen.getByLabelText("Yeni Şifre"), next);
    await user.type(screen.getByLabelText("Yeni Şifre (Tekrar)"), next);
    await user.click(screen.getByRole("button", { name: "Şifreyi Değiştir" }));
  }

  it("özel karaktersiz şifre gönderilmez; gereksinim listesinde özel karakter var", async () => {
    await fill("GucluParola12");
    expect(screen.getByText("Yeni şifre aşağıdaki gereksinimlerin tümünü karşılamalı")).toBeInTheDocument();
    expect(screen.getByText("Özel karakter")).toBeInTheDocument();
    expect(screen.getByText("En az 10 karakter")).toBeInTheDocument();
    expect(h.mutateAsync).not.toHaveBeenCalled();
  });

  // relogin-1 (aynı çelişki bu ekranın kendi ölçerinde): 74 baytlık şifre
  // reddedilir; ölçer "Güçlü" demez, liste üst sınırı karşılanmamış gösterir.
  it("üst sınırı aşan şifre: ölçer 'Güçlü' demez, listede üst sınır satırı çıkar, istek atılmaz", async () => {
    const user = userEvent.setup();
    render(<PasswordSection />);
    const next = screen.getByLabelText("Yeni Şifre");
    await user.click(next);
    await user.paste("Я".repeat(35) + "ж1!");
    expect(screen.queryByText("Güçlü")).toBeNull();
    expect(screen.queryByText("İyi")).toBeNull();
    expect(screen.getByText("Orta")).toBeInTheDocument();
    expect(screen.getByText("Çok uzun (ş, ö, я gibi harfler 2 sayılır; en fazla 72)")).toBeInTheDocument();
    await user.clear(next);
    await user.paste("Guclu!Parola9xyz");
    expect(screen.getByText("Güçlü")).toBeInTheDocument();
    expect(screen.queryByText("Çok uzun (ş, ö, я gibi harfler 2 sayılır; en fazla 72)")).toBeNull();
    expect(h.mutateAsync).not.toHaveBeenCalled();
  });

  it("9 karakterlik şifre gönderilmez", async () => {
    await fill("Parola12!");
    expect(h.mutateAsync).not.toHaveBeenCalled();
  });

  it("göster/gizle düğmeleri klavyeyle erişilir, dolgu iç kutuda (arayüz testi D-306, D-352)", async () => {
    const user = userEvent.setup();
    render(<PasswordSection />);
    const current = screen.getByLabelText("Mevcut Şifre");
    expect(current).toHaveAttribute("type", "password");
    await user.click(current);
    await user.tab();
    const toggle = screen.getAllByRole("button", { name: "Şifreyi göster" })[0];
    expect(toggle).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(current).toHaveAttribute("type", "text");
    // Dolgu sarmalayıcıya değil iç <input>'a (göz kutunun içinde kalır).
    const wrapper = current.closest("[data-slot=control]");
    expect(wrapper?.className).toContain("[&_input]:pr-10");
    expect(wrapper?.className.split(/\s+/)).not.toContain("pr-10");
  });

  it("politikaya uyan şifre gönderilir", async () => {
    h.mutateAsync.mockResolvedValue({ ok: true });
    await fill("Yeni!Sifre123");
    expect(h.mutateAsync).toHaveBeenCalledWith({ currentPassword: "Eski!Sifre12", newPassword: "Yeni!Sifre123" });
  });

  /**
   * ÜST SINIR 72 UTF-8 BAYT — kayıt, davet ve sıfırlamayla AYNI yardımcıdan
   * (`firstUnmetPasswordRule`). Eskiden bu form yalnız beş gereksinimi
   * denetliyordu: alanın `maxLength`i karakter saydığı için 72 baytı aşan şifre
   * formdan geçip sunucuda reddediliyordu.
   */
  describe("üst sınır 72 bayt (kayıt ve sıfırlamayla ortak yardımcı)", () => {
    /** Uzun şifreler tek `paste` ile (tuş tuş yazmak her tuşta formu yeniden çizer). */
    async function fillPasted(next: string) {
      const user = userEvent.setup();
      render(<PasswordSection />);
      for (const [label, text] of [
        ["Mevcut Şifre", "Eski!Sifre12"],
        ["Yeni Şifre", next],
        ["Yeni Şifre (Tekrar)", next],
      ] as const) {
        await user.click(screen.getByLabelText(label));
        await user.paste(text);
      }
      await user.click(screen.getByRole("button", { name: "Şifreyi Değiştir" }));
    }
    const TOO_LONG = "Şifre çok uzun. En fazla 72 karakter olabilir; ç, ğ, ı, ö, ş, ü gibi harfler ve Kiril harfleri 2, emojiler 4 karakter sayılır.";

    it("72 karakter ama 73 bayt: gönderilmez, ileti kayıt formundakiyle aynı ve alana bağlı", async () => {
      // Beş gereksinimin hepsi tamam; alanın maxLength'i (72 karakter) kesmez.
      const password = "Aa1!" + "x".repeat(67) + "ş";
      expect(password).toHaveLength(72);
      await fillPasted(password);
      const field = screen.getByLabelText("Yeni Şifre");
      expect(field).toHaveValue(password);
      expect(h.mutateAsync).not.toHaveBeenCalled();
      expect(screen.getByText(TOO_LONG)).toBeInTheDocument();
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription(TOO_LONG);
      // Gereksinim listesi tamam olduğu için "gereksinimleri karşılamalı" denmez.
      expect(screen.queryByText("Yeni şifre aşağıdaki gereksinimlerin tümünü karşılamalı")).toBeNull();
    });

    it("40 karakter ama 76 bayt (Kiril harf 2 bayt) gönderilmez", async () => {
      await fillPasted("Aa1!" + "я".repeat(36));
      expect(h.mutateAsync).not.toHaveBeenCalled();
      expect(screen.getByText(TOO_LONG)).toBeInTheDocument();
    });

    it("tam 72 bayt (38 karakter, Kiril) gönderilir", async () => {
      h.mutateAsync.mockResolvedValue({ ok: true });
      const password = "Aa1!" + "я".repeat(34);
      await fillPasted(password);
      expect(h.mutateAsync).toHaveBeenCalledWith({ currentPassword: "Eski!Sifre12", newPassword: password });
    });

    it("üç şifre alanı da ortak tavanı taşır", () => {
      render(<PasswordSection />);
      for (const label of ["Mevcut Şifre", "Yeni Şifre", "Yeni Şifre (Tekrar)"]) {
        expect(screen.getByLabelText(label)).toHaveAttribute("maxlength", String(PASSWORD_MAX_LENGTH));
      }
    });
  });

  // Güç ölçer de ortak desenleri okur: kendi ASCII desenleri "Ç"yi büyük harf
  // saymıyor ("İyi"de kalıyordu), "ş"yi özel karakter sayıyordu.
  it("güç ölçer Unicode bilir: Türkçe büyük harf sayılır, harf özel karakter sayılmaz", async () => {
    const user = userEvent.setup();
    render(<PasswordSection />);
    const field = screen.getByLabelText("Yeni Şifre");
    await user.click(field);
    await user.paste("Çiçekşifre12!ğü");
    expect(screen.getByText("Güçlü")).toBeInTheDocument();
    await user.clear(field);
    await user.paste("şifreşifreşifre12");
    expect(screen.getByText("Orta")).toBeInTheDocument();
  });
});
