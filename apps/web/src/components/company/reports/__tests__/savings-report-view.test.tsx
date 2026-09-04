// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  reportMutate: vi.fn(),
  reportPending: false,
  reportData: undefined as unknown,
  downloadMutate: vi.fn(),
  downloadPending: false,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-reports", () => ({
  useSavingsReport: () => ({
    mutateAsync: h.reportMutate,
    isPending: h.reportPending,
    data: h.reportData,
  }),
  useDownloadSavingsReport: () => ({
    mutateAsync: h.downloadMutate,
    isPending: h.downloadPending,
  }),
}));

import { SavingsReportView } from "../savings-report-view";

function result(rows: unknown[]) {
  return {
    type: "ALIM",
    generatedAt: new Date().toISOString(),
    rangeStart: new Date().toISOString(),
    rangeEnd: new Date().toISOString(),
    currency: null,
    rows,
    summary: {
      totalListings: rows.length,
      grandHighest: 120000,
      grandLowest: 90000,
      grandTarget: 100000,
      grandActual: 90000,
      grandDelta: 30000,
      grandDeltaPct: 25,
      avgDeltaPct: 25,
      best: { number: "IHL-1", title: "Çelik Alımı", deltaPct: 25 },
      worst: null,
      byParty: [{ name: "Demir Ltd.", awarded: 90000 }],
    },
  };
}

function row() {
  return {
    id: "r1",
    number: "IHL-2026-0001",
    title: "Çelik Alımı",
    currency: "TRY",
    bidCount: 3,
    highestBid: 120000,
    lowestBid: 90000,
    winningTotal: 90000,
    delta: 30000,
    deltaPct: 25,
    targetTotal: 100000,
    actualTotal: 90000,
    winners: [{ name: "Demir Ltd.", total: 90000 }],
    items: [
      {
        name: "Profil",
        unit: "adet",
        quantity: 10,
        awardedQuantity: 10,
        referenceUnitPrice: 100,
        winningUnitPrice: 90,
        winnerName: "Demir Ltd.",
        itemReference: 1000,
        itemActual: 900,
        delta: 100,
      },
    ],
    awardedAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.reportPending = false;
  h.reportData = undefined;
  h.downloadPending = false;
});

const base = { type: "ALIM" as const, basePath: "/company/satinalma/raporlar" };

describe("SavingsReportView", () => {
  it("kriter formu render edilir; tarih boşken butonlar pasif", () => {
    render(<SavingsReportView {...base} />);
    expect(screen.getByText("Tasarruf Raporu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Raporu Oluştur/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Excel İndir/ })).toBeDisabled();
  });

  it("tarih aralığı girilince Raporu Oluştur mutasyonu tetiklenir", async () => {
    const user = userEvent.setup();
    h.reportMutate.mockResolvedValue(result([row()]));
    const { container } = render(<SavingsReportView {...base} />);

    const dates = container.querySelectorAll('input[type="date"]');
    await user.type(dates[0] as HTMLElement, "2026-01-01");
    await user.type(dates[1] as HTMLElement, "2026-06-30");

    const submit = screen.getByRole("button", { name: /Raporu Oluştur/ });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(h.reportMutate).toHaveBeenCalledTimes(1);
    const payload = h.reportMutate.mock.calls[0][0];
    expect(payload.type).toBe("ALIM");
    expect(payload.rangeStart).toContain("2026-01-01");
  });

  it("sonuç satırları + özet + karşı taraf kırılımı render edilir", () => {
    h.reportData = result([row()]);
    render(<SavingsReportView {...base} />);
    expect(screen.getByText("Toplam Tasarruf")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Çelik Alımı" })).toBeInTheDocument();
    // Tedarikçi bazlı kırılım başlığı.
    expect(screen.getByText("Tedarikçi Bazlı Kazanılan Tutar")).toBeInTheDocument();
    expect(screen.getAllByText("Demir Ltd.").length).toBeGreaterThanOrEqual(1);
  });

  it("kalem detayı açılıp kapanır", async () => {
    const user = userEvent.setup();
    h.reportData = result([row()]);
    render(<SavingsReportView {...base} />);
    expect(screen.queryByText("Kalem Detayı")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kalem detayı" }));
    expect(screen.getByText("Kalem Detayı")).toBeInTheDocument();
    expect(screen.getByText(/Profil/)).toBeInTheDocument();
  });

  it("boş sonuç → 'kazandırılmış satın alma talebi yok' mesajı", () => {
    h.reportData = result([]);
    render(<SavingsReportView {...base} />);
    expect(
      screen.getByText(/Bu aralıkta kazandırılmış satın alma talebi yok/),
    ).toBeInTheDocument();
  });

  it("Excel indir başarılı → indirme mutasyonu + başarı toast'ı", async () => {
    const user = userEvent.setup();
    h.downloadMutate.mockResolvedValue({ filename: "tasarruf.xlsx" });
    const { container } = render(<SavingsReportView {...base} />);

    const dates = container.querySelectorAll('input[type="date"]');
    await user.type(dates[0] as HTMLElement, "2026-01-01");
    await user.type(dates[1] as HTMLElement, "2026-06-30");
    await user.click(screen.getByRole("button", { name: /Excel İndir/ }));

    expect(h.downloadMutate).toHaveBeenCalledTimes(1);
    expect(h.toast.success).toHaveBeenCalledWith("tasarruf.xlsx indiriliyor");
  });

});
