// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  reportData: undefined as unknown,
  reportMutate: vi.fn(),
  downloadMutate: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-company-reports", () => ({
  useReportListingOptions: () => ({
    data: { items: [], total: 0, limit: 500 },
    isLoading: false,
  }),
  useBidComparisonReport: () => ({
    mutateAsync: h.reportMutate,
    isPending: false,
    data: h.reportData,
  }),
  useDownloadBidComparisonReport: () => ({ mutateAsync: h.downloadMutate, isPending: false }),
}));

import { BidComparisonView } from "../bid-comparison-view";

beforeEach(() => {
  vi.clearAllMocks();
  h.reportMutate.mockReset();
  h.downloadMutate.mockReset();
  h.reportData = undefined;
  window.history.replaceState(null, "", "/");
});

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
    // Tutarlar her zaman 2 ondalık (arayüz testi O-027).
    expect(screen.getByText("1.000,00 $")).toBeInTheDocument();
    // Genel toplam: USD teklif rapor biriminde (40.000 ₺), ham "1.000" değil.
    expect(screen.getByText("40.000,00 ₺")).toBeInTheDocument();
    // Hedef sütunu da birimli.
    expect(screen.getAllByText("38.000,00 ₺").length).toBeGreaterThan(0);
    expect(screen.getAllByText("36.000,00 ₺").length).toBeGreaterThanOrEqual(2);
    // Hedefe göre fark yüzdesi okuyucunun ondalık ayırıcısıyla.
    expect(screen.getByText("(+5,3%)")).toBeInTheDocument();
  });
});

/** Arayüz testi O-027: teklifin sonucu sütun başlığında; kuruşlu tutar. */
describe("BidComparisonView — teklif sonucu rozetleri", () => {
  it("Kazandı / Kaybetti / Elendi ayrı okunur; teklifsiz davetliye rozet yok", () => {
    h.reportData = {
      type: "ALIM",
      generatedAt: new Date().toISOString(),
      baseCurrency: "TRY",
      includePrice: true,
      includeAnswers: false,
      includeNonBidders: true,
      showBidCurrencies: false,
      listing: { id: "l1", number: "ROT-1", title: "Çelik", currency: "TRY", round: 1, referenceTotal: 0 },
      items: [
        { id: "i1", name: "Boru", unit: "adet", quantity: 1, referenceUnitPrice: null, bestUnitPrice: 2.5, bestCompanyId: "b" },
      ],
      parties: [
        party({ companyId: "a", companyName: "Kazanan AŞ", status: "WON", rank: 2, totalAmount: 3, totalCurrency: "TRY", totalTry: 3, itemPrices: [{ itemId: "i1", unitPrice: 3, currency: "TRY", totalPrice: 3, isBest: false, deltaVsReferencePct: null }] }),
        party({ companyId: "b", companyName: "Ucuz AŞ", status: "LOST", eliminated: false, rank: 1, totalAmount: 2.5, totalCurrency: "TRY", totalTry: 2.5, itemPrices: [{ itemId: "i1", unitPrice: 2.5, currency: "TRY", totalPrice: 2.5, isBest: true, deltaVsReferencePct: null }] }),
        party({ companyId: "c", companyName: "Elenen AŞ", status: "LOST", eliminated: true, totalAmount: 1, totalCurrency: "TRY", totalTry: 1, itemPrices: [{ itemId: "i1", unitPrice: 1, currency: "TRY", totalPrice: 1, isBest: false, deltaVsReferencePct: null }] }),
        party({ companyId: "d", companyName: "Sessiz AŞ", submitted: false, status: "NO_BID", totalAmount: null, totalTry: null, itemPrices: [] }),
      ],
      recommendedAwards: [],
      roundHistory: [],
    };
    render(<BidComparisonView type="ALIM" basePath="/company/raporlar" />);
    expect(screen.getByText("Kazandı")).toBeInTheDocument();
    expect(screen.getByText("Kaybetti")).toBeInTheDocument();
    expect(screen.getByText("Elendi")).toBeInTheDocument();
    expect(screen.getByText("teklif yok")).toBeInTheDocument();
    expect(screen.getAllByText("2,50 ₺").length).toBeGreaterThan(0);
  });
});

/** Arayüz testi D-293: kriterler adreste, Geri'de rapor yeniden üretilir. */
describe("BidComparisonView — kriterler adreste", () => {
  it("adreste talep varsa açılışta kriterler geri yüklenir ve rapor üretilir", () => {
    window.history.replaceState(null, "", "/raporlar/teklif-karsilastirma?listing=l9&criteria=BOTH&nonBidders=1");
    render(<BidComparisonView type="ALIM" basePath="/company/raporlar" />);
    expect(h.reportMutate).toHaveBeenCalledWith({
      type: "ALIM",
      listingId: "l9",
      criteria: "BOTH",
      includeNonBidders: true,
      showBidCurrencies: false,
      includeRoundHistory: false,
    });
  });
});

