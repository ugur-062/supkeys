// @vitest-environment jsdom
/**
 * Talep detayı — sahip teklif sekmesi (derin denetim LU-21):
 *  · Kalem karşılaştırmasında elenmiş (LOST) teklif "en iyi" diye boyanmaz,
 *    sütununda "Elendi" etiketi çıkar.
 *  · Kazandır / Kalem bazlı kazandır `buy:award` ister (API aynası); Ele
 *    buy:listing:manage ile kalır.
 */
import type { ListingDetail } from "@/hooks/use-company-listings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: undefined as unknown,
  perms: [] as string[],
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "l1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/ilan/l1",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: {
    get: vi.fn(async () => ({ data: [] })),
    post: vi.fn(async () => ({ data: {} })),
    patch: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { id: "u1" }, company: { id: "c1", country: "TR", tier: "GOLD" } }),
  useHasCompanyPermission: (p: string) => h.perms.includes(p),
}));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: { id: "u1" }, company: { id: "c1", country: "TR" } }),
}));
vi.mock("@/hooks/use-company-approvals", () => ({
  useCancelApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-listings", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    useListingDetail: () => ({
      data: h.detail,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
  };
});

import ListingDetailPage from "../page";

const bid = (id: string, name: string, status: string, unitPrice: string) => ({
  id,
  bidderName: name,
  bidderCompanyId: `c-${id}`,
  amount: String(Number(unitPrice) * 10),
  currency: "TRY",
  note: null,
  status,
  createdAt: new Date().toISOString(),
  submittedAt: new Date().toISOString(),
  items: [{ itemId: "i1", unitPrice }],
});

function detail(): ListingDetail {
  return {
    id: "l1",
    number: "ROT-2026-0001",
    type: "ALIM",
    title: "Rulman Alımı",
    status: "OPEN",
    format: "RFQ",
    isOwner: true,
    createdById: "u1",
    canPublish: false,
    canEdit: false,
    pendingApprovalId: null,
    primaryCurrency: "TRY",
    allowedCurrencies: [],
    categoryIds: [],
    targetCountries: [],
    closesAt: new Date(Date.now() + 86_400_000).toISOString(),
    items: [{ id: "i1", name: "Rulman", quantity: "10", unit: "adet" }],
    bids: [
      { ...bid("b1", "Ucuz Elenen", "LOST", "50"), eliminatedAt: new Date().toISOString() },
      bid("b2", "Canli Teklif", "SUBMITTED", "80"),
    ],
    invitations: [],
  } as unknown as ListingDetail;
}

function openBidsTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ListingDetailPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.detail = detail();
  h.perms = ["buy:view", "buy:listing:manage", "buy:award"];
});

describe("Talep detayı (sahip) — teklif sekmesi (LU-21)", () => {
  it("elenmiş teklifin fiyatı 'en iyi' boyanmaz; sütunda 'Elendi' var", async () => {
    openBidsTab();
    // Karşılaştırma tablosu = başlığında teklifçi adları olan tablo.
    const header = screen.getAllByText("Ucuz Elenen").map((e) => e.closest("th")).find(Boolean)!;
    const table = header.closest("table")!;
    const row = within(table)
      .getAllByRole("row")
      .find((r) => r.textContent?.startsWith("Rulman"))!;
    const cells = within(row).getAllByRole("cell");
    const lost = cells.find((c) => c.textContent?.includes("50"))!;
    const live = cells.find((c) => c.textContent?.includes("80"))!;
    expect(lost.className).not.toMatch(/emerald/);
    expect(live.className).toMatch(/emerald/);
    expect(within(header).getByText("Elendi")).toBeInTheDocument();
  });

  it("kazandırmada kaybeden 'Kaybetti', kazanansız kapanan 'Kapandı'; 'Elendi' yalnız elenen (arayüz testi D-102)", () => {
    const base = detail();
    h.detail = {
      ...base,
      status: "AWARDED",
      bids: [
        { ...bid("b1", "Elenen Firma", "LOST", "50"), eliminatedAt: new Date().toISOString() },
        bid("b2", "Kazanan Firma", "WON", "80"),
        bid("b3", "Kaybeden Firma", "LOST", "90"),
        // Satıcı kazandığı siparişi reddetti: eliminatedAt dolu ama alıcı
        // ELEMEDİ → "Sipariş reddedildi" (arayüz testi son tur).
        { ...bid("b4", "Reddeden Firma", "LOST", "70"), eliminatedAt: new Date().toISOString(), orderRejected: true },
      ],
    } as unknown as ListingDetail;
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ListingDetailPage />
      </QueryClientProvider>,
    );
    expect(screen.getAllByText("Elendi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Kaybetti").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sipariş reddedildi").length).toBeGreaterThan(0);
    unmount();
    h.detail = {
      ...base,
      status: "CLOSED_NO_AWARD",
      bids: [bid("b3", "Kaybeden Firma", "LOST", "90")],
    } as unknown as ListingDetail;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ListingDetailPage />
      </QueryClientProvider>,
    );
    expect(screen.getAllByText("Kapandı").length).toBeGreaterThan(0);
    expect(screen.queryByText("Elendi")).toBeNull();
  });

  it("buy:award yoksa Kazandır ve Kalem bazlı kazandır yok, Ele var", async () => {
    h.perms = ["buy:view", "buy:listing:manage"];
    openBidsTab();
    expect(screen.queryByRole("button", { name: "Kazandır" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Kalem bazlı kazandır/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Ele" })).toBeInTheDocument();
  });

  it("buy:award varsa Kazandır görünür", async () => {
    openBidsTab();
    expect(screen.getByRole("button", { name: "Kazandır" })).toBeInTheDocument();
  });
});
