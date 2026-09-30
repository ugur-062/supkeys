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
  TwoFactorSetupNotice,
} from "../two-factor-setup-notice";

beforeEach(() => {
  h.admin = null;
  h.meCalls = 0;
});

describe("AdminMeRefresher (derin denetim MU-01)", () => {
  it("/me'yi her durumda tazeler (eski snapshot kilidi kaçırmasın)", () => {
    h.admin = { id: "a1", twoFactorSetupRequired: false };
    const { container } = render(<AdminMeRefresher />);
    expect(h.meCalls).toBeGreaterThan(0);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TwoFactorSetupNotice (derin denetim MU-01)", () => {

  it("kurulum zorunlu değilse hiçbir şey çizmez", () => {
    h.admin = { id: "a1", twoFactorSetupRequired: false };
    const { container } = render(<TwoFactorSetupNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("kurulum zorunluysa nedenini anlatan uyarıyı çizer", () => {
    h.admin = { id: "a1", twoFactorSetupRequired: true };
    render(<TwoFactorSetupNotice />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "İki adımlı doğrulama (2FA) zorunlu",
    );
  });

  it("ekrana sabitlenmez — 2FA düğmelerini örtmesin (boşluk taraması GB1)", () => {
    h.admin = { id: "a1", twoFactorSetupRequired: true };
    render(<TwoFactorSetupNotice />);
    expect(screen.getByRole("alert").className).not.toMatch(
      /(^|\s)(fixed|sticky|absolute)(\s|$)/,
    );
  });
});
