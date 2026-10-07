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
  VerifiedOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
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

describe("AktivitePage — erişim kilidi (arayüz testi O-044)", () => {
  it("efektif kademesi yetmeyen (doğrulanmamış) firmada log isteği atılmaz (kapı yeter, 403/toast yok); yetende atılır", () => {
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

  it("izin değişimi ham anahtar ve 'yeni roller' yerine hedef kişi + izin etiketleriyle; detay kesilmez (arayüz testi api2-01)", () => {
    h.items = [
      {
        ...row("company.user.permissions_changed", {
          before: ["sell:view"],
          after: ["sell:view", "sell:bid:submit", "sell:order:manage"],
          added: ["sell:bid:submit", "sell:order:manage"],
          removed: [],
        }),
        entityType: "company_user",
        entityId: "u1",
        entityLabel: "Ayşe Yılmaz",
      },
      row("company.user.roles_changed", { before: ["SATISCI"], after: ["YONETICI"] }),
    ];
    render(<AktivitePage />);
    const detail = "kullanıcı: Ayşe Yılmaz · eklenen izinler: Teklif verme, Satış siparişi işlemleri";
    expect(screen.getAllByText(detail).length).toBeGreaterThan(0);
    expect(screen.queryByText(/sell:bid:submit/)).not.toBeInTheDocument();
    // Rol değişimi rol etiketiyle kalır.
    expect(screen.getAllByText(/^yeni roller: /).length).toBeGreaterThan(0);
    // Masaüstü detay hücresi tek satıra kırpılmaz (truncate yok, sarar).
    const cell = screen.getAllByText(detail).find((el) => el.tagName === "TD");
    expect(cell).toBeDefined();
    expect(cell!.className).not.toMatch(/\btruncate\b/);
    expect(cell!.className).toMatch(/whitespace-normal/);
  });

  it("kullanıcı yönetimi olayları 'Diğer işlem' değil kendi etiketiyle görünür", () => {
    h.items = [row("company.user.invited", {}), row("company.user.invitation_accepted", {})];
    render(<AktivitePage />);
    expect(screen.getByText("Üye davet edildi")).toBeInTheDocument();
    expect(screen.getByText("Üye daveti kabul edildi")).toBeInTheDocument();
    expect(screen.queryByText("Diğer işlem")).not.toBeInTheDocument();
  });
});

// Arayüz testi son tur api-2: koltuk seçimi satırı toast/kullanıcılar
// sayfasıyla aynı adı taşır ve Detay'da sınır/kalan/kaldırılan özeti yazar.
describe("AktivitePage — koltuk seçimi satırı", () => {
  it("'Koltuk seçimi uygulandı' + sınır/kalan/kaldırılan özeti", () => {
    h.items = [
      row("company.seats.selection_applied", { limit: 2, keptCount: 2, droppedCount: 1 }),
    ];
    render(<AktivitePage />);
    expect(screen.getAllByText("Koltuk seçimi uygulandı").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("koltuk sınırı: 2 · kalan koltuk: 2 · işlem yetkisi kaldırılan: 1 kişi")
        .length,
    ).toBeGreaterThan(0);
  });
});

// Arayüz testi kapanış api-2:NEW-1: davet satırının Detay'ı boştu — metadata
// `{roles, permissions}` eşlenmiyordu.
describe("AktivitePage — davet / kabul / çıkarma satırları", () => {
  it("hazır set daveti yalnız rol etiketiyle; ham rol anahtarı basılmaz", () => {
    h.items = [
      row("company.user.invited", {
        roles: ["SATISCI"],
        permissions: [
          "sell:view",
          "sell:bid:submit",
          "sell:order:manage",
          "sell:product:manage",
          "sell:inquiry:reply",
          "connections:manage",
          "addresses:manage",
          "insights:view",
        ],
      }),
    ];
    render(<AktivitePage />);
    expect(screen.getAllByText("roller: Satışçı").length).toBeGreaterThan(0);
    expect(screen.queryByText(/SATISCI/)).not.toBeInTheDocument();
  });

  it("hazır setten sapan davet izinleri de etiketle listeler; rolsüz liste Görüntüleyici", () => {
    h.items = [
      row("company.user.invited", { roles: ["ONAYLAYICI"], permissions: ["approval:act", "buy:view"] }),
      row("company.user.invitation_accepted", {
        invitationId: "i1",
        roles: [],
        permissions: ["buy:view", "sell:view", "buy:reports:view"],
      }),
    ];
    render(<AktivitePage />);
    const custom = screen.getAllByText(/^roller: Onaylayıcı · izinler: /);
    expect(custom.length).toBeGreaterThan(0);
    expect(custom[0].textContent).toContain("Onaylama");
    expect(custom[0].textContent).not.toMatch(/approval:act|buy:view/);
    expect(screen.getAllByText("roller: Görüntüleyici").length).toBeGreaterThan(0);
  });

  it("davet iptali: davet edilen adres + geri alınan roller; metadata'sız eski satır kasıtlı yedek yazar (arayüz testi kalanlar api-2)", () => {
    h.items = [
      {
        ...row("company.user.invitation_cancelled", { roles: ["SATISCI"], permissions: [] }),
        entityType: "company_user_invitation",
        entityId: "inv1",
        entityLabel: "aday@firma.com",
      },
      { ...row("company.user.invitation_cancelled", {}), id: "eski", metadata: null },
    ];
    render(<AktivitePage />);
    expect(screen.getAllByText("davet edilen: aday@firma.com · roller: Satışçı").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("bekleyen davet geri alındı, davet bağlantısı artık çalışmaz").length,
    ).toBeGreaterThan(0);
  });

  it("izin üzerine yazma satırı (roles var, permissions yok) rol özeti eklemez; çıkarma önceki rolleri yazar", () => {
    h.items = [
      row("company.user.permissions_overridden", {
        roles: ["SATISCI"],
        rolesAfter: ["SATISCI"],
        before: ["sell:view"],
        after: ["sell:view", "sell:bid:submit"],
        added: ["sell:bid:submit"],
        removed: [],
      }),
      row("company.user.removed", { previousRoles: ["SATIN_ALMACI"] }),
    ];
    render(<AktivitePage />);
    expect(screen.getAllByText("eklenen izinler: Teklif verme").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^roller: /)).not.toBeInTheDocument();
    expect(screen.getAllByText("önceki roller: Satın Almacı").length).toBeGreaterThan(0);
  });
});
