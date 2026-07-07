// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  state: { admin: null as unknown, isHydrated: false },
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
