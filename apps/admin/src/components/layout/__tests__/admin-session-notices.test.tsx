// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  admin: null as unknown,
  meCalls: 0,
}));

vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminMe: () => {
    h.meCalls += 1;
    return { data: undefined };
  },
  useAdminAuth: () => ({ admin: h.admin }),
}));

import {
  AdminMeRefresher,
  PasswordChangeRequiredNotice,
} from "../admin-session-notices";

beforeEach(() => {
  h.admin = null;
  h.meCalls = 0;
});

describe("AdminMeRefresher", () => {
  it("/me'yi her durumda tazeler (eski snapshot kilidi kaçırmasın)", () => {
    h.admin = { id: "a1" };
    const { container } = render(<AdminMeRefresher />);
    expect(h.meCalls).toBeGreaterThan(0);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PasswordChangeRequiredNotice (arayüz testi D-025)", () => {
  it("geçici parola yoksa hiçbir şey çizmez", () => {
    h.admin = { id: "a1", mustChangePassword: false };
    const { container } = render(<PasswordChangeRequiredNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("geçici parolayla girildiyse kilidi anlatır; akış içi (sabit değil)", () => {
    h.admin = { id: "a1", mustChangePassword: true };
    render(<PasswordChangeRequiredNotice />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Kendi şifrenizi belirleyin");
    expect(alert.className).not.toMatch(/(^|\s)(fixed|sticky|absolute)(\s|$)/);
  });

  it("eski API'den kalan 2FA bayrağı metni değiştirmez (2FA kaldırıldı)", () => {
    h.admin = { id: "a1", mustChangePassword: true, twoFactorSetupRequired: true };
    render(<PasswordChangeRequiredNotice />);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/2FA|iki adımlı/i);
  });
});
