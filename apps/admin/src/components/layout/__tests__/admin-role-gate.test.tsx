// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  admin: { role: "SUPER_ADMIN" } as { role: string } | null,
  mounted: 0,
}));

vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: h.admin }),
}));

import { AdminRoleGate } from "../admin-role-gate";

function Probe() {
  h.mounted += 1;
  return <p>korunan içerik</p>;
}

beforeEach(() => {
  h.admin = { role: "SUPER_ADMIN" };
  h.mounted = 0;
});

describe("AdminRoleGate (arayüz testi T-09 — D-017, D-033, D-224)", () => {
  it("izinsiz rolde içerik HİÇ mount edilmez (sorgu yok), yetki kartı çizilir", () => {
    h.admin = { role: "SALES" };
    render(
      <AdminRoleGate action="announce">
        <Probe />
      </AdminRoleGate>,
    );
    expect(h.mounted).toBe(0);
    expect(screen.getByText("Bu sayfaya erişim yetkiniz yok.")).toBeInTheDocument();
    expect(screen.getByText("Bu sayfa yalnızca Süper Admin rolüne açık.")).toBeInTheDocument();
  });

  it("çok rollü aksiyonda izinli roller listelenir", () => {
    h.admin = { role: "SUPPORT" };
    render(
      <AdminRoleGate action="listCompanies">
        <Probe />
      </AdminRoleGate>,
    );
    expect(screen.getByText("Bu sayfa Süper Admin ve Satış rollerine açık.")).toBeInTheDocument();
  });

  it("izinli rolde içerik çizilir", () => {
    h.admin = { role: "SUPER_ADMIN" };
    render(
      <AdminRoleGate action="announce">
        <Probe />
      </AdminRoleGate>,
    );
    expect(screen.getByText("korunan içerik")).toBeInTheDocument();
  });

  it("rol düşünce (store güncellendi) aynı sayfa kapanır", () => {
    h.admin = { role: "SALES" };
    const { rerender } = render(
      <AdminRoleGate action="viewGrowth">
        <Probe />
      </AdminRoleGate>,
    );
    expect(screen.getByText("korunan içerik")).toBeInTheDocument();
    h.admin = { role: "SUPPORT" };
    rerender(
      <AdminRoleGate action="viewGrowth">
        <Probe />
      </AdminRoleGate>,
    );
    expect(screen.queryByText("korunan içerik")).not.toBeInTheDocument();
    expect(screen.getByText("Bu sayfaya erişim yetkiniz yok.")).toBeInTheDocument();
  });
});
