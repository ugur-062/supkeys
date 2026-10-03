// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AttributeFields } from "../attribute-fields";
import type { AttributeDef } from "@/hooks/use-company-items";

/**
 * Nitelik seçenekleri okuyucunun dilinde (derin denetim MU-25): API EN/RU'da
 * `optionLabels` döndürür; METİN etiket, DEĞER kanonik Türkçe kalır.
 */
const base = { unit: null, isRequired: false, definedAt: "39" } as const;
const defs: AttributeDef[] = [
  {
    ...base,
    key: "malzeme",
    nameTr: "Material",
    type: "SINGLE_SELECT",
    options: ["Paslanmaz çelik", "Galvaniz"],
    optionLabels: { "Paslanmaz çelik": "Stainless steel", Galvaniz: "Galvanized" },
  },
  {
    ...base,
    key: "kaplama",
    nameTr: "Coating",
    type: "MULTI_SELECT",
    options: ["Boya", "Toz boya"],
    optionLabels: { Boya: "Paint", "Toz boya": "Powder coat" },
  },
];

describe("AttributeFields — seçenek etiketleri", () => {
  it("tek/çoklu seçimde etiket basılır, kaydedilen değer kanonik kalır", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AttributeFields defs={defs} values={{}} onChange={onChange} />);

    expect(screen.getByRole("option", { name: "Stainless steel" })).toHaveValue("Paslanmaz çelik");
    expect(screen.queryByRole("option", { name: "Paslanmaz çelik" })).toBeNull();

    await user.selectOptions(screen.getByLabelText("Material"), "Stainless steel");
    expect(onChange).toHaveBeenLastCalledWith({ malzeme: "Paslanmaz çelik" });

    await user.click(screen.getByRole("button", { name: "Powder coat" }));
    expect(onChange).toHaveBeenLastCalledWith({ kaplama: ["Toz boya"] });
  });

  it("etiket yoksa (tr) kanonik değer basılır", () => {
    const trDefs = defs.map(({ optionLabels: _o, ...d }) => d as AttributeDef);
    render(<AttributeFields defs={trDefs} values={{}} onChange={() => undefined} />);
    expect(screen.getByRole("option", { name: "Galvaniz" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toz boya" })).toBeInTheDocument();
  });
});

/**
 * Arayüz testi kapanış NUM: sayısal nitelik `type="number"` idi; Türkçe
 * tarayıcıda "2,5" mm 25 olarak kaydediliyordu.
 */
describe("AttributeFields — sayısal nitelik yerel ondalık (NUM)", () => {
  const numDef: AttributeDef[] = [{ ...base, key: "kalinlik", nameTr: "Kalınlık", unit: "mm", type: "NUMBER", options: [] }];

  it("TR '2,5' kanonik '2.5' kaydedilir (25 DEĞİL)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AttributeFields defs={numDef} values={{}} onChange={onChange} />);
    await user.type(screen.getByLabelText(/Kalınlık/), "2,5");
    expect(onChange).toHaveBeenLastCalledWith({ kalinlik: "2.5" });
  });

  it("geçersiz giriş alan hatası verir ve geçersiz ham değer taşır", () => {
    render(<AttributeFields defs={numDef} values={{ kalinlik: "NaN" }} onChange={vi.fn()} />);
    expect(screen.getByText("Geçerli bir sayı girin (ör. 2,5).")).toBeInTheDocument();
    expect(screen.getByLabelText(/Kalınlık/)).toHaveAttribute("aria-invalid", "true");
  });
});
