// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  hasPerm: false,
  user: { isOwner: false, roles: [], permissions: [] as string[] } as {
    isOwner: boolean;
    roles: string[];
    permissions?: string[];
  } | null,
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => h.hasPerm,
  useCompanyAuth: () => ({ user: h.user }),
}));

import { ReportsRoleGate } from "../reports-role-gate";

beforeEach(() => {
  h.hasPerm = false;
  // Yetki tablosu: kapı `/me` izin listesini okur (rol yalnız geçiş yedeği).
  h.user = { isOwner: false, roles: [], permissions: [] };
});

describe("ReportsRoleGate (F7 — backend assertTypeAllowed aynası)", () => {
  it("izinsiz: içerik yerine rol notu", () => {
    render(
      <ReportsRoleGate portal="satinalma">
        <div>RAPOR FORMU</div>
      </ReportsRoleGate>,
    );
    expect(screen.queryByText("RAPOR FORMU")).not.toBeInTheDocument();
    expect(screen.getByText("Raporlar yetki gerektirir")).toBeInTheDocument();
    expect(screen.getByText(/Satınalma raporları/)).toBeInTheDocument();
  });

  it("izinli: içerik render edilir (buy:reports:view tiki)", () => {
    h.user = { isOwner: false, roles: [], permissions: ["buy:reports:view"] };
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
  it("işlem rolü olmayan Kurucu raporları görebilir (örtük yönetim seti)", () => {
    h.user = { isOwner: true, roles: ["SAHIP"], permissions: [] };
    render(
      <ReportsRoleGate portal="satinalma">
        <div>RAPOR FORMU</div>
      </ReportsRoleGate>,
    );
    expect(screen.getByText("RAPOR FORMU")).toBeInTheDocument();
  });

  it("işlem rolü olmayan Yönetici de görebilir (hazır set raporları içerir)", () => {
    h.user = { isOwner: false, roles: ["YONETICI"] };
    render(
      <ReportsRoleGate portal="satis">
        <div>RAPOR FORMU</div>
      </ReportsRoleGate>,
    );
    expect(screen.getByText("RAPOR FORMU")).toBeInTheDocument();
  });
});
