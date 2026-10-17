// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as null | { id: string; permissions: string[]; roles: string[] },
  company: null as null | { tier: string },
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  usePathname: () => "/company/firma-dizini",
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: h.user, company: h.company }),
}));

import MemberDirectoryRedirect from "../page";

beforeEach(() => h.replace.mockClear());

/** Arayüz testi Y-03: `/firmalar` üyelik dönüşü pakete göre doğru dizine. */
describe("Üyenin firma dizini yönlendirmesi", () => {
  it("Gold ∧ buy:view → satınalma dizini", () => {
    h.user = { id: "u", permissions: ["buy:view"], roles: [] };
    h.company = { tier: "GOLD" };
    render(<MemberDirectoryRedirect />);
    expect(h.replace).toHaveBeenCalledWith("/company/satinalma/firmalar");
  });

  it("ücretsiz/Silver → satış dizini (Gold duvarı yok)", () => {
    h.user = { id: "u", permissions: ["buy:view", "sell:view"], roles: [] };
    h.company = { tier: "STANDART" };
    render(<MemberDirectoryRedirect />);
    expect(h.replace).toHaveBeenCalledWith("/company/satis/firmalar");
  });
});
