// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BidImportResult } from "@rothern/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

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
    base({ itemId: "i2", lineNo: 2, itemName: "Dirsek", unitPrice: 10, confidence: "exact", errors: ["Para birimi (EUR) bu satın alma talebinde kabul edilmiyor"] }),
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
    base({ itemId: "i2", lineNo: 2, itemName: "Dirsek", unitPrice: 40, confidence: "medium", source: "Dirsek benzeri", warnings: ["Belgedeki miktar (10) satın alma talebindekinden (40) farklı"] }),
    base({ itemId: "i3", lineNo: 3, itemName: "Flanş" }),
  ],
  unmatchedDocRows: [{ id: "doc-5", text: "Flanş DN50 galvaniz", unitPrice: 90, currency: null, deliveryTime: null }],
  notices: ["Belgedeki fiyatlar KDV DAHİL görünüyor — teklif fiyatları KDV hariç olmalı, kontrol edin"],
  pricesIncludeVat: true,
  docCurrency: "TRY",
  matchedCount: 2,
};

function pickFiles(names: string[], size?: number) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const files = names.map((n) => {
    const f = new File(["x"], n, { type: "application/octet-stream" });
    if (size != null) Object.defineProperty(f, "size", { value: size });
    return f;
  });
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
      <BidImportDialog open variant="excel" listingId="L1" currencyLabel="TRY" itemCurrencyAllowed onClose={() => {}} onApply={onApply} />,
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
      <BidImportDialog open variant="excel" listingId="L1" currencyLabel="TRY" itemCurrencyAllowed onClose={() => {}} onApply={onApply} />,
    );
    pickFiles(["teklif.xlsx"]);
    await screen.findByText("1 / 3 kalem fiyatlandı");
    fireEvent.click(screen.getByLabelText("Çelik boru uygula"));
    expect(screen.getByRole("button", { name: "0 kalemin fiyatını uygula" })).toBeDisabled();
  });
});

// Derin denetim 2026-09-29: şablon base64 JSON gövdesiyle gider (5 MB gövde
// sınırı) — istemci kapısı yoktu, ~3,75 MB üstü açıklamasız 413 alıyordu.
// Önizlemede miktar+birim ham yapıştırılıyordu ("1500 m").
describe("BidImportDialog — Excel şablonu: boyut kapısı ve miktar etiketi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.parse.mockResolvedValue(TEMPLATE_RESULT);
  });

  it("3,5 MB üstü .xlsx ve 1 MB üstü .csv yüklenmeden reddedilir", () => {
    render(
      <BidImportDialog open variant="excel" listingId="L1" currencyLabel="TRY" itemCurrencyAllowed onClose={() => {}} onApply={() => {}} />,
    );
    pickFiles(["teklif.xlsx"], 4 * 1024 * 1024);
    expect(h.parse).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenLastCalledWith("Dosya çok büyük (4.0 MB) — Excel için sınır 3.5 MB");
    pickFiles(["teklif.csv"], 2 * 1024 * 1024);
    expect(h.parse).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenLastCalledWith("Dosya çok büyük (2.0 MB) — CSV için sınır 1 MB");
  });

  it("sınırın altındaki dosya yüklenir; önizleme miktarı birim etiketiyle biçimler", async () => {
    h.parse.mockResolvedValue({
      ...TEMPLATE_RESULT,
      matches: [base({ itemId: "i1", itemName: "Çelik boru", itemQuantity: "1500", itemUnit: "m", unitPrice: 10, confidence: "exact" })],
    });
    render(
      <BidImportDialog open variant="excel" listingId="L1" currencyLabel="TRY" itemCurrencyAllowed onClose={() => {}} onApply={() => {}} />,
    );
    pickFiles(["teklif.xlsx"], 3 * 1024 * 1024);
    await waitFor(() => expect(h.parse).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("1.500 m")).toBeInTheDocument();
  });
});

