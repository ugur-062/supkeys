// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const h = vi.hoisted(() => ({ items: [] as unknown[], enabled: undefined as boolean | undefined }));

vi.mock("@/hooks/use-activity-log", () => ({
  useActivityLog: (_page: number, _module?: string, enabled?: boolean) => (h.enabled = enabled, {
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
  useCompanyAuthStore.setState({ company: { country: "TR", tier: "SILVER" } } as never);
});

describe("AktivitePage — paket kilidi (arayüz testi O-044)", () => {
  it("STANDART firmada log isteği atılmaz (kilit kartı yeter, 403/toast yok); Silver'da atılır", () => {
    useCompanyAuthStore.setState({ company: { country: "TR", tier: "STANDART" } } as never);
    const { unmount } = render(<AktivitePage />);
    expect(h.enabled).toBe(false);
    unmount();
    useCompanyAuthStore.setState({ company: { country: "TR", tier: "SILVER" } } as never);
    render(<AktivitePage />);
    expect(h.enabled).toBe(true);
  });
});

describe("AktivitePage — Detay sütunu (derin denetim LU-20)", () => {
  it("belge türü iç anahtarı yerine katalog etiketi basılır", () => {
    h.items = [row("company.docs.uploaded", { kind: "taxPlate" })];
    render(<AktivitePage />);
    // Dar ekran kopyası (sm:hidden) da DOM'da — en az bir eşleşme yeter.
    expect(screen.getAllByText("Vergi Levhası").length).toBeGreaterThan(0);
    expect(screen.queryByText("taxPlate")).not.toBeInTheDocument();
  });

  it("kodlu red nedeni çevrilir, serbest metin gerekçe aynen kalır", () => {
    h.items = [
      row("company.user.role_change_denied", { reason: "not_admin_grant" }),
      row("company.order.cancelled", { orderNumber: "SIP-1", reason: "Stok bitti" }),
    ];
    render(<AktivitePage />);
    expect(screen.getAllByText("Yönetici yetkisi olmadan rol atama denemesi").length).toBeGreaterThan(0);
    expect(screen.queryByText("not_admin_grant")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Stok bitti/).length).toBeGreaterThan(0);
  });

  it("alan adları katalog etiketiyle, iç çift (city/cityId) tek; koltuk seçimi sebebi çevrilir (arayüz testi O-107)", () => {
    h.items = [
      row("company.profile.updated", { changedFields: ["postalCode", "city", "cityId"] }),
      row("company.user.roles_changed", { reason: "seat_selection" }),
    ];
    render(<AktivitePage />);
    expect(screen.getAllByText("alanlar: Posta kodu, Şehir").length).toBeGreaterThan(0);
    expect(screen.queryByText(/postalCode/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Koltuk seçimiyle işlem yetkisi kaldırıldı").length).toBeGreaterThan(0);
    expect(screen.queryByText(/seat_selection/)).not.toBeInTheDocument();
  });

  it("kullanıcı yönetimi olayları 'Diğer işlem' değil kendi etiketiyle görünür", () => {
    h.items = [row("company.user.invited", {}), row("company.user.invitation_accepted", {})];
    render(<AktivitePage />);
    expect(screen.getByText("Üye davet edildi")).toBeInTheDocument();
    expect(screen.getByText("Üye daveti kabul edildi")).toBeInTheDocument();
    expect(screen.queryByText("Diğer işlem")).not.toBeInTheDocument();
  });
});
