// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BidImportResult } from "@rothern/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  parse: vi.fn(),
  ai: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@/hooks/use-bid-import", () => ({
  useDownloadBidTemplate: () => ({ mutateAsync: h.download, isPending: false }),
  useParseBidTemplate: () => ({ mutateAsync: h.parse, isPending: false }),
  useAiBidPriceExtract: () => ({ mutateAsync: h.ai, isPending: false }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { BidImportDialog } from "../bid-import-dialog";

const base = (over: Partial<BidImportResult["matches"][number]>) => ({
  itemId: "i1",
  lineNo: 1,
  itemName: "Çelik boru",
  itemQuantity: "120",
  itemUnit: "m",
  source: null,
  unitPrice: null,
  currency: null,
  deliveryTime: null,
  note: null,
  confidence: "none" as const,
  errors: [],
  warnings: [],
  ...over,
});

const TEMPLATE_RESULT: BidImportResult = {
  mode: "template",
  listingId: "L1",
  matches: [
    base({ itemId: "i1", lineNo: 1, itemName: "Çelik boru", unitPrice: 185.5, deliveryTime: "W1_2", confidence: "exact", source: "Şablon satır 2" }),
    base({ itemId: "i2", lineNo: 2, itemName: "Dirsek", unitPrice: 10, confidence: "exact", errors: ["Para birimi (EUR) bu ihalede kabul edilmiyor"] }),
    base({ itemId: "i3", lineNo: 3, itemName: "Flanş" }),
  ],
  unmatchedDocRows: [],
  notices: [],
  pricesIncludeVat: null,
  docCurrency: null,
  matchedCount: 1,
};

const AI_RESULT: BidImportResult = {
  mode: "ai",
  listingId: "L1",
  matches: [
    base({ itemId: "i1", lineNo: 1, itemName: "Çelik boru", unitPrice: 185, confidence: "exact", source: "Boru siyah BRU-200" }),
    base({ itemId: "i2", lineNo: 2, itemName: "Dirsek", unitPrice: 40, confidence: "medium", source: "Dirsek benzeri", warnings: ["Belgedeki miktar (10) ihaledekinden (40) farklı"] }),
    base({ itemId: "i3", lineNo: 3, itemName: "Flanş" }),
  ],
  unmatchedDocRows: [{ id: "doc-5", text: "Flanş DN50 galvaniz", unitPrice: 90, currency: null, deliveryTime: null }],
  notices: ["Belgedeki fiyatlar KDV DAHİL görünüyor — teklif fiyatları KDV hariç olmalı, kontrol edin"],
  pricesIncludeVat: true,
  docCurrency: "TRY",
  matchedCount: 2,
};

function pickFiles(names: string[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const files = names.map((n) => new File(["x"], n, { type: "application/octet-stream" }));
  fireEvent.change(input, { target: { files } });
}

describe("BidImportDialog — Excel şablonu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.parse.mockResolvedValue(TEMPLATE_RESULT);
    h.download.mockResolvedValue({ filename: "t.xlsx" });
  });

  it("şablon indir butonu + AI kullanılmaz metni; yüklenince önizleme: hatalı satır uygulanmaz, 'none' kalem boş; Uygula yalnız geçerli fiyatları verir", async () => {
    const onApply = vi.fn();
    render(
      <BidImportDialog open variant="excel" listingId="L1" currencyLabel="TRY" onClose={() => {}} onApply={onApply} />,
    );
    expect(screen.getByText(/AI kullanılmaz/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Şablonu indir" }));
    expect(h.download).toHaveBeenCalled();

    pickFiles(["teklif.xlsx"]);
    await waitFor(() => expect(h.parse).toHaveBeenCalledTimes(1));
    await screen.findByText("1 / 3 kalem fiyatlandı");
    expect(screen.getByText(/EUR.*kabul edilmiyor/)).toBeInTheDocument();
    expect(screen.getByText("185,50 TRY")).toBeInTheDocument();
    expect(screen.getByText("1-2 hafta")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1 kalemin fiyatını uygula" }));
    expect(onApply).toHaveBeenCalledWith([
      { itemId: "i1", unitPrice: 185.5, currency: null, deliveryTime: "W1_2" },
    ]);
  });

  it("uygula kutusu kaldırılan kalem listeden düşer", async () => {
    const onApply = vi.fn();
    render(
      <BidImportDialog open variant="excel" listingId="L1" currencyLabel="TRY" onClose={() => {}} onApply={onApply} />,
    );
    pickFiles(["teklif.xlsx"]);
    await screen.findByText("1 / 3 kalem fiyatlandı");
    fireEvent.click(screen.getByLabelText("Çelik boru uygula"));
    expect(screen.getByRole("button", { name: "0 kalemin fiyatını uygula" })).toBeDisabled();
  });
});

describe("BidImportDialog — Belgeden Fiyatla (AI)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.ai.mockResolvedValue(AI_RESULT);
  });

  it("AI önizlemesi: KDV uyarısı, güven rozetleri, düşük güven uyarısı; eşleşmeyen kalem belge satırından ELLE seçilir ve uygulanır", async () => {
    const onApply = vi.fn();
    render(<BidImportDialog open variant="ai" listingId="L1" currencyLabel="TRY" onClose={() => {}} onApply={onApply} />);
    pickFiles(["fiyat-listesi.pdf"]);
    await waitFor(() => expect(h.ai).toHaveBeenCalledTimes(1));
    expect(h.ai.mock.calls[0]![0]).toHaveLength(1);

    await screen.findByText("2 / 3 kalem fiyatlandı");
    expect(screen.getByText(/KDV DAHİL/)).toBeInTheDocument();
    expect(screen.getByText("Kesin")).toBeInTheDocument();
    expect(screen.getByText("Emin misiniz?")).toBeInTheDocument();
    expect(screen.getByText(/miktar \(10\)/)).toBeInTheDocument();

    // Flanş eşleşmedi → belge satırından elle seç.
    const sel = screen.getByLabelText("Flanş için belge satırı seç") as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: "doc-5" } });
    await screen.findByText("3 / 3 kalem fiyatlandı");
    expect(screen.getByText("Elle")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "3 kalemin fiyatını uygula" }));
    const rows = onApply.mock.calls[0]![0] as { itemId: string; unitPrice: number }[];
    expect(rows.map((r) => [r.itemId, r.unitPrice])).toEqual([
      ["i1", 185],
      ["i2", 40],
      ["i3", 90],
    ]);
  });
});
