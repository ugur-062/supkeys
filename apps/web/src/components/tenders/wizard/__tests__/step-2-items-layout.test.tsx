// @vitest-environment jsdom
/**
 * Mobil denetim smoke-buyer#new1 — kalem satırı FORM SÜTUNUNUN genişliğine
 * göre dizilir, viewport'a göre değil. Masaüstü 1024–1200 px'te kenar menü +
 * sağ ray formu ~300–470 px'e indiriyordu; viewport `md:` kırılımı satırı yine
 * 12'lik tek sıraya dizip Miktar kutusunu 24 px'e indiriyor, "Miktar" ve
 * "Birim" etiketlerini üst üste bindiriyordu. jsdom düzen hesaplamaz: sözleşme
 * sınıflar üzerinden — kap `@container`, satırda hiçbir viewport kırılımı yok.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
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

function Harness() {
  const f = useForm<TenderFormData>({
    resolver: zodResolver(schema),
    defaultValues: { ...DEFAULT_FORM_VALUES, items: [{ ...DEFAULT_FORM_VALUES.items[0]!, name: "Çelik boru" }] },
    mode: "onTouched",
  });
  return (
    <FormProvider {...f}>
      <Step2Items />
    </FormProvider>
  );
}

const cls = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
/** Alanın `Field` kabı (etiketin doğrudan ebeveyni). */
const fieldOf = (id: string) => document.querySelector(`label[for="${id}"]`)!.parentElement!;

describe("Step2Items — kalem satırı sütun genişliğine göre dizilir (smoke-buyer#new1)", () => {
  it("kalem listesi kap sorgusu kabıdır; satır düzeninde viewport kırılımı (sm:/md:/lg:) yok", () => {
    render(<Harness />);
    const name = document.getElementById("items.0.name")!;
    const container = name.closest(".\\@container");
    expect(container).not.toBeNull();
    // Satır kökü kap sorgusunun İÇİNDE (kap kendisi değil — sorgu atalara bakar).
    const row = name.closest(".rounded-xl")!;
    expect(container!.contains(row)).toBe(true);
    expect(row).not.toBe(container);
    // Satırın kendi düzen kapları: kök, üst ızgara + çocukları (rozet, alan
    // ızgarası, sil), alan kapları, "Detaylar" ve ızgarası, alt düğme şeridi.
    const outer = row.firstElementChild!;
    const fields = fieldOf("items.0.name").parentElement!;
    const details = row.querySelector("details")!;
    const layout = [
      row,
      ...row.children,
      ...outer.children,
      ...fields.children,
      details,
      ...details.querySelectorAll(":scope > div, :scope > div > div"),
    ];
    for (const el of layout) {
      // Denetimlerin kendi (Catalyst) yazı boyu / dolgu kırılımları kapsam dışı.
      for (const c of cls(el)) expect(c).not.toMatch(/^(max-)?(sm|md|lg|xl):(grid-cols|col-|row-|ml-|pl-|p-|self-)/);
    }
  });

  it("dar kapta iki sütun; ≥32rem rozet · alanlar · sil tek satır (ad tam genişlik); ≥40rem dört alan tek satır, miktar / birim en az 6.5rem", () => {
    render(<Harness />);
    const grid = fieldOf("items.0.name").parentElement!;
    expect(cls(grid)).toEqual(
      expect.arrayContaining([
        "grid-cols-2",
        "col-span-3",
        "row-start-2",
        "@lg:col-span-1",
        "@lg:col-start-2",
        "@lg:row-start-1",
        "@lg:grid-cols-3",
        "@[40rem]:grid-cols-[minmax(0,5fr)_minmax(6.5rem,2fr)_minmax(6.5rem,2fr)_minmax(0,3fr)]",
      ]),
    );
    expect(cls(fieldOf("items.0.name"))).toEqual(expect.arrayContaining(["col-span-2", "@lg:col-span-3", "@[40rem]:col-span-1"]));
    expect(cls(fieldOf("items.0.materialCode"))).toEqual(expect.arrayContaining(["col-span-2", "@lg:col-span-1"]));
    // Miktar ve birim yalnız tek hücre: 12'lik ızgaradaki `col-span-2` (81 px) yok.
    for (const id of ["items.0.quantity", "items.0.unit"]) {
      expect(cls(fieldOf(id)).some((c) => /col-span/.test(c))).toBe(false);
    }
    // Alan sırası (sekme sırası) değişmedi: ad → miktar → birim → stok kodu → sil.
    const order = [...grid.querySelectorAll("input, select")].map((e) => e.id).filter((id) => id.startsWith("items.0."));
    expect(order.slice(0, 4)).toEqual(["items.0.name", "items.0.quantity", "items.0.unit", "items.0.materialCode"]);
    const remove = screen.getByRole("button", { name: "Kalemi sil" });
    expect(grid.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
