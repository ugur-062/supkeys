// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ hasPerm: false }));
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => h.hasPerm,
}));

import { ReportsRoleGate } from "../reports-role-gate";

beforeEach(() => {
  h.hasPerm = false;
});

describe("ReportsRoleGate (F7 — backend assertTypeAllowed aynası)", () => {
  it("izinsiz: içerik yerine rol notu", () => {
    render(
      <ReportsRoleGate portal="satinalma">
        <div>RAPOR FORMU</div>
      </ReportsRoleGate>,
    );
    expect(screen.queryByText("RAPOR FORMU")).not.toBeInTheDocument();
    expect(
      screen.getByText("Raporlar işlem rolü gerektirir"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Satın Almacı rolü/)).toBeInTheDocument();
  });

  it("izinli: içerik render edilir", () => {
    h.hasPerm = true;
    render(
      <ReportsRoleGate portal="satis">
        <div>RAPOR FORMU</div>
      </ReportsRoleGate>,
    );
    expect(screen.getByText("RAPOR FORMU")).toBeInTheDocument();
  });
});