describe("BidImportDialog — Belgeden Fiyatla (AI)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.ai.mockResolvedValue(AI_RESULT);
  });

  it("AI önizlemesi: KDV uyarısı, güven rozetleri, düşük güven uyarısı; eşleşmeyen kalem belge satırından ELLE seçilir ve uygulanır", async () => {
    const onApply = vi.fn();
    render(<BidImportDialog open variant="ai" listingId="L1" currencyLabel="TRY" itemCurrencyAllowed onClose={() => {}} onApply={onApply} />);
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

  it("elle seçilen satır: uyarısı gösterilir; kalem bazlı birim kapalıyken farklı birimli fiyat uygulanmaz (derin denetim MU-23)", async () => {
    h.ai.mockResolvedValue({
      ...AI_RESULT,
      unmatchedDocRows: [
        { id: "doc-5", text: "Flanş DN50 galvaniz", unitPrice: 185, currency: "USD", deliveryTime: null, warnings: [] },
        { id: "doc-6", text: "Flanş kaplamasız", unitPrice: 185, currency: null, deliveryTime: null, warnings: [], errors: ["Satır para birimi (GBP) kabul edilmiyor"] },
        { id: "doc-7", text: "Flanş toplamdan", unitPrice: 90, currency: null, deliveryTime: null, warnings: ["Birim fiyat toplam ÷ miktardan türetildi"] },
      ],
    });
    const onApply = vi.fn();
    render(
      <BidImportDialog open variant="ai" listingId="L1" currencyLabel="TRY" itemCurrencyAllowed={false} onClose={() => {}} onApply={onApply} />,
    );
    pickFiles(["fiyat-listesi.pdf"]);
    await screen.findByText("2 / 3 kalem fiyatlandı");
    const sel = screen.getByLabelText("Flanş için belge satırı seç") as HTMLSelectElement;

    // USD satır: form birimi yazamaz → 185 TRY sanılmasın, satır uygulanmaz.
    fireEvent.change(sel, { target: { value: "doc-5" } });
    expect(await screen.findByText(/USD; bu teklifte kalem bazında farklı para birimi kullanılamaz/)).toBeInTheDocument();
    expect(screen.getByText("2 / 3 kalem fiyatlandı")).toBeInTheDocument();
    expect(screen.getByLabelText("Flanş uygula")).toBeDisabled();

    // Kabul edilmeyen para birimi HATADIR (derin denetim MU-19): 185 GBP
    // teklif birimiyle (185 TRY) forma yazılmasın.
    fireEvent.change(sel, { target: { value: "doc-6" } });
    expect(await screen.findByText(/GBP\) kabul edilmiyor/)).toBeInTheDocument();
    expect(screen.getByText("2 / 3 kalem fiyatlandı")).toBeInTheDocument();
    expect(screen.getByLabelText("Flanş uygula")).toBeDisabled();

    // Sunucu uyarılı satır: uyarı elle seçimde görünür, kalemin eski uyarısı değil.
    fireEvent.change(sel, { target: { value: "doc-7" } });
    expect(await screen.findByText(/toplam ÷ miktardan/)).toBeInTheDocument();
    await screen.findByText("3 / 3 kalem fiyatlandı");
    fireEvent.click(screen.getByRole("button", { name: "3 kalemin fiyatını uygula" }));
    const rows = onApply.mock.calls[0]![0] as { itemId: string; unitPrice: number; currency: string | null }[];
    expect(rows.find((r) => r.itemId === "i3")).toMatchObject({ unitPrice: 90, currency: null });
  });

  it("teklif birimi talebin ana biriminden farklı: ana birimli (TRY) satır teklif birimi (USD) sayılmaz (derin denetim MU-23 gözden geçirme)", async () => {
    h.ai.mockResolvedValue({
      ...AI_RESULT,
      matches: [
        base({ itemId: "i1", lineNo: 1, itemName: "Çelik boru", unitPrice: 185, currency: "TRY", confidence: "exact", source: "Boru 185 TRY" }),
        base({ itemId: "i2", lineNo: 2, itemName: "Dirsek", unitPrice: 40, currency: "USD", confidence: "exact", source: "Dirsek 40 USD" }),
        base({ itemId: "i3", lineNo: 3, itemName: "Flanş", unitPrice: 9, confidence: "exact", source: "Flanş 9" }),
      ],
      unmatchedDocRows: [],
    });
    const onApply = vi.fn();
    render(
      <BidImportDialog open variant="ai" listingId="L1" currencyLabel="USD" itemCurrencyAllowed={false} onClose={() => {}} onApply={onApply} />,
    );
    pickFiles(["fiyat-listesi.pdf"]);
    // TRY satır kilitli; USD (= teklif birimi) ve birimsiz satır uygulanır.
    expect(await screen.findByText(/TRY; bu teklifte kalem bazında farklı para birimi kullanılamaz \(USD\)/)).toBeInTheDocument();
    expect(screen.getByText("185,00 TRY")).toBeInTheDocument();
    expect(screen.getByLabelText("Çelik boru uygula")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "2 kalemin fiyatını uygula" }));
    const rows = onApply.mock.calls[0]![0] as { itemId: string; unitPrice: number; currency: string | null }[];
    expect(rows).toEqual([
      { itemId: "i2", unitPrice: 40, currency: null, deliveryTime: null },
      { itemId: "i3", unitPrice: 9, currency: null, deliveryTime: null },
    ]);
  });

  it("kalem bazlı birim açık + teklif birimi USD: ana birimli (TRY) satır TRY kalem birimiyle uygulanır", async () => {
    h.ai.mockResolvedValue({
      ...AI_RESULT,
      matches: [
        base({ itemId: "i1", lineNo: 1, itemName: "Çelik boru", unitPrice: 185, currency: "TRY", confidence: "exact", source: "Boru 185 TRY" }),
        base({ itemId: "i2", lineNo: 2, itemName: "Dirsek", unitPrice: 40, currency: "USD", confidence: "exact", source: "Dirsek 40 USD" }),
        base({ itemId: "i3", lineNo: 3, itemName: "Flanş" }),
      ],
      unmatchedDocRows: [],
    });
    const onApply = vi.fn();
    render(<BidImportDialog open variant="ai" listingId="L1" currencyLabel="USD" itemCurrencyAllowed onClose={() => {}} onApply={onApply} />);
    pickFiles(["fiyat-listesi.pdf"]);
    fireEvent.click(await screen.findByRole("button", { name: "2 kalemin fiyatını uygula" }));
    const rows = onApply.mock.calls[0]![0] as { itemId: string; currency: string | null }[];
    expect(rows.map((r) => [r.itemId, r.currency])).toEqual([
      ["i1", "TRY"],
      ["i2", null],
    ]);
  });

  it("kalem bazlı birim açıkken farklı birimli elle seçim uygulanır (birimiyle)", async () => {
    h.ai.mockResolvedValue({
      ...AI_RESULT,
      unmatchedDocRows: [
        { id: "doc-5", text: "Flanş DN50 galvaniz", unitPrice: 185, currency: "USD", deliveryTime: null, warnings: [] },
      ],
    });
    const onApply = vi.fn();
    render(<BidImportDialog open variant="ai" listingId="L1" currencyLabel="TRY" itemCurrencyAllowed onClose={() => {}} onApply={onApply} />);
    pickFiles(["fiyat-listesi.pdf"]);
    await screen.findByText("2 / 3 kalem fiyatlandı");
    fireEvent.change(screen.getByLabelText("Flanş için belge satırı seç"), { target: { value: "doc-5" } });
    await screen.findByText("3 / 3 kalem fiyatlandı");
    expect(screen.getByText("185,00 USD")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3 kalemin fiyatını uygula" }));
    const rows = onApply.mock.calls[0]![0] as { itemId: string; currency: string | null }[];
    expect(rows.find((r) => r.itemId === "i3")).toMatchObject({ currency: "USD" });
  });
});
