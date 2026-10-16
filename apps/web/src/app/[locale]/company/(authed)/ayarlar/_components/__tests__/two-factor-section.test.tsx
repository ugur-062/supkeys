// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messagesFor, WEB_NAMESPACES } from "@rothern/i18n/messages";

const h = vi.hoisted(() => ({
  user: null as null | { email: string; twoFactorEnabled: boolean; twoFactorMethod?: "AUTHENTICATOR" | "EMAIL" | null },
  sendCode: vi.fn(),
  enableEmail: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/hooks/use-company-account", () => ({
  useSetup2fa: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEnable2fa: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDisable2fa: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendEmail2faCode: () => ({ mutateAsync: h.sendCode, isPending: false }),
  useEnableEmail2fa: () => ({ mutateAsync: h.enableEmail, isPending: false }),
}));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => ({ user: h.user }) }));
vi.mock("sonner", () => ({ toast: h.toast }));

import { TwoFactorSection } from "../two-factor-section";

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { email: "ada@test.local", twoFactorEnabled: true, twoFactorMethod: "AUTHENTICATOR" };
});

/**
 * AYARLAR › 2FA (arayüz testi O-020, D-086, D-303, D-304): metin ve "E-postaya
 * kod gönder" düğmesi açık yönteme göre; Vazgeç kodu siler; tavan doluyken
 * "kod gönderildi" denmez.
 */
