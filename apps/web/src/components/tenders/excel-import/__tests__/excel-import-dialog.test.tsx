// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ItemImportResult } from "@rothern/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  parse: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@/hooks/use-listing-item-import", () => ({
  useDownloadItemTemplate: () => ({ mutateAsync: h.download, isPending: false }),
  useParseItemImport: () => ({ mutateAsync: h.parse, isPending: false }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { ExcelImportDialog } from "../excel-import-dialog";

const RESULT: ItemImportResult = {
  sheetName: "Kalemler",
  columns: ["name", "quantity", "unit", "materialCode"],
  rows: [
    {
      rowNumber: 2,
      item: {
        name: "Çelik boru",
        description: null,
        quantity: 120,
        unit: "m",
        materialCode: "BRU-200",
        requiredByDate: null,
        targetUnitPrice: null,
      },
      errors: [],
    },
    {
      rowNumber: 3,
      item: {
        name: null,
        description: null,
        quantity: 5,
        unit: "adet",
        materialCode: null,
        requiredByDate: null,
        targetUnitPrice: null,
      },
      errors: ["Kalem Adı boş"],
    },
  ],
  validCount: 1,
  invalidCount: 1,
  truncated: 0,
};

function pickFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["x"], "kalemler.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ExcelImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.parse.mockResolvedValue(RESULT);
    h.download.mockResolvedValue({ filename: "x.xlsx" });
  });

  it("şablon indirme butonu hook'u çağırır (AI yok)", () => {
    render(
      <ExcelImportDialog open onClose={() => {}} existingCount={1} onApply={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Şablonu indir" }));
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/AI kullanılmaz/)).toBeInTheDocument();
  });

  it("dosya yüklenince önizleme: hatalı satır aktarılmaz, geçerli satır sayısı butonda; Aktar yalnız geçerlileri verir", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <ExcelImportDialog open onClose={onClose} existingCount={1} onApply={onApply} />,
    );
    pickFile();
    await waitFor(() => expect(h.parse).toHaveBeenCalled());
    expect(h.parse.mock.calls[0]![0]).toHaveProperty("file");

    await screen.findByText("1 satır hazır");
    expect(screen.getByText(/1 hatalı satır/)).toBeInTheDocument();
    expect(screen.getByText("Kalem Adı boş")).toBeInTheDocument();
    expect(screen.getByText("Çelik boru")).toBeInTheDocument();

    // Mod: değiştir
    fireEvent.click(screen.getByLabelText(/Mevcut 1 kalemi değiştir/));
    fireEvent.click(screen.getByRole("button", { name: "1 kalemi aktar" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const [items, mode] = onApply.mock.calls[0]!;
    expect(mode).toBe("replace");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Çelik boru", quantity: 120, unit: "m" });
    expect(onClose).toHaveBeenCalled();
  });

  it("hiç geçerli satır yoksa Aktar devre dışı", async () => {
    h.parse.mockResolvedValue({ ...RESULT, rows: [RESULT.rows[1]!], validCount: 0, invalidCount: 1 });
    render(
      <ExcelImportDialog open onClose={() => {}} existingCount={0} onApply={() => {}} />,
    );
    pickFile();
    await screen.findByText(/Aktarılabilir satır yok/);
    expect(screen.getByRole("button", { name: "0 kalemi aktar" })).toBeDisabled();
  });
});
