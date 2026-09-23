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
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => h.auth,
  useHasCompanyPermission: () => h.canAct,
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
});

describe("/company kök yönlendirme", () => {
  it("ONAYLAYICI-only → Onaylar'a düşer", () => {
    h.auth.user = { roles: ["ONAYLAYICI"] };
    h.canAct = true;
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
});
