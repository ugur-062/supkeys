// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const h = vi.hoisted(() => ({ post: vi.fn(), logout: vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { post: h.post } }));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyLogout: () => h.logout }));

import { TermsAcceptanceGate } from "../terms-acceptance-gate";

function setUser(needsTermsAcceptance?: boolean) {
  useCompanyAuthStore.setState({
    user: { id: "u1", needsTermsAcceptance } as never,
    company: { id: "c1" } as never,
  } as never);
}

function renderGate() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TermsAcceptanceGate />
    </QueryClientProvider>,
  );
}

describe("TermsAcceptanceGate (derin denetim MU-04)", () => {
  beforeEach(() => {
    h.post.mockReset();
    h.logout.mockReset();
  });

  it("onayı olan kullanıcıda hiçbir şey çizmez", () => {
    setUser(false);
    renderGate();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("eski anlık görüntüde alan yoksa çizmez", () => {
    setUser(undefined);
    renderGate();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("onay izi yoksa kapı açılır; üç zorunlu onay olmadan gönderilemez, onayla kapanır", async () => {
    setUser(true);
    h.post.mockResolvedValue({
      data: {
        user: { id: "u1", needsTermsAcceptance: false },
        company: { id: "c1" },
        selfUpgradeEnabled: false,
      },
    });
    const uev = userEvent.setup();
    renderGate();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Sözleşmeleri onaylayın");
    const submit = screen.getByRole("button", { name: "Onayla ve devam et" });
    expect(submit).toBeDisabled();

    const boxes = screen.getAllByRole("checkbox");
    // İlk üç satır zorunlu onaylar (kullanıcı · aracılık · KVKK).
    await uev.click(boxes[0]);
    await uev.click(boxes[1]);
    expect(submit).toBeDisabled();
    await uev.click(boxes[2]);
    expect(submit).toBeEnabled();
    await uev.click(submit);

    expect(h.post).toHaveBeenCalledWith("/company-auth/accept-terms", {
      termsAccepted: true,
      mediationAccepted: true,
      kvkkAccepted: true,
      marketingConsent: false,
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(useCompanyAuthStore.getState().user?.needsTermsAcceptance).toBe(false);
  });

  it("Çıkış yap oturumu kapatır", async () => {
    setUser(true);
    const uev = userEvent.setup();
    renderGate();
    await uev.click(await screen.findByRole("button", { name: "Çıkış yap" }));
    expect(h.logout).toHaveBeenCalled();
  });

  /* Mağaza incelemesi (2026-10-16): pencere paneli örttüğü için Ayarlar'a
     ulaşılamaz — sözleşmeleri kabul etmek istemeyen kişi hesabını buradan siler
     (Apple 5.1.1(v)). Pencerenin içeriği ortak şifre formuna döner. */
  it("Hesabımı sil: pencere şifre formuna döner; Vazgeç onaya geri getirir, onayda silme isteği gider", async () => {
    setUser(true);
    h.post.mockResolvedValue({ data: { ok: true, companyClosed: false } });
    const uev = userEvent.setup();
    renderGate();
    await uev.click(await screen.findByRole("button", { name: "Hesabımı sil" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Hesabı sil");
    expect(screen.getByRole("link", { name: "Hesap silme" })).toHaveAttribute("href", "/hesap-silme");
    // Ön koşullar ve destek yolu panele girilemeyen pencerede de yazılı.
    expect(screen.getByRole("dialog")).toHaveTextContent("pasif olanlar dahil");
    expect(screen.getByRole("link", { name: "kvkk@rothern.com" })).toHaveAttribute("href", "mailto:kvkk@rothern.com");
    await uev.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Sözleşmeleri onaylayın");
    expect(h.post).not.toHaveBeenCalled();

    await uev.click(screen.getByRole("button", { name: "Hesabımı sil" }));
    await uev.type(screen.getByLabelText("Onaylamak için şifreniz"), "Dogru!Sifre12");
    await uev.click(screen.getByRole("button", { name: "Hesabımı kalıcı olarak sil" }));
    await waitFor(() =>
      expect(h.post).toHaveBeenCalledWith(
        "/company-auth/delete-account",
        { password: "Dogru!Sifre12" },
        { skipErrorToast: true },
      ),
    );
  });

  /* İnceleme 2026-10-16: başka kullanıcısı olan Kurucu buradan Kullanıcı
     Yönetimi'ne ulaşamaz — red "Kullanıcı Yönetimi'nde devredin" yerine destek
     adresini söyler (Google Play: ek adım varsa destek yolu). */
  it("Kurucu devri reddi bu pencerede destek adresine yönlendirir", async () => {
    setUser(true);
    const { AxiosError } = await import("axios");
    h.post.mockRejectedValue(
      new AxiosError("400", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        data: {
          code: "ACCOUNT_OWNER_MUST_TRANSFER",
          message: "Firmada başka kullanıcılar var. Hesabınızı silmeden önce kuruculuğu başka bir kullanıcıya devredin.",
        },
      } as never),
    );
    const uev = userEvent.setup();
    renderGate();
    await uev.click(await screen.findByRole("button", { name: "Hesabımı sil" }));
    await uev.type(screen.getByLabelText("Onaylamak için şifreniz"), "Dogru!Sifre12");
    await uev.click(screen.getByRole("button", { name: "Hesabımı kalıcı olarak sil" }));
    expect(await screen.findByText(/Kullanıcı Yönetimi bu ekrandan açılmaz; yardım için kvkk@rothern\.com/)).toBeInTheDocument();
  });
});
