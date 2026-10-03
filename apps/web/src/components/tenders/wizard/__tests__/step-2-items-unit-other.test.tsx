// @vitest-environment jsdom
/**
 * Arayüz testi webB-03 (yeniden doğrulama) — birim seçicide "Diğer…" seçilir
 * seçilmez boş serbest kutuya "Birim zorunlu" basılıyor, kalem kartı
 * kırmızıya dönüyordu. Beklenen: kutu odak alır, hata yalnız alandan boş
 * çıkılınca (ya da kayıtta) görünür.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createTranslator } from "use-intl/core";
import { WEB_NAMESPACES, messagesFor } from "@rothern/i18n/messages";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FORM_VALUES, makeTenderFormSchema, type TenderFormData } from "@/lib/tenders/form-schema";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/components/tenders/excel-import/excel-import-dialog", () => ({ ExcelImportDialog: () => null }));
vi.mock("@/components/tenders/wizard/catalog-picker-dialog", () => ({ CatalogPickerDialog: () => null }));
vi.mock("../item-detail-modal", () => ({ ItemDetailModal: () => null }));
vi.mock("../item-question-modal", () => ({ ItemQuestionModal: () => null }));

import { Step2Items } from "../step-2-items";

const tTr = createTranslator({ locale: "tr", messages: messagesFor("tr", WEB_NAMESPACES) as never }) as unknown as (
  key: string,
  values?: Record<string, string | number>,
) => string;
const schema = makeTenderFormSchema((key, values) => tTr(`web.panel.requests.${key}`, values));
const REQUIRED = tTr("web.panel.requests.formSchema.unitRequired");

function Harness() {
  // quick-request.tsx ile aynı kurulum: zod resolver + onTouched.
  const f = useForm<TenderFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...DEFAULT_FORM_VALUES,
      items: [{ ...DEFAULT_FORM_VALUES.items[0]!, name: "RV bakır bobin tel" }],
    },
    mode: "onTouched",
  });
  return (
    <FormProvider {...f}>
      <Step2Items />
    </FormProvider>
  );
}

const unitSelect = () => document.getElementById("items.0.unit") as HTMLSelectElement;
const freeBox = () => screen.getByRole("textbox", { name: "Birim (listede yok)" });

describe("Step2Items — 'Diğer…' birimi seçilince erken hata yok", () => {
  it("seçimde hata basmaz, kutu odak alır; boş çıkınca hata, yazınca kalkar", async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.change(unitSelect(), { target: { value: "__other__" } });
    });
    expect(freeBox()).toHaveFocus();
    expect(screen.queryByText(REQUIRED)).toBeNull();
    expect(freeBox()).not.toHaveAttribute("aria-invalid");

    await act(async () => {
      fireEvent.blur(freeBox());
    });
    expect(await screen.findByText(REQUIRED)).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(freeBox(), { target: { value: "bobin" } });
    });
    expect(screen.queryByText(REQUIRED)).toBeNull();
  });
});
