// @vitest-environment jsdom
/**
 * Mobil denetim g04 (kullanıcı kararı: satır satır okunan tablolar sm altında
 * kart): kalem bazlı kazandırma tablosu 294 px'lik kutuda "Tutar" sütununu
 * ekran dışına itiyor, 6.000.000,00 ₺ "6.000" okunuyordu. Telefonda her kalem
 * etiketli bir kart (birim fiyat + satır tutarı tam), tablo yalnız sm+.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const DETAIL = {
  id: "a1",
  requestNo: "APR-2026-0039",
  type: "LISTING_AWARD",
  status: "PENDING",
  amount: 6_000_000,
  currency: "TRY",
  initiatorNote: null,
  createdBy: "Ali",
  createdAt: "2026-10-01T10:00:00.000Z",
  decidedAt: null,
  listing: {
    id: "l1",
    number: "ROT-000039",
    title: "Çelik boru",
    type: "ALIM",
    categoryIds: [],
    closesAt: null,
    itemCount: 1,
    totalQuantity: null,
    items: [],
  },
  award: {
    kind: "by-item",
    lines: [
      {
        lineNo: 1,
        itemName: "Dikişsiz çelik boru DN50",
        quantity: 1000,
        unit: "adet",
        companyName: "QA Tedarikçi",
        verified: true,
        unitPrice: 6000,
        lineTotal: 6_000_000,
        currency: "TRY",
      },
    ],
    winners: [{ bidId: "b1", companyName: "QA Tedarikçi", verified: true, total: 6_000_000, currency: "TRY", lineCount: 1 }],
  },
  competition: {
    validBidCount: 2,
    lowestTotal: 6_000_000,
    secondLowestTotal: 6_500_000,
    winnerRank: 1,
    currency: "TRY",
    currencyMixed: false,
  },
  steps: [],
  canOpenListing: false,
};

vi.mock("@/hooks/use-company-approvals", () => ({
  useApprovalDetail: () => ({ data: DETAIL, isPending: false, refetch: vi.fn() }),
}));

import { ApprovalDetailPanel } from "../approval-detail-panel";

describe("ApprovalDetailPanel — kalem bazlı satırlar telefonda kart", () => {
  it("kart: kalem adı, miktar · firma, etiketli birim fiyat ve TAM satır tutarı; tablo yalnız sm+", () => {
    render(<ApprovalDetailPanel id="a1" />);
    const cards = screen.getByTestId("approval-lines-cards");
    expect(cards.className).toMatch(/(^|\s)sm:hidden(\s|$)/);
    const card = within(cards).getByRole("listitem");
    expect(within(card).getByText("Dikişsiz çelik boru DN50")).toBeInTheDocument();
    expect(card).toHaveTextContent("QA Tedarikçi");
    expect(within(card).getByText("Birim fiyat")).toBeInTheDocument();
    expect(within(card).getByText("Tutar")).toBeInTheDocument();
    expect(card).toHaveTextContent(/6\.000\.000,00/);
    expect(card).toHaveTextContent(/6\.000,00/);

    const table = screen.getByRole("table");
    expect(table.parentElement!.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(table.parentElement!.className).toMatch(/(^|\s)sm:block(\s|$)/);
  });
});
