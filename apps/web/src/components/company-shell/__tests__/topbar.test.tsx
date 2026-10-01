// @vitest-environment jsdom
/**
 * ÜST ÇUBUK — Şirketim girişi alan kapısıyla AYNI sabitten okunur
 * (`COMPANY_AREA_PERMISSIONS`, arayüz testi O-062): tek "Ziyaret edenler"
 * (`insights:view`) ya da tek "Satınalma raporları" (`buy:reports:view`) tikli
 * kişi portalsız minimal kabukta da Şirketim'e bir bağlantı görür; alanı
 * açamayan (yalnız onaylayıcı) görmez.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  auth: {
    user: null as Record<string, unknown> | null,
    company: { tier: "GOLD", name: "Acme" } as { tier?: string; name?: string },
  },
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => h.auth,
  useCompanyLogout: () => vi.fn(),
}));
vi.mock("@/lib/company/portal-store", () => ({
  usePortalStore: (sel: (s: unknown) => unknown) => sel({ setLastPortal: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/company",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("../messages-popover", () => ({ MessagesPopover: () => null }));
vi.mock("../notification-bell", () => ({ NotificationBell: () => null }));

import { CompanyTopbar } from "../topbar";

const user = (permissions: string[], isOwner = false) => ({
  id: "u1",
  firstName: "Ada",
  lastName: "Yılmaz",
  email: "ada@example.com",
  isOwner,
  roles: [],
  permissions,
});

const sirketimLink = () =>
  screen.queryByRole("link", { name: "Şirketim" });

beforeEach(() => {
  h.auth.company = { tier: "GOLD", name: "Acme" };
});

describe("CompanyTopbar — Şirketim girişi", () => {
  it.each([["insights:view"], ["buy:reports:view"], ["company:manage"], ["buy:view"]])(
    "yalnız %s tikli kişi Şirketim girişini görür",
    (perm) => {
      h.auth.user = user([perm]);
      render(<CompanyTopbar activePortal="satinalma" onOpenMobileNav={() => {}} />);
      expect(sirketimLink()).toHaveAttribute("href", "/company/sirketim");
    },
  );

  it("kurucu her zaman görür", () => {
    h.auth.user = user([], true);
    render(<CompanyTopbar activePortal="satinalma" onOpenMobileNav={() => {}} />);
    expect(sirketimLink()).toBeInTheDocument();
  });

  it("yalnız onaylayıcı (alanı açamayan) GÖRMEZ", () => {
    h.auth.user = user(["approval:act"]);
    render(<CompanyTopbar activePortal="satinalma" onOpenMobileNav={() => {}} />);
    expect(sirketimLink()).toBeNull();
  });
});
