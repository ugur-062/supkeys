// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  pathname: "/admin/dashboard",
  state: { admin: null as unknown, isHydrated: false },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => h.pathname,
}));

vi.mock("@/lib/auth/store", () => ({
  useAdminAuthStore: Object.assign(
    (sel?: (s: typeof h.state) => unknown) => (sel ? sel(h.state) : h.state),
    { getState: () => h.state },
  ),
}));

import { AuthHydrationBoundary, RequireAdminAuth } from "../auth-hydration";

beforeEach(() => {
  vi.clearAllMocks();
  h.pathname = "/admin/dashboard";
  h.state = { admin: null, isHydrated: false };
  Object.defineProperty(window, "location", {
    writable: true,
    configurable: true,
    value: { href: "" },
  });
});

describe("RequireAdminAuth", () => {
  it("admin null + hydrated → içerik yok, /admin/login'e yönlendirir", () => {
    h.state = { admin: null, isHydrated: true };
    render(
      <RequireAdminAuth>
        <div>gizli</div>
      </RequireAdminAuth>,
    );
    expect(screen.queryByText("gizli")).not.toBeInTheDocument();
    expect(window.location.href).toBe("/admin/login");
  });

  it("admin var + hydrated → children render eder, yönlendirme yok", () => {
    h.state = { admin: { id: "a1" }, isHydrated: true };
    render(
      <RequireAdminAuth>
        <div>gizli</div>
      </RequireAdminAuth>,
    );
    expect(screen.getByText("gizli")).toBeInTheDocument();
    expect(window.location.href).toBe("");
  });

  it("2FA kurulumu zorunlu (MU-01) + başka sayfa → içerik yok, Ayarlar'a yönlendirir", () => {
    h.state = {
      admin: { id: "a1", twoFactorSetupRequired: true },
      isHydrated: true,
    };
    render(
      <RequireAdminAuth>
        <div>gizli</div>
      </RequireAdminAuth>,
    );
    expect(screen.queryByText("gizli")).not.toBeInTheDocument();
    expect(window.location.href).toBe("/admin/settings");
  });

  it("2FA kurulumu zorunlu + Ayarlar sayfası → kurulum ekranı açılır, yönlendirme yok", () => {
    h.pathname = "/admin/settings";
    h.state = {
      admin: { id: "a1", twoFactorSetupRequired: true },
      isHydrated: true,
    };
    render(
      <RequireAdminAuth>
        <div>ayarlar</div>
      </RequireAdminAuth>,
    );
    expect(screen.getByText("ayarlar")).toBeInTheDocument();
    expect(window.location.href).toBe("");
  });

  it("hydrate olmamış → null, yönlendirme yok", () => {
    h.state = { admin: null, isHydrated: false };
    render(
      <RequireAdminAuth>
        <div>gizli</div>
      </RequireAdminAuth>,
    );
    expect(screen.queryByText("gizli")).not.toBeInTheDocument();
    expect(window.location.href).toBe("");
  });
});

describe("AuthHydrationBoundary", () => {
  it("mount sonrası children render eder", () => {
    render(
      <AuthHydrationBoundary>
        <div>içerik</div>
      </AuthHydrationBoundary>,
    );
    expect(screen.getByText("içerik")).toBeInTheDocument();
  });
});
