// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  pathname: "/company/onaylar",
  auth: {
    user: { roles: [] as string[] } as { roles: string[] } | null,
    company: { tier: "GOLD" } as { tier?: string } | undefined,
  },
  canAct: false,
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => h.auth,
  useHasCompanyPermission: () => h.canAct,
}));
vi.mock("@/hooks/use-company-approvals", () => ({
  usePendingApprovalCount: () => ({ data: 0 }),
}));
vi.mock("@/lib/company/portal-store", () => ({
  usePortalStore: (
    sel: (s: {
      lastPortal: null;
      sidebarPinned: boolean;
      setLastPortal: () => void;
      toggleSidebarPinned: () => void;
    }) => unknown,
  ) =>
    sel({
      lastPortal: null,
      sidebarPinned: true,
      setLastPortal: vi.fn(),
      toggleSidebarPinned: vi.fn(),
    }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => h.pathname,
}));

import { CompanySidebarContent } from "../sidebar";

beforeEach(() => {
  h.pathname = "/company/onaylar";
  vi.clearAllMocks();
  h.canAct = false;
  h.auth.company = { tier: "GOLD" };
});

describe("CompanySidebarContent — minimal kabuk modu", () => {
  it("ONAYLAYICI-only: panel nav'ı YOK; Onaylar + Ayarlar VAR", () => {
    h.auth.user = { roles: ["ONAYLAYICI"] };
    h.canAct = true;
    render(<CompanySidebarContent expanded showPin={false} />);
    expect(screen.queryByText("Satış Tekliflerim")).not.toBeInTheDocument();
    expect(screen.queryByText("Tekliflerim")).not.toBeInTheDocument();
    expect(screen.queryByText("Profilim")).not.toBeInTheDocument();
    expect(screen.getByText("Onaylar")).toBeInTheDocument();
    expect(screen.getByText("Ayarlar")).toBeInTheDocument();
  });

  it("rolsüz üye: yalnız Ayarlar (Onaylar da yok)", () => {
    h.auth.user = { roles: [] };
    h.canAct = false;
    render(<CompanySidebarContent expanded showPin={false} />);
    expect(screen.queryByText("Onaylar")).not.toBeInTheDocument();
    expect(screen.queryByText("Satış Tekliflerim")).not.toBeInTheDocument();
    expect(screen.getByText("Ayarlar")).toBeInTheDocument();
  });

  it("REGRESYON (Faz R): YONETICI etiketi işlem-rolsüz de panelleri görür (salt-okunur gözetim)", () => {
    h.auth.user = { roles: ["YONETICI"] };
    h.canAct = true;
    render(<CompanySidebarContent expanded showPin={false} />);
    // GOLD yönetici → available=[satinalma, satis], aktif=satinalma nav'ı.
    expect(screen.getByText("Taleplerim")).toBeInTheDocument();
    expect(screen.getByText("Ayarlar")).toBeInTheDocument();
  });

  it("ONAYLAYICI+SATISCI: işlem rolü var → satış nav'ı görünür", () => {
    h.auth.user = { roles: ["ONAYLAYICI", "SATISCI"] };
    h.canAct = true;
    render(<CompanySidebarContent expanded showPin={false} />);
    expect(screen.getByText("Satış Tekliflerim")).toBeInTheDocument();
    expect(screen.getByText("Onaylar")).toBeInTheDocument();
  });
});

describe("CompanySidebarContent — sadeleştirilmiş düz menü (2026-08-22)", () => {
  it("satınalma: sıra Anasayfa→Taleplerim→Siparişlerim→Bağlantılar→Onaylar→Ayarlar; Satın Al/Tekliflerim (satış ilanı) YOK; Raporlar/Şablonlar/Profilim menüde YOK", () => {
    h.auth.user = { roles: ["YONETICI"] };
    h.canAct = true;
    render(<CompanySidebarContent expanded showPin={false} />);
    const labels = screen
      .getAllByRole("link")
      .map((a) => a.textContent?.trim())
      .filter((t): t is string => !!t);
    // Portal anahtarı (Satınalma/Satış) ve CTA da link — yalnız nav satırlarını süz.
    const nav = labels.filter((t) =>
      [
        "Anasayfa",
        "Taleplerim",
        "Satın Al",
        "Tekliflerim",
        "Siparişlerim",
        "Bağlantılar",
        "Onaylar",
        "Ayarlar",
      ].includes(t),
    );
    expect(nav).toEqual([
      "Anasayfa",
      "Taleplerim",
      "Siparişlerim",
      "Bağlantılar",
      "Onaylar",
      "Ayarlar",
    ]);
    expect(screen.queryByText("Raporlar")).not.toBeInTheDocument();
    expect(screen.queryByText("Şablonlar")).not.toBeInTheDocument();
    expect(screen.queryByText("Profilim")).not.toBeInTheDocument();
  });

  it("satış: Ürünlerim→Profilim→Satış Tekliflerim→Satışlarım→Bağlantılar; Açık Talepler/Satış İlanlarım/Raporlar/Şablonlar menüde YOK", () => {
    h.auth.user = { roles: ["SATISCI"] };
    h.canAct = false;
    render(<CompanySidebarContent expanded showPin={false} />);
    const labels = screen
      .getAllByRole("link")
      .map((a) => a.textContent?.trim());
    const idx = (t: string) => labels.indexOf(t);
    expect(idx("Satış İlanlarım")).toBe(-1);
    // Açık Talepler anasayfaya katıldı (2026-09-05) — menüde YOK.
    expect(idx("Açık Talepler")).toBe(-1);
    // Profilim ŞİRKETİM alanında (2026-09-05) — satış menüsünde yok.
    expect(idx("Ürünlerim")).toBeGreaterThan(idx("Anasayfa"));
    expect(idx("Profilim")).toBe(-1);
    expect(idx("Satış Tekliflerim")).toBeGreaterThan(idx("Ürünlerim"));
    expect(idx("Satışlarım")).toBeGreaterThan(idx("Satış Tekliflerim"));
    expect(idx("Bağlantılar")).toBeGreaterThan(idx("Satışlarım"));
    expect(screen.queryByText("Raporlar")).not.toBeInTheDocument();
    expect(screen.queryByText("Şablonlar")).not.toBeInTheDocument();
  });

  it("ŞİRKETİM alanı (2026-09-05): sol menü firma menüsüne döner, portal geçişi üstte kalır, CTA yok", () => {
    h.auth.user = { roles: ["SAHIP", "SATIN_ALMACI", "SATISCI"] };
    h.pathname = "/company/sirketim/profil";
    render(<CompanySidebarContent expanded showPin={false} />);
    const labels = Array.from(document.querySelectorAll("nav a")).map((a) => a.textContent?.trim());
    expect(labels).toEqual(["Genel Bakış", "Profil", "Ziyaret Edenler", "Raporlar"]);
    expect(screen.getByText("Şirketim")).toBeInTheDocument();
    expect(screen.queryByText("Ürünlerim")).not.toBeInTheDocument();
    expect(screen.queryByText("Taleplerim")).not.toBeInTheDocument();
    expect(screen.queryByText("Satın Alma Talebi Aç")).not.toBeInTheDocument();
    // Portal geçişi duruyor (panele dönüş).
    expect(screen.getByRole("link", { name: "Satınalma paneline geç" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Satış paneline geç" })).toBeInTheDocument();
    expect(screen.getByText("Ayarlar")).toBeInTheDocument();
  });
});
