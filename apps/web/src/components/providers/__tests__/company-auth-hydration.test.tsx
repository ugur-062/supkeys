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
}));

vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: StoreState) => unknown) => sel(h.state),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyMe: () => ({ data: h.meData }),
}));

import { RequireCompanyAuth } from "../company-auth-hydration";

const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  h.state = { user: null, isHydrated: false };
  h.meData = undefined;
  // jsdom, gerçek navigasyonu desteklemez — yer değiştirilebilir stub.
  delete (window as { location?: unknown }).location;
  (window as { location: { href: string } }).location = { href: "" };
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
    expect(window.location.href).toBe("/company/login");
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
});
