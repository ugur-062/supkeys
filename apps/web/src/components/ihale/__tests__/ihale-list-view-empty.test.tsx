// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Taleplerim boş durumu: yeni talep neden açılamıyor (kayıt denetimi 2026-10
 * resignup-8). Neden sırası API ile aynıdır — önce firma doğrulaması (efektif
 * kademe), sonra rol. Doğrulanmamış firmanın Kurucusuna (satınalma işlem izni
 * yok) "Satın Almacı rolü gerekir" deniyordu; üstteki bant doğrulama derken.
 */
const h = vi.hoisted(() => ({
  canCreate: false,
  company: { tier: "STANDART" } as { tier: string } | null,
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { id: "u1" }, company: h.company }),
  useHasCompanyPermission: (permission: string) => permission === "buy:listing:manage" && h.canCreate,
}));

import { IhaleListView } from "../IhaleListView";

const VERIFY = "Yeni satın alma talebi açmak firma doğrulaması gerektirir.";
const ROLE = "Satın alma talebi açma işlem rolü (Satın Almacı) gerektirir.";

function renderEmpty() {
  return render(<IhaleListView items={[]} isLoading={false} isError={false} onRetry={() => undefined} />);
}

beforeEach(() => {
  h.canCreate = false;
  h.company = { tier: "STANDART" };
});

describe("IhaleListView — boş liste: yeni talep neden açılamıyor", () => {
  it("doğrulanmamış firma + işlem izni YOK (yeni Kurucu): doğrulama nedeni, rol nedeni değil", () => {
    renderEmpty();
    expect(screen.getByText(VERIFY)).toBeInTheDocument();
    expect(screen.queryByText(ROLE)).toBeNull();
    expect(screen.queryByRole("link", { name: /Satın Alma Talebi Aç/ })).toBeNull();
  });

  it("doğrulanmamış firma + işlem izni var: doğrulama nedeni", () => {
    h.canCreate = true;
    renderEmpty();
    expect(screen.getByText(VERIFY)).toBeInTheDocument();
    expect(screen.queryByText(ROLE)).toBeNull();
  });

  it("yetkili kademe + işlem izni YOK: rol nedeni", () => {
    h.company = { tier: "GOLD" };
    renderEmpty();
    expect(screen.getByText(ROLE)).toBeInTheDocument();
    expect(screen.queryByText(VERIFY)).toBeNull();
  });

  it("yetkili kademe + işlem izni var: oluşturma çağrısı", () => {
    h.company = { tier: "GOLD" };
    h.canCreate = true;
    renderEmpty();
    expect(screen.getByRole("link", { name: /Satın Alma Talebi Aç/ })).toHaveAttribute(
      "href",
      "/company/satinalma/taleplerim/yeni",
    );
    expect(screen.queryByText(VERIFY)).toBeNull();
    expect(screen.queryByText(ROLE)).toBeNull();
  });
});
