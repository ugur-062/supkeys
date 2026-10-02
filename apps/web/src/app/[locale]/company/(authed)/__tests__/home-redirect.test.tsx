// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  auth: {
    user: { roles: [] as string[] } as { roles: string[] } | null,
    company: { tier: "GOLD" } as { tier?: string } | undefined,
  },
  canAct: false,
  replace: vi.fn(),
  me: {
    data: { company: { onboardingCompletedAt: "2026-09-01T00:00:00Z" as string | null } } as
      | { company: { onboardingCompletedAt: string | null } }
      | undefined,
    isError: false,
  },
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => h.auth,
  useHasCompanyPermission: () => h.canAct,
  useCompanyMe: () => h.me,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace }),
}));
vi.mock("@/lib/company/portal-store", () => ({
  usePortalStore: (sel: (s: { lastPortal: null }) => unknown) =>
    sel({ lastPortal: null }),
}));

import CompanyHome from "../page";

beforeEach(() => {
  vi.clearAllMocks();
  h.canAct = false;
  h.auth = { user: { roles: [] }, company: { tier: "GOLD" } };
  h.me = { data: { company: { onboardingCompletedAt: "2026-09-01T00:00:00Z" } }, isError: false };
  sessionStorage.clear();
});

describe("/company kök yönlendirme", () => {
  it("ONAYLAYICI-only → Onaylar'a düşer", () => {
    h.auth.user = { roles: ["ONAYLAYICI"] };
    h.canAct = true;
    render(<CompanyHome />);
    expect(h.replace).toHaveBeenCalledWith("/company/onaylar");
  });

  it("yalnız approvals:manage → Onaylar'a düşer (kapıyla aynı kural, arayüz testi T3)", () => {
    h.auth.user = { roles: [], permissions: ["approvals:manage"] } as never;
    h.canAct = false;
    render(<CompanyHome />);
    expect(h.replace).toHaveBeenCalledWith("/company/onaylar");
  });

  it("rolsüz üye → Ayarlar'a düşer", () => {
    h.auth.user = { roles: [] };
    render(<CompanyHome />);
    expect(h.replace).toHaveBeenCalledWith("/company/ayarlar");
  });

  it("işlem rollü kullanıcı → ilk erişilebilir portala düşer", () => {
    h.auth.user = { roles: ["SATISCI"] };
    render(<CompanyHome />);
    expect(h.replace).toHaveBeenCalledWith("/company/satis");
  });

  it("kayıt niyeti (redirect) onboarding BİLİNMEDEN tüketilmez; bitince talebe döner", () => {
    // Dış talep davetinden kayıt: `?redirect=/company/ilan/<id>` sessionStorage'da.
    sessionStorage.setItem("rothern.signup-redirect", "/company/ilan/l1");
    h.auth.user = { roles: ["SATISCI"] };
    // `/me` henüz yüklenmedi → hiçbir yere gidilmez, niyet durur.
    h.me = { data: undefined, isError: false };
    const view = render(<CompanyHome />);
    expect(h.replace).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("rothern.signup-redirect")).toBe("/company/ilan/l1");
    // Onboarding gerekli → kabuk yönlendirir; niyet yine durur.
    h.me = { data: { company: { onboardingCompletedAt: null } }, isError: false };
    view.rerender(<CompanyHome />);
    expect(h.replace).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("rothern.signup-redirect")).toBe("/company/ilan/l1");
    // Onboarding bitti → talebe.
    h.me = { data: { company: { onboardingCompletedAt: "2026-09-27T10:00:00Z" } }, isError: false };
    view.rerender(<CompanyHome />);
    expect(h.replace).toHaveBeenCalledWith("/company/ilan/l1");
    expect(sessionStorage.getItem("rothern.signup-redirect")).toBeNull();
  });

  it("niyet varken `/me` ikinci kez yazılsa da TEK yönlendirme, niyetin adresine (Y-08)", () => {
    sessionStorage.setItem("rothern.signup-redirect", "/company/ilan/l9");
    h.auth.user = { roles: ["SATISCI"] };
    const view = render(<CompanyHome />);
    // Aynı turda kullanıcı ve `/me` YENİ nesnelerle yeniden yazılır → efekt
    // yeniden çalışır; ikinci çalışma boş niyetle `/company/satis`e gitmemeli.
    h.auth = { ...h.auth, user: { roles: ["SATISCI"] } };
    h.me = { data: { company: { onboardingCompletedAt: "2026-09-02T00:00:00Z" } }, isError: false };
    view.rerender(<CompanyHome />);
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith("/company/ilan/l9");
  });

  it("Silver firmada yalnız Satın Almacı → satınalma paneline (paket kapısı), Ayarlar'a değil (D-179)", () => {
    h.auth = { user: { roles: ["SATIN_ALMACI"] }, company: { tier: "SILVER" } };
    render(<CompanyHome />);
    expect(h.replace).toHaveBeenCalledWith("/company/satinalma");
  });
});
