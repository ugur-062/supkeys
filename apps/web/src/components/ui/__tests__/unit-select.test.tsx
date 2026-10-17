// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { UnitSelect } from "../unit-select";

/**
 * Derin denetim S086: "Listede yok…" serbest birim kutusu ilk harfte bilinen
 * bir birime ("t" → ton, "g" → gram, "л" → litre) kilitlenmemeli.
 */
let last: { unit: string; unitCode: string | null } = { unit: "", unitCode: null };

function Harness({ initial = { unit: "adet", unitCode: "PCE" as string | null } }) {
  const [v, setV] = useState(initial);
  last = v;
  return <UnitSelect value={v.unit} unitCode={v.unitCode} onChange={setV} />;
}

const select = () => screen.getByRole("combobox") as HTMLSelectElement;
const OTHER = "__other__";

describe("UnitSelect — Listede yok", () => {
  it("yazarken ilk harf bilinen birime kilitlenmez; kod verilmez", () => {
    render(<Harness />);
    fireEvent.change(select(), { target: { value: OTHER } });
    const box = screen.getByRole("textbox", { name: "Birim (listede yok)" });
    for (const text of ["t", "te", "teneke"]) fireEvent.change(box, { target: { value: text } });
    expect(screen.getByRole("textbox", { name: "Birim (listede yok)" })).toHaveValue("teneke");
    expect(select().value).toBe(OTHER);
    expect(last).toEqual({ unit: "teneke", unitCode: null });
    fireEvent.blur(box);
    expect(last).toEqual({ unit: "teneke", unitCode: null });
    expect(select().value).toBe(OTHER);
  });

  it("Kiril tek harf de kilitlemez (лист)", () => {
    render(<Harness />);
    fireEvent.change(select(), { target: { value: OTHER } });
    const box = screen.getByRole("textbox", { name: "Birim (listede yok)" });
    fireEvent.change(box, { target: { value: "л" } });
    expect(screen.getByRole("textbox", { name: "Birim (listede yok)" })).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "лист" } });
    expect(last).toEqual({ unit: "лист", unitCode: null });
  });

  it("bilinen birim TAM yazılıp alandan çıkılınca listeden seçilmiş gibi kodlanır", () => {
    render(<Harness />);
    fireEvent.change(select(), { target: { value: OTHER } });
    const box = screen.getByRole("textbox", { name: "Birim (listede yok)" });
    fireEvent.change(box, { target: { value: "ton" } });
    expect(last.unitCode).toBeNull();
    fireEvent.blur(box);
    expect(last).toEqual({ unit: "ton", unitCode: "TON" });
    expect(select().value).toBe("TON");
    expect(screen.queryByRole("textbox", { name: "Birim (listede yok)" })).toBeNull();
  });

  it("tanınmayan eski serbest metin listede yok modunda açılır; tanınan metin birimi seçer", () => {
    const { unmount } = render(<Harness initial={{ unit: "bobin", unitCode: null }} />);
    expect(select().value).toBe(OTHER);
    expect(screen.getByRole("textbox", { name: "Birim (listede yok)" })).toHaveValue("bobin");
    unmount();
    render(<Harness initial={{ unit: "kg", unitCode: null }} />);
    expect(select().value).not.toBe(OTHER);
  });
});

describe("UnitSelect — 'Diğer…' odak ve çıkış bildirimi (webB-03 yeniden doğrulama)", () => {
  it("kullanıcı 'Diğer…' seçince boş kutu odak alır; eski serbest kayıtta odak çalınmaz", () => {
    const { unmount } = render(<Harness />);
    fireEvent.change(select(), { target: { value: OTHER } });
    expect(screen.getByRole("textbox", { name: "Birim (listede yok)" })).toHaveFocus();
    unmount();
    render(<Harness initial={{ unit: "bobin", unitCode: null }} />);
    expect(screen.getByRole("textbox", { name: "Birim (listede yok)" })).not.toHaveFocus();
  });

  it("kutudan çıkınca onFreeTextBlur çağrılır", () => {
    const calls: Array<{ unit: string; unitCode: string | null }> = [];
    function BlurHarness() {
      const [v, setV] = useState<{ unit: string; unitCode: string | null }>({ unit: "", unitCode: null });
      last = v;
      return <UnitSelect value={v.unit} unitCode={v.unitCode} onChange={setV} onFreeTextBlur={() => calls.push(v)} />;
    }
    render(<BlurHarness />);
    const box = screen.getByRole("textbox", { name: "Birim (listede yok)" });
    fireEvent.blur(box);
    expect(calls).toHaveLength(1);
  });
});
