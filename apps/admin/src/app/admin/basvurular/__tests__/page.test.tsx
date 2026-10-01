// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  companies: { data: undefined as unknown, isLoading: false, isError: false },
  lastParams: undefined as unknown,
  search: "",
  replace: vi.fn(),
  admin: { role: "SUPER_ADMIN" } as { role: string } | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  usePathname: () => "/admin/basvurular",
  useSearchParams: () => new URLSearchParams(h.search),
}));

vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: h.admin }),
}));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/use-admin-companies", () => ({
  useAdminCompanies: (params: unknown) => {
    h.lastParams = params;
    return h.companies;
  },
}));

import AdminBasvurularPage from "../page";

function pendingRow(id: string, daysWaiting: number, country = "TR") {
  return {
    id,
    rothernId: `SK-${id}`,
    name: `Bekleyen ${id}`,
    country,
    stateRegion: null,
    city: null,
    tier: "STANDART",
    membershipEndAt: null,
    verification: "PENDING",
    isBlocked: false,
    complaintCount: 0,
    userCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: new Date(Date.now() - daysWaiting * 86_400_000).toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.admin = { role: "SUPER_ADMIN" };
  h.lastParams = undefined;
  h.search = "";
  h.companies = {
    data: { items: [], total: 0, page: 1, pageSize: 25 },
    isLoading: false,
    isError: false,
  };
});

describe("Başvurular kuyruğu", () => {
  it("kyc-kuyruğu + en-eski-önce parametreleriyle sorgular (Faz Y: PENDING + revizyonlular)", () => {
    render(<AdminBasvurularPage />);
    expect(h.lastParams).toMatchObject({ queue: "kyc", sort: "oldest" });
  });

  it("boş kuyruk mesajı", () => {
    render(<AdminBasvurularPage />);
    expect(screen.getByText(/Kuyruk boş/)).toBeInTheDocument();
  });

  it("bekleme rozetleri: 7+ gün kırmızı, satır Belgeler sekmesine link", () => {
    h.companies = {
      data: {
        items: [pendingRow("a", 8), pendingRow("b", 0, "DE")],
        total: 2,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    };
    render(<AdminBasvurularPage />);
    expect(screen.getByText("8 gün")).toBeInTheDocument();
    expect(screen.getByText("bugün")).toBeInTheDocument();
    // Yabancı firma rozeti.
    expect(screen.getByText("Yabancı")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "İncele" });
    expect(links[0]).toHaveAttribute(
      "href",
      "/admin/firmalar/a?tab=belgeler&from=queue",
    );
  });

  it("Başvuru tarihi ve bekleme kuyruğa giriş anından (submittedAt) gelir, son düzenlemeden değil (arayüz testi O-075)", () => {
    h.companies = {
      data: {
        items: [
          {
            ...pendingRow("a", 0),
            submittedAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
      isLoading: false,
      isError: false,
    };
    render(<AdminBasvurularPage />);
    expect(screen.getByText("9 gün")).toBeInTheDocument();
    expect(screen.queryByText("bugün")).not.toBeInTheDocument();
  });

  it("sayfa URL'den okunur ve firma bağlantısına taşınır; sayfa değişimi URL'ye yazılır (D-198)", async () => {
    h.search = "page=2";
    h.companies = {
      data: { items: [pendingRow("a", 1)], total: 30, page: 2, pageSize: 25 },
      isLoading: false,
      isError: false,
    };
    render(<AdminBasvurularPage />);
    expect(h.lastParams).toMatchObject({ page: 2 });
    expect(screen.getByRole("link", { name: "İncele" })).toHaveAttribute(
      "href",
      "/admin/firmalar/a?tab=belgeler&from=queue&qp=2",
    );
  });
});

describe("Başvurular — rol kapısı (arayüz testi T-09 / D-033)", () => {
  it("SUPPORT adresle açınca kuyruk sorgusu HİÇ atılmaz, yetki kartı çizilir", () => {
    h.admin = { role: "SUPPORT" };
    render(<AdminBasvurularPage />);
    expect(h.lastParams).toBeUndefined();
    expect(screen.getByText("Bu sayfaya erişim yetkiniz yok.")).toBeInTheDocument();
    expect(screen.getByText(/Süper Admin ve Satış rollerine açık/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tekrar dene/i })).not.toBeInTheDocument();
  });

  it("SALES kuyruğu görür", () => {
    h.admin = { role: "SALES" };
    h.companies = { data: { items: [], total: 0 }, isLoading: false, isError: false };
    render(<AdminBasvurularPage />);
    expect(h.lastParams).toBeDefined();
    expect(screen.queryByText("Bu sayfaya erişim yetkiniz yok.")).not.toBeInTheDocument();
  });
});
