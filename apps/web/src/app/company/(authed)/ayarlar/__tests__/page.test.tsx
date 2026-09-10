// @vitest-environment jsdom
/**
 * AYARLAR HUB — sözleşme: kart kapısı = sayfa kapısı (izin), durum rozetleri
 * store verisinden, Onay Akışları kartı akış görünümüne (?tab=flows) gider,
 * Firma Profili kartı Profilim'e; "galeri" sözcüğü yok (2026-09-10).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1", isOwner: false, roles: [], permissions: ["buy:view"], twoFactorEnabled: false } as Record<string, unknown>,
  company: { companyVerificationStatus: "PENDING" } as Record<string, unknown>,
}));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => ({ user: h.user, company: h.company }) }));

import AyarlarPage from "../page";

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

  it("yetkili kullanıcı: firma kartları izinle açılır; Onay Akışları akış görünümüne, doğrulama rozeti duruma göre", () => {
    h.user = { ...h.user, permissions: ["company:manage", "approvals:manage", "users:manage"], twoFactorEnabled: true };
    h.company = { companyVerificationStatus: "VERIFIED" };
    render(<AyarlarPage />);
    expect(screen.getByRole("link", { name: /Onay Akışları/ })).toHaveAttribute("href", "/company/onaylar?tab=flows");
    expect(screen.getByRole("link", { name: /Doğrulama Belgeleri/ })).toHaveTextContent("Doğrulandı");
    expect(screen.getByRole("link", { name: /İki Adımlı Doğrulama/ })).toHaveTextContent("Açık");
    expect(screen.getByText("Kullanıcı Yönetimi")).toBeInTheDocument();
    expect(screen.getByText("Aktivite Logu")).toBeInTheDocument();
    expect(screen.queryByText("Banka Hesapları")).toBeNull(); // billing:manage yok
  });
});
