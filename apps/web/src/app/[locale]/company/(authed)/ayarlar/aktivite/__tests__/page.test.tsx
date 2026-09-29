// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const h = vi.hoisted(() => ({ items: [] as unknown[] }));

vi.mock("@/hooks/use-activity-log", () => ({
  useActivityLog: () => ({
    data: {
      items: h.items,
      pagination: { page: 1, pageSize: 25, total: h.items.length, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/components/company-shell/premium-only", () => ({
  PremiumOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../../_components/settings-shell", () => ({
  SettingsShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import AktivitePage from "../page";

function row(action: string, metadata: Record<string, unknown>) {
  return {
    id: `${action}-${JSON.stringify(metadata)}`,
    action,
    actorEmail: "ada@example.com",
    entityType: null,
    entityId: null,
    metadata,
    createdAt: "2026-09-29T10:00:00.000Z",
  };
}

beforeEach(() => {
  useCompanyAuthStore.setState({ company: { country: "TR" } } as never);
});

describe("AktivitePage — Detay sütunu (derin denetim LU-20)", () => {
  it("belge türü iç anahtarı yerine katalog etiketi basılır", () => {
    h.items = [row("company.docs.uploaded", { kind: "taxPlate" })];
    render(<AktivitePage />);
    expect(screen.getByText("Vergi Levhası")).toBeInTheDocument();
    expect(screen.queryByText("taxPlate")).not.toBeInTheDocument();
  });

  it("kodlu red nedeni çevrilir, serbest metin gerekçe aynen kalır", () => {
    h.items = [
      row("company.user.role_change_denied", { reason: "not_admin_grant" }),
      row("company.order.cancelled", { orderNumber: "SIP-1", reason: "Stok bitti" }),
    ];
    render(<AktivitePage />);
    expect(screen.getByText("Yönetici yetkisi olmadan rol atama denemesi")).toBeInTheDocument();
    expect(screen.queryByText("not_admin_grant")).not.toBeInTheDocument();
    expect(screen.getByText(/Stok bitti/)).toBeInTheDocument();
  });
});
