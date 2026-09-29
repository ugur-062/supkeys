// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ reportData: undefined as unknown }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-company-tenders", () => ({
  useTenders: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/use-company-reports", () => ({
  useBidComparisonReport: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    data: h.reportData,
  }),
  useDownloadBidComparisonReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { BidComparisonView } from "../bid-comparison-view";

function party(over: Record<string, unknown>) {
  return {
    submitted: true,
    status: "SUBMITTED",
    bidCurrency: null,
    rank: null,
    deltaVsReference: null,
    itemAnswers: [],
    ...over,
  };
}

/**
 * Derin denetim Y-14 / S069: ham fiyatlar birimsiz yan yana basılıyordu
 * (USD teklif TRY hedefin 38 kat altında görünüyordu).
 */
describe("BidComparisonView — para birimi etiketleri", () => {
  it("kalem hücresi KALEMİN birimiyle; genel toplam rapor biriminde (totalTry)", () => {
    h.reportData = {
      type: "ALIM",
      generatedAt: new Date().toISOString(),
      baseCurrency: "TRY",
      includePrice: true,
      includeAnswers: false,
      includeNonBidders: false,
      showBidCurrencies: false,
      listing: { id: "l1", number: "ROT-1", title: "Çelik", currency: "USD", round: 1, referenceTotal: 38000 },
      items: [
        { id: "i1", name: "Boru", unit: "adet", quantity: 1, referenceUnitPrice: 38000, bestUnitPrice: 36000, bestCompanyId: "b" },
      ],
      parties: [
        party({
          companyId: "a",
          companyName: "Dolar AŞ",
          totalAmount: 1000,
          totalCurrency: "USD",
          totalTry: 40000,
          itemPrices: [{ itemId: "i1", unitPrice: 1000, currency: "USD", totalPrice: 1000, isBest: false, deltaVsReferencePct: 5.3 }],
        }),
        party({
          companyId: "b",
          companyName: "Lira AŞ",
          totalAmount: 36000,
          totalCurrency: "TRY",
          totalTry: 36000,
          itemPrices: [{ itemId: "i1", unitPrice: 36000, currency: "TRY", totalPrice: 36000, isBest: true, deltaVsReferencePct: -5.3 }],
        }),
      ],
      recommendedAwards: [],
      roundHistory: [],
    };
    render(<BidComparisonView type="ALIM" basePath="/company/raporlar" />);
    expect(screen.getByText("1.000 $")).toBeInTheDocument();
    // Genel toplam: USD teklif rapor biriminde (40.000 ₺), ham "1.000" değil.
    expect(screen.getByText("40.000 ₺")).toBeInTheDocument();
    // Hedef sütunu da birimli.
    expect(screen.getAllByText("38.000 ₺").length).toBeGreaterThan(0);
    expect(screen.getAllByText("36.000 ₺").length).toBeGreaterThanOrEqual(2);
  });
});
