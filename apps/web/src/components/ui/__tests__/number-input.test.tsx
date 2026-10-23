// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

let currentLocale = "tr";
vi.mock("next-intl", () => ({ useLocale: () => currentLocale }));

import { INVALID_NUMBER_RAW } from "../money-input";
import { NumberInput, NumberInputNumber } from "../number-input";

/**
 * Arayüz testi kapanış NUM (2026-10-03): `type="number"` Türkçe tarayıcıda
 * virgülü yutup noktayı ondalık okuyordu ("0,5" → 5, "2,5" → 25, "1.500" →
 * 1,5). NumberInput metni arayüz diliyle okur; geçersizi işaretler.
 */
let lastRaw = "";
let lastNum: number | null = null;
function RawHarness({ maxDecimals }: { maxDecimals?: number }) {
  const [v, setV] = useState("");
  return (
    <NumberInput
      aria-label="Sayı"
      value={v}
      maxDecimals={maxDecimals}
      onChange={(r) => {
        lastRaw = r;
        setV(r);
      }}
    />
  );
}
function NumHarness({ initial = 30 }: { initial?: number | null }) {
  const [v, setV] = useState<number | null>(initial);
  return (
    <>
      <NumberInputNumber
        aria-label="Gün"
        value={v}
        onChange={(n) => {
          lastNum = n;
          setV(n);
        }}
      />
      <button type="button" onClick={() => setV(7)}>
        Dışarıdan
      </button>
    </>
  );
}
const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

afterEach(() => {
  currentLocale = "tr";
  lastRaw = "";
  lastNum = null;
});

describe("NumberInput — tam sayı (varsayılan)", () => {
  it("TR '0,5' geçersiz, metin aynen durur ve kırmızı; blur'da silinmez", () => {
    render(<RawHarness />);
    fireEvent.change(box("Sayı"), { target: { value: "0,5" } });
    expect(lastRaw).toBe(INVALID_NUMBER_RAW);
    expect(box("Sayı").value).toBe("0,5");
    expect(box("Sayı")).toHaveAttribute("aria-invalid", "true");
    fireEvent.blur(box("Sayı"));
    expect(box("Sayı").value).toBe("0,5");
  });

  it("TR '1.500' 1500 ve odaktan çıkınca dilin biçimiyle; EN '1,500' 1500", () => {
    render(<RawHarness />);
    fireEvent.change(box("Sayı"), { target: { value: "1500" } });
    fireEvent.blur(box("Sayı"));
    expect(lastRaw).toBe("1500");
    expect(box("Sayı").value).toBe("1.500");
    fireEvent.change(box("Sayı"), { target: { value: "1.500" } });
    expect(lastRaw).toBe("1500");
  });

  it("EN arayüzü: '1,500' 1500, '12.50' geçersiz", () => {
    currentLocale = "en";
    render(<RawHarness />);
    fireEvent.change(box("Sayı"), { target: { value: "1,500" } });
    expect(lastRaw).toBe("1500");
    fireEvent.change(box("Sayı"), { target: { value: "12.50" } });
    expect(lastRaw).toBe(INVALID_NUMBER_RAW);
  });
});

describe("NumberInput — ondalıklı", () => {
  it("TR '2,5' 2.5 (25 DEĞİL), '12,50' 12.5", () => {
    render(<RawHarness maxDecimals={4} />);
    fireEvent.change(box("Sayı"), { target: { value: "2,5" } });
    expect(lastRaw).toBe("2.5");
    fireEvent.change(box("Sayı"), { target: { value: "12,50" } });
    expect(lastRaw).toBe("12.5");
    fireEvent.blur(box("Sayı"));
    expect(box("Sayı").value).toBe("12,5");
  });
});

describe("NumberInputNumber", () => {
  it("geçersiz giriş NaN bildirir; boş null; dışarıdan değer kutuyu tazeler", () => {
    render(<NumHarness />);
    fireEvent.change(box("Gün"), { target: { value: "0,5" } });
    expect(lastNum).toBeNaN();
    expect(box("Gün").value).toBe("0,5");
    fireEvent.change(box("Gün"), { target: { value: "" } });
    expect(lastNum).toBeNull();
    fireEvent.click(screen.getByText("Dışarıdan"));
    expect(box("Gün").value).toBe("7");
  });

  it("ara durum ('12,') yazım sırasında kaybolmaz", () => {
    render(<NumHarness initial={null} />);
    fireEvent.change(box("Gün"), { target: { value: "12," } });
    expect(lastNum).toBe(12);
    expect(box("Gün").value).toBe("12,");
  });
});
