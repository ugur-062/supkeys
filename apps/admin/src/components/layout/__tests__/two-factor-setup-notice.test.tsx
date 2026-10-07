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
    expect(alert).not.toHaveTextContent("Önce iki adımlı doğrulamayı");
    expect(alert.className).not.toMatch(/(^|\s)(fixed|sticky|absolute)(\s|$)/);
  });

  it("2FA da zorunluysa sırayı söyler (önce 2FA)", () => {
    h.admin = { id: "a1", mustChangePassword: true, twoFactorSetupRequired: true };
    render(<PasswordChangeRequiredNotice />);
    expect(screen.getByRole("alert")).toHaveTextContent("Önce iki adımlı doğrulamayı");
  });
});