describe("TwoFactorSection", () => {
  it("authenticator yönteminde etkin yöntemi gösterir, e-posta kodu düğmesini gizler", async () => {
    const user = userEvent.setup();
    render(<TwoFactorSection />);
    expect(screen.getByText("Etkin yöntem: authenticator uygulaması")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2FA'yı Kapat" }));
    expect(screen.queryByRole("button", { name: "E-postaya kod gönder" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Authenticator uygulamanızdaki 6 haneli kodu ya da kurtarma kodlarınızdan birini girin."),
    ).toBeInTheDocument();
  });

  it("e-posta yönteminde düğme görünür; tavan doluysa 'gönderildi' yerine sınır bilgisi verir", async () => {
    h.user = { email: "ada@test.local", twoFactorEnabled: true, twoFactorMethod: "EMAIL" };
    h.sendCode.mockResolvedValue({ sent: false, capped: true });
    const user = userEvent.setup();
    render(<TwoFactorSection />);
    expect(screen.getByText("Etkin yöntem: e-postanıza gelen kod")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2FA'yı Kapat" }));
    await user.click(screen.getByRole("button", { name: "E-postaya kod gönder" }));
    expect(h.toast.info).toHaveBeenCalledWith(
      "Kısa sürede çok fazla kod istendi; yeni kod gönderilmedi. E-postanıza gelen son kod hâlâ geçerli.",
    );
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it("kapatma formunda Vazgeç girilen kodu temizler", async () => {
    const user = userEvent.setup();
    render(<TwoFactorSection />);
    await user.click(screen.getByRole("button", { name: "2FA'yı Kapat" }));
    await user.type(screen.getByLabelText("Doğrulama kodu veya kurtarma kodu"), "123456");
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    await user.click(screen.getByRole("button", { name: "2FA'yı Kapat" }));
    expect(screen.getByLabelText("Doğrulama kodu veya kurtarma kodu")).toHaveValue("");
  });

  it("e-posta ile kurulumda kurtarma kutusu e-posta erişimine göre konuşur", async () => {
    h.user = { email: "ada@test.local", twoFactorEnabled: false, twoFactorMethod: null };
    h.sendCode.mockResolvedValue({ sent: true });
    h.enableEmail.mockResolvedValue({ ok: true, recoveryCodes: ["AAAA-BBBB"] });
    const user = userEvent.setup();
    render(<TwoFactorSection />);
    await user.click(screen.getByRole("button", { name: "E-posta ile Kur" }));
    expect(h.toast.success).toHaveBeenCalledWith("E-postanıza doğrulama kodu gönderildi");
    await user.type(screen.getByLabelText("Doğrulama kodu"), "123456");
    await user.click(screen.getByRole("button", { name: "Doğrula & Aç" }));
    expect(
      screen.getByText(
        "E-posta adresinize erişemezseniz bu kodlardan biriyle giriş yapabilirsiniz. Her kod tek kullanımlıktır.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Authenticator cihazınızı kaybederseniz/)).not.toBeInTheDocument();
  });

  // Yeniden doğrulama (webC-08): yer tutucu "6 haneli kod ya da XXXX-XXXX"
  // 240px tavanında mobilde/RU'da kesiliyordu.
  it("kapatma kodu alanı yer tutucuyu kesecek 240px tavanı taşımaz", async () => {
    const user = userEvent.setup();
    render(<TwoFactorSection />);
    await user.click(screen.getByRole("button", { name: "2FA'yı Kapat" }));
    const input = screen.getByLabelText("Doğrulama kodu veya kurtarma kodu");
    expect(input.getAttribute("placeholder")).toBe("6 haneli kod ya da XXXX-XXXX");
    expect(input.outerHTML).not.toContain("max-w-[240px]");
  });
});

/**
 * KURTARMA KODLARI .txt (mobil kabuk 2026-10-16): dosya `lib/save-file.ts`
 * ile verilir — tarayıcıda bugünkü `<a download>`, mobil kabukta Filesystem +
 * Share, eklentisiz eski uygulama sürümünde "siteden yapın" bilgisi.
 */
describe("TwoFactorSection — kurtarma kodlarını .txt indir", () => {
  type ShellWindow = Window & { Capacitor?: unknown };
  let clicked: HTMLAnchorElement[];

  beforeEach(() => {
    clicked = [];
    // Bırakma zamanlayıcısı test bittikten sonra da ateşlenebilir — saplama kalır.
    URL.createObjectURL = vi.fn(() => "blob:codes") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
    h.user = { email: "ada@test.local", twoFactorEnabled: false, twoFactorMethod: null };
    h.sendCode.mockResolvedValue({ sent: true });
    h.enableEmail.mockResolvedValue({ ok: true, recoveryCodes: ["AAAA-BBBB", "CCCC-DDDD"] });
  });

  afterEach(() => {
    delete (window as ShellWindow).Capacitor;
    vi.restoreAllMocks();
  });

  async function showCodes() {
    const user = userEvent.setup();
    render(<TwoFactorSection />);
    await user.click(screen.getByRole("button", { name: "E-posta ile Kur" }));
    await user.type(screen.getByLabelText("Doğrulama kodu"), "123456");
    await user.click(screen.getByRole("button", { name: "Doğrula & Aç" }));
    return user;
  }

  it("tarayıcıda dosya adıyla indirir (bugünkü davranış)", async () => {
    const user = await showCodes();
    await user.click(screen.getByRole("button", { name: ".txt İndir" }));
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe("rothern-2fa-kurtarma-kodlari.txt");
    const blob = (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Blob;
    expect(await blob.text()).toContain("AAAA-BBBB\nCCCC-DDDD");
  });

  it("mobil kabukta önbelleğe yazar ve paylaşım sayfasını açar", async () => {
    const writeFile = vi.fn<(o: { path: string; data: string; directory: string }) => Promise<{ uri: string }>>(
      async () => ({ uri: "file:///cache/rothern-2fa-kurtarma-kodlari.txt" }),
    );
    const share = vi.fn(async () => ({}));
    (window as ShellWindow).Capacitor = {
      isNativePlatform: () => true,
      Plugins: { Filesystem: { writeFile }, Share: { share } },
    };
    const user = await showCodes();
    await user.click(screen.getByRole("button", { name: ".txt İndir" }));

    await vi.waitFor(() => expect(share).toHaveBeenCalled());
    const args = writeFile.mock.calls[0]![0];
    expect(args.path).toBe("rothern-2fa-kurtarma-kodlari.txt");
    expect(args.directory).toBe("CACHE");
    const text = new TextDecoder().decode(Uint8Array.from(atob(args.data), (c) => c.charCodeAt(0)));
    expect(text).toContain("AAAA-BBBB\nCCCC-DDDD");
    expect(text).toContain("ada@test.local");
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ files: ["file:///cache/rothern-2fa-kurtarma-kodlari.txt"] }),
    );
    expect(clicked).toHaveLength(0);
  });

  it("eklentisiz eski uygulama sürümünde 'siteden yapın' bilgisi; indirme yok", async () => {
    (window as ShellWindow).Capacitor = { isNativePlatform: () => true, Plugins: { App: {} } };
    const user = await showCodes();
    await user.click(screen.getByRole("button", { name: ".txt İndir" }));
    await vi.waitFor(() =>
      expect(h.toast.info).toHaveBeenCalledWith(
        "Bu işlem uygulamanın bu sürümünde yok — rothern.com'dan yapabilirsiniz.",
      ),
    );
    expect(clicked).toHaveLength(0);
  });
});

// Yeniden doğrulama (webC-08): sayfa alt başlığı yöntemden bağımsız olmalı —
// e-posta kodu da sunuluyor ve etkin yöntem olabilir (D-086).
describe("2FA ayar sayfası açıklaması", () => {
  it.each(["tr", "en", "ru"] as const)("%s: açıklama yalnız authenticator uygulamasından söz etmez", (locale) => {
    const m = messagesFor(locale, WEB_NAMESPACES) as {
      web: { panel: { settings: { settingsPages: { twoFactor: { description: string } } } } };
    };
    const d = m.web.panel.settings.settingsPages.twoFactor.description;
    expect(d.length).toBeGreaterThan(0);
    expect(d).not.toMatch(/authenticator|аутентификатор/i);
  });
});