/**
 * Mobil kabuk (2026-10-16): dosya `saveFile` ile verilir; "indiriliyor" yalnız
 * tarayıcı indirmesinde — kabukta paylaşım sayfası / eski sürüm bilgisi kendi
 * sonucunu söyler.
 */
describe("BidComparisonView — Excel indir sonucu", () => {
  it.each([
    ["downloaded", true],
    ["shared", false],
    ["cancelled", false],
    ["unsupported", false],
    ["failed", false],
  ] as const)("indirme sonucu %s → 'indiriliyor' toast'ı: %s", async (outcome, toasted) => {
    window.history.replaceState(null, "", "/raporlar/teklif-karsilastirma?listing=l9");
    h.downloadMutate.mockResolvedValue({ filename: "karsilastirma.xlsx", outcome });
    render(<BidComparisonView type="ALIM" basePath="/company/raporlar" />);

    await userEvent.click(screen.getByRole("button", { name: /Excel İndir/ }));

    expect(h.downloadMutate).toHaveBeenCalledWith(expect.objectContaining({ listingId: "l9" }));
    if (toasted) expect(toast.success).toHaveBeenCalledWith("karsilastirma.xlsx indiriliyor");
    else expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

/** Mobil denetim g10-03 / g10-06 / g10-13 (2026-10-15). */
describe("BidComparisonView — telefon yerleşimi", () => {
  const longName = "MX-DOWN-SILVER TEST AMBALAJ LTD. ŞTİ.";
  function seed() {
    h.reportData = {
      type: "ALIM",
      generatedAt: new Date().toISOString(),
      baseCurrency: "TRY",
      includePrice: true,
      includeAnswers: false,
      includeNonBidders: false,
      showBidCurrencies: false,
      listing: { id: "l1", number: "ROT-745", title: "Rulman", currency: "TRY", round: 1, referenceTotal: 400 },
      items: [
        { id: "i1", name: "Rulman 6204 L2", unit: "adet", quantity: 10, referenceUnitPrice: 40, bestUnitPrice: 36, bestCompanyId: "a" },
      ],
      parties: [
        party({
          companyId: "a",
          companyName: longName,
          rank: 1,
          deltaVsReference: 320,
          totalAmount: 360,
          totalCurrency: "TRY",
          totalTry: 360,
          itemPrices: [{ itemId: "i1", unitPrice: 36, currency: "TRY", totalPrice: 360, isBest: true, deltaVsReferencePct: -10 }],
        }),
      ],
      recommendedAwards: [{ itemId: "i1", itemName: "Rulman 6204 L2", companyId: "a", companyName: longName, unitPrice: 36 }],
      roundHistory: [],
    };
  }

  it("'Hedefe Göre Tasarruf' etiketi de yapışkan; etiket sütunu telefonda dar ve sarar", () => {
    seed();
    render(<BidComparisonView type="ALIM" basePath="/company/raporlar" />);
    const label = screen.getByText("Hedefe Göre Tasarruf");
    const cell = label.closest("td")!;
    expect(cell.className.split(/\s+/)).toEqual(expect.arrayContaining(["sticky", "left-0", "z-10", "bg-white"]));
    expect(label.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["min-w-[36vw]", "max-w-[45vw]", "whitespace-normal", "sm:min-w-0"]),
    );
    // Miktar parantezi bölünmez ("(20" / "adet)" — doğrulama turu g10).
    const qty = screen.getByText("(10 adet)");
    expect(qty.className.split(/\s+/)).toContain("whitespace-nowrap");
    // Kart ikinci kaydırıcı değil; kenar payı gutter'a eşit.
    const card = cell.closest(".card")!;
    expect(card.className).not.toMatch(/overflow-x-auto/);
    expect(card.className).toContain("[--gutter:--spacing(2)]");
  });

  it("tedarikçi başlığı kırpılmaz (sarar, title taşır); önerilen kazanan fiyatı bölünmez", () => {
    seed();
    render(<BidComparisonView type="ALIM" basePath="/company/raporlar" />);
    const header = screen.getByText(longName, { selector: "th span" });
    expect(header.className).not.toMatch(/\btruncate\b/);
    expect(header.className.split(/\s+/)).toEqual(expect.arrayContaining(["whitespace-normal", "max-w-[10rem]"]));
    expect(header).toHaveAttribute("title", longName);
    const li = screen.getByText(longName, { selector: "li span" }).closest("li")!;
    expect(li.className.split(/\s+/)).toEqual(expect.arrayContaining(["flex-col", "sm:flex-row"]));
    const price = within(li).getByText("36,00 ₺");
    expect(price.className.split(/\s+/)).toEqual(expect.arrayContaining(["whitespace-nowrap", "shrink-0"]));
  });
});
