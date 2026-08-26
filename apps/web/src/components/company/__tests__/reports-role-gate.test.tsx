// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  hasPerm: false,
  user: { isOwner: false, roles: ["SATIN_ALMACI"] } as {
    isOwner: boolean;
    roles: string[];
  } | null,
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => h.hasPerm,
  useCompanyAuth: () => ({ user: h.user }),
}));

import { ReportsRoleGate } from "../reports-role-gate";

beforeEach(() => {
  h.hasPerm = false;
  h.user = { isOwner: false, roles: ["SATIN_ALMACI"] };
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

  /**
   * Denetim 2026-08-26 Parça 10 B3: backend `assertTypeAllowed` 2026-07-27'den
   * beri Kurucu/Yönetici'ye GÖZETİM MUAFİYETİ tanıyor (raporlar salt-okunur
   * yönetim çıktısı). Bu kapı eski kuralda kalmıştı → işlem-rolsüz Kurucu
   * API'den 200 alırken arayüzde duvara çarpıyordu.
   */
  it("işlem rolü olmayan Kurucu raporları görebilir (gözetim muafiyeti)", () => {
    h.hasPerm = false;
    h.user = { isOwner: true, roles: ["SAHIP"] };
    render(
      <ReportsRoleGate portal="satinalma">
        <div>RAPOR FORMU</div>
      </ReportsRoleGate>,
    );
    expect(screen.getByText("RAPOR FORMU")).toBeInTheDocument();
  });

  it("işlem rolü olmayan Yönetici de görebilir", () => {
    h.hasPerm = false;
    h.user = { isOwner: false, roles: ["YONETICI"] };
    render(
      <ReportsRoleGate portal="satis">
        <div>RAPOR FORMU</div>
      </ReportsRoleGate>,
    );
    expect(screen.getByText("RAPOR FORMU")).toBeInTheDocument();
  });
});
