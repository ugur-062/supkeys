// @vitest-environment jsdom
/**
 * Raporlar EN arayüzde (derin denetim LU-28): Teklif Karşılaştırma tutarında
 * sembolün yeri dilden (`affixCurrency`: "$1,000", "1,000 $" değil); Tasarruf
 * raporu kalem detayında Türkçe saklanan birim ("adet") katalogdan çevrilir.
 * Bu dosya next-intl sahtesini EN katalogla kurar.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ bidData: undefined as unknown, savingsData: undefined as unknown }));

vi.mock("next-intl", async () => {
  const { createFormatter, createTranslator } = await import("use-intl/core");
  const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
  const MESSAGES = messagesFor("en", WEB_NAMESPACES);
  const TZ = "Europe/Istanbul";
  const makeT = (namespace?: string) =>
    createTranslator({
      locale: "en",
      messages: MESSAGES,
      namespace: namespace as never,
      timeZone: TZ,
      onError: () => {},
      getMessageFallback: ({ namespace: ns, key }) => (ns ? `${ns}.${key}` : key),
    });
  return {
    useTranslations: (namespace?: string) => makeT(namespace),
    useLocale: () => "en",
    useMessages: () => MESSAGES,
    useFormatter: () => createFormatter({ locale: "en", timeZone: TZ }),
    useNow: () => new Date(),
    useTimeZone: () => TZ,
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-company-tenders", () => ({
  useTenders: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/use-company-reports", () => ({
  useBidComparisonReport: () => ({ mutateAsync: vi.fn(), isPending: false, data: h.bidData }),
  useDownloadBidComparisonReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSavingsReport: () => ({ mutateAsync: vi.fn(), isPending: false, data: h.savingsData }),
  useDownloadSavingsReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { BidComparisonView } from "../bid-comparison-view";
import { SavingsReportView } from "../savings-report-view";

describe("BidComparisonView — EN", () => {
  it("sembol İngilizcede sayının önünde", () => {
    h.bidData = {
      type: "ALIM",
      generatedAt: new Date().toISOString(),
      baseCurrency: "TRY",
      includePrice: true,
      includeAnswers: false,
      includeNonBidders: false,
      showBidCurrencies: false,
      listing: { id: "l1", number: "ROT-1", title: "Steel", currency: "USD", round: 1, referenceTotal: 38000 },
      items: [
        { id: "i1", name: "Pipe", unit: "adet", quantity: 1, referenceUnitPrice: 38000, bestUnitPrice: 1000, bestCompanyId: "a" },
      ],
      parties: [
        {
          submitted: true,
          status: "SUBMITTED",
          bidCurrency: null,
          rank: null,
          deltaVsReference: null,
          itemAnswers: [],
          companyId: "a",
          companyName: "Dollar Inc",
          totalAmount: 1000,
          totalCurrency: "USD",
          totalTry: 40000,
          itemPrices: [{ itemId: "i1", unitPrice: 1000, currency: "USD", totalPrice: 1000, isBest: true, deltaVsReferencePct: null }],
        },
      ],
      recommendedAwards: [],
      roundHistory: [],
    };
    render(<BidComparisonView type="ALIM" basePath="/company/raporlar" />);
    expect(screen.getByText("$1,000")).toBeInTheDocument();
    expect(screen.getByText("₺40,000")).toBeInTheDocument();
    expect(screen.queryByText("1,000 $")).not.toBeInTheDocument();
  });
});

describe("SavingsReportView — EN", () => {
  it("kalem detayında birim katalogdan çevrilir, miktar EN biçiminde", async () => {
    const user = userEvent.setup();
    h.savingsData = {
      type: "ALIM",
      generatedAt: new Date().toISOString(),
      rangeStart: new Date().toISOString(),
      rangeEnd: new Date().toISOString(),
      currency: null,
      rows: [
        {
          id: "r1",
          number: "ROT-2026-0001",
          title: "Steel purchase",
          currency: "TRY",
          bidCount: 1,
          highestBid: 900,
          lowestBid: 900,
          winningTotal: 900,
          delta: 100,
          deltaPct: 10,
          targetTotal: 1000,
          actualTotal: 900,
          winners: [{ name: "Iron Ltd", total: 900 }],
          items: [
            {
              name: "Profile",
              unit: "adet",
              quantity: 1500,
              awardedQuantity: null,
              referenceUnitPrice: 1,
              winningUnitPrice: 0.6,
              winnerName: "Iron Ltd",
              itemReference: 1000,
              itemActual: 900,
              delta: 100,
            },
          ],
          awardedAt: new Date().toISOString(),
        },
      ],
      summary: {
        totalListings: 1,
        grandHighest: 900,
        grandLowest: 900,
        grandTarget: 1000,
        grandActual: 900,
        grandDelta: 100,
        grandDeltaPct: 10,
        avgDeltaPct: 10,
        best: null,
        worst: null,
        byParty: [],
      },
    };
    render(<SavingsReportView type="ALIM" basePath="/company/raporlar" />);
    await user.click(screen.getByRole("button", { name: "Line item detail" }));
    expect(screen.getByText("(piece)")).toBeInTheDocument();
    expect(screen.queryByText("(adet)")).not.toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
  });
});
