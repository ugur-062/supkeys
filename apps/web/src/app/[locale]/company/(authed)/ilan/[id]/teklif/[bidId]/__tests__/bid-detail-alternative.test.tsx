// @vitest-environment jsdom
/**
 * Derin denetim Y-16 — tedarikçinin MUADİL beyanı (isAlternative /
 * offeredBrand / offeredMpn) alıcının teklif detayında görünmeli. API bu
 * alanları sahip dalında döndürüyordu ama kalem tablosu hiç çizmiyordu →
 * alıcı istediği markanın teklif edildiğini sanıp kazandırabiliyordu.
 */
import type { ListingDetail } from "@/hooks/use-company-listings";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ detail: undefined as unknown }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "l1", bidId: "b1" }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/providers/confirm-dialog", () => ({
  useConfirm: () => async () => true,
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { id: "u1" }, company: null }),
  useHasCompanyPermission: () => true,
}));
vi.mock("@/hooks/use-company-listings", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    useListingDetail: () => ({
      data: h.detail,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useAwardListing: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useAwardPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useEliminateBid: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});
vi.mock("@/hooks/use-bid-documents", () => ({
  useBidDocuments: () => ({ data: [] }),
  BID_DOC_KINDS: ["TEKLIF_MEKTUBU", "DIGER"],
}));

import BidDetailPage from "../page";

function detail(
  bidItems: NonNullable<NonNullable<ListingDetail["bids"]>[number]["items"]>,
): ListingDetail {
  return {
    id: "l1",
    number: "ROT-2026-0001",
    type: "ALIM",
    title: "Rulman Alımı",
    status: "OPEN",
    isOwner: true,
    createdById: "u1",
    primaryCurrency: "TRY",
    items: [
      {
        id: "i1",
        lineNo: 1,
        name: "Rulman",
        quantity: "10",
        unit: "adet",
        brand: "SKF",
        mpn: "6204-2RS",
        alternativeAllowed: true,
        targetPrice: null,
      },
      {
        id: "i2",
        lineNo: 2,
        name: "Kayış",
        quantity: "5",
        unit: "adet",
        targetPrice: null,
      },
    ],
    bids: [
      {
        id: "b1",
        bidderName: "Tedarikçi A.Ş.",
        amount: "1500",
        currency: "TRY",
        note: null,
        status: "SUBMITTED",
        createdAt: new Date().toISOString(),
        items: bidItems,
      },
    ],
  } as unknown as ListingDetail;
}

beforeEach(() => {
  h.detail = undefined;
});

describe("Teklif detayı — muadil beyanı (Y-16)", () => {
  it("muadil kalemde rozet + teklif edilen marka/parça no + istenen gösterilir", () => {
    h.detail = detail([
      {
        itemId: "i1",
        unitPrice: "100",
        isAlternative: true,
        offeredBrand: "FAG",
        offeredMpn: "6204-C",
      },
      { itemId: "i2", unitPrice: "100", isAlternative: false },
    ]);
    render(<BidDetailPage />);
    const row = screen.getByText("Rulman").closest("tr")!;
    expect(within(row).getByText("Muadil")).toBeInTheDocument();
    expect(
      within(row).getByText("Teklif edilen: FAG · 6204-C"),
    ).toBeInTheDocument();
    expect(within(row).getByText("İstenen: SKF · 6204-2RS")).toBeInTheDocument();
    // Muadil olmayan kalemde rozet yok.
    const row2 = screen.getByText("Kayış").closest("tr")!;
    expect(within(row2).queryByText("Muadil")).toBeNull();
  });

  it("marka/parça no girilmemiş muadil beyanı da görünür", () => {
    h.detail = detail([
      { itemId: "i1", unitPrice: "100", isAlternative: true },
    ]);
    render(<BidDetailPage />);
    const row = screen.getByText("Rulman").closest("tr")!;
    expect(within(row).getByText("Muadil")).toBeInTheDocument();
    expect(
      within(row).getByText("Teklif edilen marka / parça no belirtilmedi"),
    ).toBeInTheDocument();
  });

  it("muadil beyanı yoksa rozet çizilmez", () => {
    h.detail = detail([{ itemId: "i1", unitPrice: "100" }]);
    render(<BidDetailPage />);
    expect(screen.queryByText("Muadil")).toBeNull();
    expect(screen.queryByTestId("alternative-offer")).toBeNull();
  });
});
