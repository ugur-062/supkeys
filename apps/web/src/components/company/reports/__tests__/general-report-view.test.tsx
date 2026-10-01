// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  reportMutate: vi.fn(),
  reportPending: false,
  reportData: undefined as unknown,
  downloadMutate: vi.fn(),
  downloadPending: false,
  tenders: [] as unknown[],
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-reports", () => ({
  useGeneralReport: () => ({
    mutateAsync: h.reportMutate,
    isPending: h.reportPending,
    data: h.reportData,
  }),
  useDownloadGeneralReport: () => ({
    mutateAsync: h.downloadMutate,
    isPending: h.downloadPending,
  }),
}));
vi.mock("@/hooks/use-company-tenders", () => ({
  useTenders: () => ({ data: h.tenders }),
}));

import { GeneralReportView } from "../general-report-view";

function result(over: Record<string, unknown> = {}) {
  return {
    mode: "RANGE",
    type: "ALIM",
    generatedAt: new Date().toISOString(),
    rangeStart: null,
    rangeEnd: null,
    listings: [
      {
        id: "t1",
        number: "IHL-2026-0001",
        title: "Çelik Alımı",
        format: "RFQ",
        status: "AWARDED",
        currency: "TRY",
        round: 1,
        closesAt: null,
        publishedAt: null,
        createdAt: new Date().toISOString(),
        createdBy: null,
        invitedCount: 5,
        submittedBidCount: 3,
        responseRate: 60,
        estimatedTotal: 100000,
        highestTotal: 120000,
        lowestTotal: 90000,
        winningTotal: 90000,
        winnerName: "Demir Ltd.",
        delta: 10000,
      },
    ],
    summary: {
      totalListings: 1,
      awardedListings: 1,
      cancelledListings: 0,
      statusBreakdown: {},
      totalInvited: 5,
      totalSubmittedBids: 3,
      overallResponseRate: 60,
      avgBidsPerListing: 3,
      totalEstimated: 100000,
      totalAwardedValue: 90000,
      totalDelta: 10000,
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  h.reportPending = false;
  h.reportData = undefined;
  h.downloadPending = false;
  h.tenders = [
    { id: "t1", tenderNumber: "IHL-2026-0001", title: "Çelik Alımı" },
  ];
});

const base = { type: "ALIM" as const, basePath: "/company/satinalma/raporlar" };

describe("GeneralReportView", () => {
  it("kriter formu ve iki aksiyon butonu render edilir; başta oluştur pasif", () => {
    render(<GeneralReportView {...base} />);
    expect(screen.getByText("Genel Satın Alma Talebi Raporu")).toBeInTheDocument();
    expect(
      screen.getByText(/Tek bir satın alma talebini raporlayacağım/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/tarih aralığındaki satın alma taleplerini/),
    ).toBeInTheDocument();
    // Excel indir butonu her zaman görünür.
    expect(
      screen.getByRole("button", { name: /Excel İndir/ }),
    ).toBeInTheDocument();
    // Mod seçilmeden "Raporu Oluştur" pasif.
    expect(screen.getByRole("button", { name: /Raporu Oluştur/ })).toBeDisabled();
  });

  it("RANGE mod durum süzgecinde 'Değerlendirmede' (IN_AWARD) var (derin denetim LU-28)", async () => {
    const user = userEvent.setup();
    render(<GeneralReportView {...base} />);
    await user.click(screen.getAllByRole("radio")[1]); // RANGE
    const option = screen.getByRole("option", { name: "Değerlendirmede" });
    expect(option).toHaveAttribute("value", "IN_AWARD");
  });

  it("SINGLE mod: satın alma talebi seçince Raporu Oluştur mutasyonu tetikler", async () => {
    const user = userEvent.setup();
    h.reportMutate.mockResolvedValue(result());
    render(<GeneralReportView {...base} />);

    await user.click(screen.getAllByRole("radio")[0]); // SINGLE
    const select = await screen.findByRole("combobox");
    await user.selectOptions(select, "t1");

    const submit = screen.getByRole("button", { name: /Raporu Oluştur/ });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(h.reportMutate).toHaveBeenCalledWith({
      type: "ALIM",
      mode: "SINGLE",
      listingId: "t1",
    });
  });

  it("sonuç verisi varken özet şeridi + satın alma talebi satırı render edilir", () => {
    h.reportData = result();
    render(<GeneralReportView {...base} />);
    expect(screen.getByText("Toplam Satın Alma Talebi")).toBeInTheDocument();
    expect(screen.getByText("Yanıt Oranı")).toBeInTheDocument();
    // Özet şeridinde toplam tasarruf başlığı.
    expect(screen.getByText("Toplam Tasarruf")).toBeInTheDocument();
    // İhale satırı.
    expect(screen.getByRole("link", { name: "Çelik Alımı" })).toBeInTheDocument();
    expect(screen.getByText("Demir Ltd.")).toBeInTheDocument();
  });

  it("Türkçe özet şeridinde ondalık virgül: %77,3 ve 1,2 (arayüz testi O-033)", () => {
    const r = result();
    r.summary = { ...r.summary, overallResponseRate: 77.3, avgBidsPerListing: 1.2 };
    h.reportData = r;
    render(<GeneralReportView {...base} />);
    expect(screen.getByText("%77,3")).toBeInTheDocument();
    expect(screen.getByText("1,2")).toBeInTheDocument();
    expect(screen.queryByText("%77.3")).not.toBeInTheDocument();
  });

  it("ters tarih aralığında satır içi hata ve oluştur pasif (arayüz testi D-113)", async () => {
    const user = userEvent.setup();
    const { container } = render(<GeneralReportView {...base} />);
    await user.click(screen.getAllByRole("radio")[1]); // RANGE
    const dates = container.querySelectorAll('input[type="date"]');
    await user.type(dates[0] as HTMLElement, "2026-09-30");
    await user.type(dates[1] as HTMLElement, "2026-09-01");
    expect(screen.getByText("Bitiş tarihi başlangıçtan önce olamaz.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Raporu Oluştur/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Excel İndir/ })).toBeDisabled();
  });

  it("kriterler adrese yazılır; adresle açılış SINGLE raporu yeniden üretir (arayüz testi D-293)", async () => {
    const user = userEvent.setup();
    h.reportMutate.mockResolvedValue(result());
    const first = render(<GeneralReportView {...base} />);
    await user.click(screen.getAllByRole("radio")[0]); // SINGLE
    await user.selectOptions(await screen.findByRole("combobox"), "t1");
    await user.click(screen.getByRole("button", { name: /Raporu Oluştur/ }));
    expect(window.location.search).toBe("?mode=SINGLE&listing=t1");
    first.unmount();
    h.reportMutate.mockClear();

    render(<GeneralReportView {...base} />);
    expect(h.reportMutate).toHaveBeenCalledWith({ type: "ALIM", mode: "SINGLE", listingId: "t1" });
    expect(screen.getByRole("combobox")).toHaveValue("t1");
  });

  it("Excel indir başarılı → indirme mutasyonu + başarı toast'ı", async () => {
    const user = userEvent.setup();
    h.downloadMutate.mockResolvedValue({ filename: "rapor.xlsx" });
    render(<GeneralReportView {...base} />);

    await user.click(screen.getAllByRole("radio")[0]); // SINGLE
    const select = await screen.findByRole("combobox");
    await user.selectOptions(select, "t1");

    await user.click(screen.getByRole("button", { name: /Excel İndir/ }));
    expect(h.downloadMutate).toHaveBeenCalledWith({
      type: "ALIM",
      mode: "SINGLE",
      listingId: "t1",
    });
    expect(h.toast.success).toHaveBeenCalledWith("rapor.xlsx indiriliyor");
  });

  it("rapor mutasyonu hata verirse hata toast'ı gösterir", async () => {
    const user = userEvent.setup();
    h.reportMutate.mockRejectedValue(new Error("boom"));
    render(<GeneralReportView {...base} />);

    await user.click(screen.getAllByRole("radio")[0]);
    const select = await screen.findByRole("combobox");
    await user.selectOptions(select, "t1");
    await user.click(screen.getByRole("button", { name: /Raporu Oluştur/ }));

    expect(h.toast.error).toHaveBeenCalled();
  });

});
