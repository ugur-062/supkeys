// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  admin: { role: "SUPER_ADMIN", firstName: "A", lastName: "B", email: "a@b.c" } as {
    role: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: h.admin }),
  useAdminLogout: () => vi.fn(),
}));
vi.mock("@/components/layout/global-search", () => ({
  GlobalSearch: () => <div data-testid="global-search" />,
}));

import { AdminShell } from "../admin-shell";

const navLabels = () => {
  // Masaüstü rayı (mobil çekmece kapalıyken DOM'da yalnız ray var).
  const nav = screen.getAllByRole("navigation")[0];
  return within(nav)
    .getAllByRole("link")
    .map((a) => a.textContent?.trim());
};

beforeEach(() => {
  h.admin = { role: "SUPER_ADMIN", firstName: "A", lastName: "B", email: "a@b.c" };
});

describe("AdminShell menü görünürlüğü (arayüz testi T-09 — matristen beslenir)", () => {
  it("SUPPORT: Firmalar ve 403 veren sayfalar menüde yok; erişebildikleri var", () => {
    h.admin = { ...h.admin!, role: "SUPPORT" };
    render(<AdminShell>içerik</AdminShell>);
    const labels = navLabels();
    for (const hidden of [
      "Firmalar",
      "Başvurular",
      "Üyelik Raporu",
      "Büyüme",
      "Duyuru",
      "E-posta Kayıtları",
      "Denetim Kaydı",
      "Güvenlik",
      "Personel",
    ]) {
      expect(labels).not.toContain(hidden);
    }
    for (const visible of ["Genel Bakış", "Ürünler", "Şikayetler", "Sistem Sağlığı", "Kategoriler"]) {
      expect(labels).toContain(visible);
    }
    expect(screen.queryByTestId("global-search")).not.toBeInTheDocument();
  });

  it("SALES: Firmalar/Başvurular görünür; Duyuru ve Personel (yalnız Süper Admin) yok", () => {
    h.admin = { ...h.admin!, role: "SALES" };
    render(<AdminShell>içerik</AdminShell>);
    const labels = navLabels();
    expect(labels).toContain("Firmalar");
    expect(labels).toContain("Başvurular");
    expect(labels).toContain("Denetim Kaydı");
    expect(labels).not.toContain("Duyuru");
    expect(labels).not.toContain("Personel");
  });

  it("SUPER_ADMIN: tüm menü öğeleri", () => {
    render(<AdminShell>içerik</AdminShell>);
    const labels = navLabels();
    for (const l of ["Firmalar", "Duyuru", "Personel", "Büyüme"]) {
      expect(labels).toContain(l);
    }
  });
});
