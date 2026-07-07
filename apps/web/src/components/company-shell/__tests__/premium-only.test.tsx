// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  auth: { company: undefined as { tier?: string } | undefined },
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => h.auth,
}));
vi.mock("@/components/company-shell/premium-gate", () => ({
  PremiumGate: () => <div data-testid="premium-gate">GATE</div>,
}));

import { PremiumOnly } from "../premium-only";

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.company = undefined;
});

describe("PremiumOnly", () => {
  it("firma yüklenmemişken (undefined) içerik render edilir (yanıp sönme yok)", () => {
    h.auth.company = undefined;
    render(
      <PremiumOnly>
        <div data-testid="child">İÇERİK</div>
      </PremiumOnly>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("premium-gate")).not.toBeInTheDocument();
  });

  it("tier PAKET → içerik render edilir", () => {
    h.auth.company = { tier: "PAKET" };
    render(
      <PremiumOnly>
        <div data-testid="child">İÇERİK</div>
      </PremiumOnly>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("premium-gate")).not.toBeInTheDocument();
  });

  it("tier STANDARD → PremiumGate gösterilir, içerik gizlenir", () => {
    h.auth.company = { tier: "STANDARD" };
    render(
      <PremiumOnly>
        <div data-testid="child">İÇERİK</div>
      </PremiumOnly>,
    );
    expect(screen.getByTestId("premium-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });
});
