// @vitest-environment jsdom
/**
 * AYARLAR HUB — sözleşme: kart kapısı = sayfa kapısı (izin), durum rozetleri
 * store verisinden, Firma Profili kartı Profilim'e; "galeri" sözcüğü yok
 * (2026-09-10). Onay Akışları kartı KALDIRILDI (2026-09-14, kullanıcı kararı):
 * özellik Onaylar sayfasının kendi görünümünde, tek giriş oradaki düğme.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1", isOwner: false, roles: [], permissions: ["buy:view"], twoFactorEnabled: false } as Record<string, unknown>,
  company: { companyVerificationStatus: "PENDING" } as Record<string, unknown>,
}));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => ({ user: h.user, company: h.company }) }));

import AyarlarPage from "../page";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

describe("AyarlarPage", () => {
  it("izinsiz kullanıcı yalnız kişisel kartları ve Firma Profili köprüsünü görür", () => {
    render(<AyarlarPage />);
    for (const t of ["Hesap Bilgileri", "Şifre İşlemleri", "Bildirim Tercihleri", "İki Adımlı Doğrulama", "Firma Profili"]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    for (const t of ["Firma Bilgileri", "Kullanıcı Yönetimi", "Banka Hesapları", "Onay Akışları", "Doğrulama Belgeleri", "Aktivite Logu"]) {
      expect(screen.queryByText(t)).toBeNull();
    }
    expect(screen.getByRole("link", { name: /Firma Profili/ })).toHaveAttribute("href", "/company/sirketim/profil");
    expect(screen.queryByText(/galeri/i)).toBeNull();
    // 2FA rozeti store'dan
    expect(screen.getByRole("link", { name: /İki Adımlı Doğrulama/ })).toHaveTextContent("Kapalı");
  });

  it("yetkili kullanıcı: firma kartları izinle açılır; doğrulama rozeti duruma göre", () => {
    h.user = { ...h.user, permissions: ["company:manage", "approvals:manage", "users:manage"], twoFactorEnabled: true };
    h.company = { companyVerificationStatus: "VERIFIED" };
    render(<AyarlarPage />);
    // Onay Akışları kartı artık YOK — yetkisi olsa bile çizilmez.
    expect(screen.queryByText("Onay Akışları")).toBeNull();
    expect(screen.getByRole("link", { name: /Doğrulama Belgeleri/ })).toHaveTextContent("Doğrulandı");
    expect(screen.getByRole("link", { name: /İki Adımlı Doğrulama/ })).toHaveTextContent("Açık");
    expect(screen.getByText("Kullanıcı Yönetimi")).toBeInTheDocument();
    expect(screen.getByText("Aktivite Logu")).toBeInTheDocument();
    expect(screen.queryByText("Banka Hesapları")).toBeNull(); // billing:manage yok
  });

  it("yalnız onaylama izni: Firma Profili kartı çizilmez (sayfa kapısıyla aynı izin, O-108)", () => {
    h.user = { ...h.user, permissions: ["approval:act"] };
    render(<AyarlarPage />);
    expect(screen.queryByText("Firma Profili")).toBeNull();
    expect(screen.getByText("Hesap Bilgileri")).toBeInTheDocument();
  });

  // Eski sözleşme (T3: "Silver ile açılır" rozeti) ücretsiz dönemde doğrulama
  // rozetine döndü (2026-10-07): kilit mantığı aynı (efektif kademe), metin
  // paket adı değil doğrulama durumudur.
  it.each([
    ["UNVERIFIED", "Doğrulama gerekir"],
    ["PENDING", "Doğrulama inceleniyor"],
    ["REJECTED", "Yeniden başvurun"],
  ])("Aktivite ve AI kartları erişim yokken doğrulama rozeti taşır: %s → %s", (status, badge) => {
    h.user = { ...h.user, permissions: ["company:manage", "sell:bid:submit"] };
    h.company = { companyVerificationStatus: status, tier: "STANDART" };
    useCompanyAuthStore.setState({ company: h.company as never, user: h.user as never } as never);
    try {
      render(<AyarlarPage />);
      const aktivite = screen.getByRole("link", { name: /Aktivite Logu/ });
      const ai = screen.getByRole("link", { name: /AI Kullanımı/ });
      expect(within(aktivite).getByTestId("verification-badge")).toHaveTextContent(badge);
      expect(within(ai).getByTestId("verification-badge")).toHaveTextContent(badge);
      expect(within(screen.getByRole("link", { name: /Firma Bilgileri/ })).queryByTestId("verification-badge")).toBeNull();
      expect(document.body.textContent).not.toMatch(/silver|gold|paket/i);
    } finally {
      useCompanyAuthStore.setState({ company: null, user: null } as never);
    }
  });

  it("efektif kademe yeterliyse (doğrulanmış firma) rozet yok; doğrulama kartı paket anmaz", () => {
    h.user = { ...h.user, permissions: ["company:manage", "sell:bid:submit"] };
    h.company = { companyVerificationStatus: "VERIFIED", tier: "GOLD" };
    useCompanyAuthStore.setState({ company: h.company as never, user: h.user as never } as never);
    try {
      render(<AyarlarPage />);
      expect(screen.queryByTestId("verification-badge")).toBeNull();
      const card = screen.getByRole("link", { name: /Doğrulama Belgeleri/ });
      expect(card).toHaveTextContent("Doğrulandı");
      expect(card.textContent).not.toMatch(/silver|gold|paket/i);
    } finally {
      useCompanyAuthStore.setState({ company: null, user: null } as never);
    }
  });
});
