// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface StoreState {
  user: { id: string } | null;
  isHydrated: boolean;
}

const h = vi.hoisted(() => ({
  state: { user: null, isHydrated: false } as StoreState,
  meData: undefined as { company: { onboardingCompletedAt: string | null } } | undefined,
  // `useCompanySessionProbe` sonucu: anlık görüntü yokken `/me` yoklaması.
  probe: "none" as "pending" | "found" | "none",
}));

vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: StoreState) => unknown) => sel(h.state),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyMe: () => ({ data: h.meData }),
  useCompanySessionProbe: () => h.probe,
}));

import { markCompanyLoggingOut, resetCompanyLoggingOut } from "@/lib/company-auth/logout-flag";
import { RequireCompanyAuth } from "../company-auth-hydration";

const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  h.state = { user: null, isHydrated: false };
  h.meData = undefined;
  h.probe = "none";
  resetCompanyLoggingOut();
  // jsdom, gerçek navigasyonu desteklemez — yer değiştirilebilir stub.
  delete (window as { location?: unknown }).location;
  (window as { location: { href: string; pathname: string; search: string } }).location = {
    href: "",
    pathname: "/company",
    search: "",
  };
});

afterEach(() => {
  (window as { location: Location }).location = originalLocation;
});

function Child() {
  return <div data-testid="child">PANEL</div>;
}

describe("RequireCompanyAuth", () => {
  it("hydrate olmadan null render eder (yönlendirme yok)", () => {
    h.state = { user: { id: "u1" }, isHydrated: false };
    const { container } = render(
      <RequireCompanyAuth>
        <Child />
      </RequireCompanyAuth>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(window.location.href).toBe("");
  });

  it("hydrate + kullanıcı yok → /company/login'e yönlendirir, null render", () => {
    h.state = { user: null, isHydrated: true };
    const { container } = render(
      <RequireCompanyAuth>
        <Child />
      </RequireCompanyAuth>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(window.location.href).toBe("/company/login?next=%2Fcompany");
  });

  it("e-posta CTA'sıyla gelen oturumsuz kullanıcı: bulunulan yol + sorgu `next` olarak taşınır", () => {
    h.state = { user: null, isHydrated: true };
    (window.location as { pathname: string; search: string }).pathname = "/company/ilan/abc123";
    (window.location as { pathname: string; search: string }).search = "?tab=1";
    render(
      <RequireCompanyAuth>
        <Child />
      </RequireCompanyAuth>,
    );
    expect(window.location.href).toBe(
      `/company/login?next=${encodeURIComponent("/company/ilan/abc123?tab=1")}`,
    );
  });

  it("hydrate + kullanıcı + onboarding tamam → içerik render, yönlendirme yok", () => {
    h.state = { user: { id: "u1" }, isHydrated: true };
    h.meData = { company: { onboardingCompletedAt: "2026-01-01" } };
    render(
      <RequireCompanyAuth>
        <Child />
      </RequireCompanyAuth>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(window.location.href).toBe("");
  });

  it("hydrate + kullanıcı + onboarding eksik → /company/onboarding'e yönlendirir, null render", () => {
    h.state = { user: { id: "u1" }, isHydrated: true };
    h.meData = { company: { onboardingCompletedAt: null } };
    const { container } = render(
      <RequireCompanyAuth>
        <Child />
      </RequireCompanyAuth>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(window.location.href).toBe("/company/onboarding");
  });

  // Arayüz testi 2026-10 login-1: "Oturumumu açık bırak" kapalıyken yeni
  // sekmede anlık görüntü yoktur ama çerez geçerlidir — `/me` yoklanırken
  // girişe ATILMAZ; oturum bulunursa panel çizilir.
  it("anlık görüntü yok + `/me` yoklanıyor → yönlendirme YOK, içerik de yok", () => {
    h.state = { user: null, isHydrated: true };
    h.probe = "pending";
    const { container } = render(
      <RequireCompanyAuth>
        <Child />
      </RequireCompanyAuth>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(window.location.href).toBe("");
  });

  it("yoklama oturumu buldu (depo doldu) → panel çizilir, girişe gidilmez", () => {
    h.state = { user: null, isHydrated: true };
    h.probe = "pending";
    const { rerender } = render(
      <RequireCompanyAuth>
        <Child />
      </RequireCompanyAuth>,
    );
    h.state = { user: { id: "u1" }, isHydrated: true };
    h.probe = "found";
    h.meData = { company: { onboardingCompletedAt: "2026-01-01" } };
    rerender(
      <RequireCompanyAuth>
        <Child />
      </RequireCompanyAuth>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(window.location.href).toBe("");
  });

  it("yoklama 'oturum yok' dedi → bulunulan yol `next` ile girişe", () => {
    h.state = { user: null, isHydrated: true };
    h.probe = "pending";
    (window.location as { pathname: string }).pathname = "/company/satinalma/taleplerim";
    const { rerender } = render(
      <RequireCompanyAuth>
        <Child />
      </RequireCompanyAuth>,
    );
    expect(window.location.href).toBe("");
    h.probe = "none";
    rerender(
      <RequireCompanyAuth>
        <Child />
      </RequireCompanyAuth>,
    );
    expect(window.location.href).toBe(
      `/company/login?next=${encodeURIComponent("/company/satinalma/taleplerim")}`,
    );
  });

  // Arayüz testi 2026-10 login-2: açık çıkışta nöbetçi `?next=<son sayfa>`
  // EKLEMEZ — düz giriş sayfasına çıkış kancası götürür; yoksa sonraki giriş
  // yapan kişi önceki kullanıcının son sayfasına düşerdi.
  it("açık çıkış sürerken kullanıcı silinince nöbetçi yönlendirmez (next eklenmez)", () => {
    h.state = { user: { id: "u1" }, isHydrated: true };
    h.meData = { company: { onboardingCompletedAt: "2026-01-01" } };
    (window.location as { pathname: string; search: string }).pathname = "/company/ayarlar/bildirimler";
    (window.location as { pathname: string; search: string }).search = "?x=1";
    const { rerender } = render(
      <RequireCompanyAuth>
        <Child />
      </RequireCompanyAuth>,
    );
    markCompanyLoggingOut();
    h.state = { user: null, isHydrated: true };
    rerender(
      <RequireCompanyAuth>
        <Child />
      </RequireCompanyAuth>,
    );
    expect(window.location.href).toBe("");
  });

  it("oturum düştü (401, çıkış DEĞİL) → `next` taşınır (kullanıcı kaldığı sayfaya döner)", () => {
    h.state = { user: { id: "u1" }, isHydrated: true };
    h.meData = { company: { onboardingCompletedAt: "2026-01-01" } };
    (window.location as { pathname: string }).pathname = "/company/ayarlar";
    const { rerender } = render(
      <RequireCompanyAuth>
        <Child />
      </RequireCompanyAuth>,
    );
    h.state = { user: null, isHydrated: true };
    rerender(
      <RequireCompanyAuth>
        <Child />
      </RequireCompanyAuth>,
    );
    expect(window.location.href).toBe(`/company/login?next=${encodeURIComponent("/company/ayarlar")}`);
  });
});
