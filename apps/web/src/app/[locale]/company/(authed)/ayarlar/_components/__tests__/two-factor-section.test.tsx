// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
