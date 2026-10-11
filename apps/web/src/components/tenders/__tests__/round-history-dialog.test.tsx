// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-company-listings", () => ({
  useRoundHistory: () => ({
    isLoading: false,
    isError: false,
    data: [
      {
        round: 1,
        bids: [
          { bidderName: "Dolar AŞ", amount: "100", currency: "USD" },
          { bidderName: "Lira AŞ", amount: "4000", currency: "TRY" },
          { bidderName: "Eski AŞ", amount: "5000" },
        ],
      },
    ],
    refetch: vi.fn(),
  }),
}));

import { RoundHistoryDialog } from "../round-history-dialog";

describe("RoundHistoryDialog (derin denetim Y-14)", () => {
  it("her teklif KENDİ biriminde; birim yoksa ilan birimine düşer", () => {
    render(<RoundHistoryDialog id="l1" open onClose={() => {}} currency="TRY" />);
    // 100 USD eskiden "100 ₺" görünüyordu.
    expect(screen.getByText("100,00 $")).toBeInTheDocument();
    expect(screen.queryByText(/^100(,00)? ₺$/)).toBeNull();
    expect(screen.getByText("4.000,00 ₺")).toBeInTheDocument();
    expect(screen.getByText("5.000,00 ₺")).toBeInTheDocument();
  });
});
