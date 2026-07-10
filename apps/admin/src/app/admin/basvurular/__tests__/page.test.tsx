// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  companies: { data: undefined as unknown, isLoading: false, isError: false },
  lastParams: undefined as unknown,
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
    tier: "STANDARD",
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
  h.companies = {
    data: { items: [], total: 0, page: 1, pageSize: 25 },
    isLoading: false,
    isError: false,
  };
});

describe("Başvurular kuyruğu", () => {
  it("PENDING + en-eski-önce parametreleriyle sorgular", () => {
    render(<AdminBasvurularPage />);
    expect(h.lastParams).toMatchObject({ status: "PENDING", sort: "oldest" });
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
});
