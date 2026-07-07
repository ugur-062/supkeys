// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  pathname: "/admin/dashboard",
  state: { admin: null as unknown, isHydrated: true },
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

import AdminLayout from "../layout";

beforeEach(() => {
  vi.clearAllMocks();
  h.pathname = "/admin/dashboard";
  h.state = { admin: null, isHydrated: true };
  Object.defineProperty(window, "location", {
    writable: true,
    configurable: true,
    value: { href: "" },
  });
});

describe("AdminLayout guard", () => {
  it("/admin/login → children RequireAdminAuth OLMADAN render edilir (admin null olsa da)", () => {
    h.pathname = "/admin/login";
    h.state = { admin: null, isHydrated: true };
    render(
      <AdminLayout>
        <div>login-içerik</div>
      </AdminLayout>,
    );
    expect(screen.getByText("login-içerik")).toBeInTheDocument();
    // Guard atlandı → yönlendirme yok.
    expect(window.location.href).toBe("");
  });

  it("korumalı yol + admin null → RequireAdminAuth engeller (children yok, redirect)", () => {
    h.pathname = "/admin/dashboard";
    h.state = { admin: null, isHydrated: true };
    render(
      <AdminLayout>
        <div>korumalı-içerik</div>
      </AdminLayout>,
    );
    expect(screen.queryByText("korumalı-içerik")).not.toBeInTheDocument();
    expect(window.location.href).toBe("/admin/login");
  });

  it("korumalı yol + admin var → children render edilir", () => {
    h.pathname = "/admin/dashboard";
    h.state = { admin: { id: "a1" }, isHydrated: true };
    render(
      <AdminLayout>
        <div>korumalı-içerik</div>
      </AdminLayout>,
    );
    expect(screen.getByText("korumalı-içerik")).toBeInTheDocument();
  });
});
