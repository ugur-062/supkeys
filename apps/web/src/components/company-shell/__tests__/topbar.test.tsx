// @vitest-environment jsdom
/**
 * ÜST ÇUBUK — Şirketim girişi alan kapısıyla AYNI sabitten okunur
 * (`COMPANY_AREA_PERMISSIONS`, arayüz testi O-062): tek "Ziyaret edenler"
 * (`insights:view`) ya da tek "Satınalma raporları" (`buy:reports:view`) tikli
 * kişi portalsız minimal kabukta da Şirketim'e bir bağlantı görür; alanı
 * açamayan (yalnız onaylayıcı) görmez.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  replace: vi.fn(),
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
vi.mock("@/hooks/use-company-account", () => ({
  useUpdateMe: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/company",
  useRouter: () => ({ push: vi.fn(), replace: h.replace, prefetch: vi.fn() }),
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

describe("CompanyTopbar — dar ekran çakışması (arayüz testi O-049)", () => {
  it("portal tuşu sarmalayıcısı daralmaz; dar ekranda yalnız logo işareti", () => {
    h.auth.user = user(["buy:view", "sell:view"]);
    const { container } = render(
      <CompanyTopbar activePortal="satinalma" onOpenMobileNav={() => {}} />,
    );
    const btn = screen.getByRole("button", { name: /Panel değiştir/ });
    // PortalSwitch kökü → üst çubuktaki orta sarmalayıcı.
    const wrapper = btn.parentElement!.parentElement!;
    expect(wrapper.className).toMatch(/(^|\s)shrink-0(\s|$)/);
    expect(wrapper.className).not.toMatch(/min-w-0/);
    const logos = container.querySelectorAll('header a[href="/company"] img');
    expect(logos).toHaveLength(2);
    expect(logos[0]!.getAttribute("class")).toMatch(/sm:hidden/);
    expect(logos[1]!.getAttribute("class")).toMatch(/(^|\s)hidden(\s|$)/);
    expect(logos[1]!.getAttribute("class")).toMatch(/sm:block/);
  });
});

/**
 * Kayıt denetimi 2026-10 signup-enru-7: ad her genişlikte 160 px'te
 * kesiliyordu ("Анастасия Воскре…", metin 200 px) — 1024 px ve üstünde üst
 * çubukta yüzlerce piksel boş yer varken. Tavan genişliğe göre büyür.
 */
describe("CompanyTopbar — kullanıcı adı", () => {
  it("ad 768-1023 px'te 160 px, 1024 px ve üstünde 256 px'e kadar kesilmeden yazılır", () => {
    h.auth.user = { ...user(["buy:view"]), firstName: "Анастасия", lastName: "Воскресенская" };
    render(<CompanyTopbar activePortal="satinalma" onOpenMobileNav={() => {}} />);
    const name = screen.getByText("Анастасия Воскресенская");
    expect(name).toHaveClass("max-w-40", "lg:max-w-64", "truncate");
  });
});

/**
 * Panel içi dil seçici (arayüz testi son tur S-BUY): üst çubukta dil yoktu;
 * `/en/...` adresi kayıtlı dile geri sekiyordu. Hesap menüsündeki seçim
 * Ayarlar › Dil ile AYNI kaydı yapar (`PATCH me { locale }`) ve sayfayı yeni
 * dilin ön ekiyle açar — LocaleUrlSync geri sekmez.
 */
describe("CompanyTopbar — dil seçici", () => {
  beforeEach(() => {
    h.mutateAsync.mockReset().mockResolvedValue({});
    h.replace.mockReset();
    sessionStorage.clear();
  });

  it("hesap menüsünde üç dil; seçilen dil hesaba kaydedilir ve sayfa o dille açılır", async () => {
    const ue = userEvent.setup();
    h.auth.user = { ...user(["buy:view"]), locale: "tr" };
    render(<CompanyTopbar activePortal="satinalma" onOpenMobileNav={() => {}} />);
    await ue.click(screen.getByRole("button", { name: "Hesap menüsü" }));
    const tr = screen.getByRole("menuitem", { name: "Türkçe" });
    expect(tr).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("menuitem", { name: "Русский" })).toBeInTheDocument();
    await ue.click(screen.getByRole("menuitem", { name: "English" }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledWith({ locale: "en" }));
    await waitFor(() =>
      expect(h.replace).toHaveBeenCalledWith("/company", { locale: "en" }),
    );
    expect(sessionStorage.getItem("rothern:locale-saved")).toBe("en");
  });

  it("kayıtlı dil yeniden seçilirse istek atmaz", async () => {
    const ue = userEvent.setup();
    h.auth.user = { ...user(["buy:view"]), locale: "tr" };
    render(<CompanyTopbar activePortal="satinalma" onOpenMobileNav={() => {}} />);
    await ue.click(screen.getByRole("button", { name: "Hesap menüsü" }));
    await ue.click(screen.getByRole("menuitem", { name: "Türkçe" }));
    expect(h.mutateAsync).not.toHaveBeenCalled();
  });
});
