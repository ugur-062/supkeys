// @vitest-environment jsdom
/**
 * Derin denetim Y-16 (S085) — "Yeni Kalem Ekle", Excel ve katalogdan gelen
 * kalemlerde `alternativeAllowed` yazılmıyordu. Katlanır Detaylar paneli
 * kapalıyken de checkbox DOM'da olduğundan RHF tanımsız değeri işaretsiz
 * kutudan `false` okuyordu → 2. ve sonraki kalemler kullanıcı fark etmeden
 * "yalnız belirtilen marka" moduna geçiyor, tedarikçi muadil öneremiyordu.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FORM_VALUES, type TenderFormData } from "@/lib/tenders/form-schema";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/components/tenders/excel-import/excel-import-dialog", () => ({
  ExcelImportDialog: ({
    onApply,
  }: {
    onApply: (items: unknown[], mode: "append" | "replace") => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onApply(
          [
            {
              name: "Excel Kalemi",
              description: null,
              quantity: 3,
              unit: "adet",
              unitCode: "PCE",
              materialCode: null,
              requiredByDate: null,
              targetUnitPrice: null,
            },
          ],
          "append",
        )
      }
    >
      excel-apply
    </button>
  ),
}));
vi.mock("@/components/tenders/wizard/catalog-picker-dialog", () => ({
  CatalogPickerDialog: () => null,
}));
vi.mock("../item-detail-modal", () => ({ ItemDetailModal: () => null }));
vi.mock("../item-question-modal", () => ({ ItemQuestionModal: () => null }));

import { Step2Items } from "../step-2-items";

let form: UseFormReturn<TenderFormData> | null = null;

function Harness() {
  const f = useForm<TenderFormData>({
    defaultValues: {
      ...DEFAULT_FORM_VALUES,
      items: [{ ...DEFAULT_FORM_VALUES.items[0]!, name: "İlk Kalem" }],
    },
  });
  form = f;
  return (
    <FormProvider {...f}>
      <Step2Items />
    </FormProvider>
  );
}

describe("Step2Items — yeni kalemlerde muadil varsayılanı açık (Y-16)", () => {
  it("'Yeni Kalem Ekle' ile eklenen kalem alternativeAllowed=true taşır", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Yeni Kalem Ekle/ }));
    await act(async () => {});
    const items = form!.getValues("items");
    expect(items).toHaveLength(2);
    expect(items[1]!.alternativeAllowed).toBe(true);
  });

  it("Excel/katalog içe aktarılan kalemler alternativeAllowed=true taşır", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "excel-apply" }));
    await act(async () => {});
    const items = form!.getValues("items");
    const imported = items.find((it) => it.name === "Excel Kalemi");
    expect(imported?.alternativeAllowed).toBe(true);
  });
});
