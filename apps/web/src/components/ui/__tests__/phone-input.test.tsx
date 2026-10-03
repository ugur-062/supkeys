// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) => sel({ company: null }),
}));

import { PhoneInput, defaultPhoneCountry } from "../phone-input";

let last = "";
function Harness({ initial = "", defaultCountry }: { initial?: string; defaultCountry?: string }) {
  const [v, setV] = useState(initial);
  return (
    <PhoneInput
      value={v}
      defaultCountry={defaultCountry}
      onChange={(next) => {
        last = next;
        setV(next);
      }}
    />
  );
}

// Erişilebilir adlar katalogdan (`web.shared.phoneInput.*`; testler TR katalogla koşar).
const numberBox = () => screen.getByLabelText("Telefon");
const countryBox = () => screen.getByLabelText("Ülke kodu") as HTMLSelectElement;

/**
 * Kayıt tüm ülkelere açık (2026-09-27): tam uluslararası numara yapıştırılınca
 * seçili kodun önüne EKLENMEZ, ülke ona geçer; ulusal önek "0" atılır; ortak
 * kodda (+1, +44) seçili ülke korunur, ABD yerine Kanada varsayılır.
 */
describe("PhoneInput — uluslararası numara", () => {
  it("TR seçiliyken '+44 7911 123456' yapıştırılır → GB, ulusal numara", () => {
    render(<Harness />);
    fireEvent.change(numberBox(), { target: { value: "+44 7911 123456" } });
    expect(last).toBe("+44 7911123456");
    expect(countryBox().value).toBe("GB");
    expect((numberBox() as HTMLInputElement).value).toBe("7911123456");
  });

  it("'00' önekiyle ve ulusal '0'la yapıştırma → ülke değişir, 0 atılır", () => {
    render(<Harness />);
    fireEvent.change(numberBox(), { target: { value: "0049 030 1234567" } });
    expect(last).toBe("+49 301234567");
    expect(countryBox().value).toBe("DE");
  });

  it("ulusal önek atılır: TR 0532 → +90 532", () => {
    render(<Harness />);
    fireEvent.change(numberBox(), { target: { value: "0532 123 45 67" } });
    expect(last).toBe("+90 5321234567");
  });

  it("İtalya'da baştaki 0 numaranın parçası, atılmaz", () => {
    render(<Harness />);
    fireEvent.change(numberBox(), { target: { value: "+39 06 1234 5678" } });
    expect(last).toBe("+39 0612345678");
    expect(countryBox().value).toBe("IT");
  });

  it("+1 numarası ABD'ye değil Kanada'ya düşer (ABD kayda kapalı)", () => {
    render(<Harness />);
    fireEvent.change(numberBox(), { target: { value: "+1 416 555 0100" } });
    expect(countryBox().value).toBe("CA");
  });

  it("ortak kodda seçili ülke korunur (Jersey +44)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(countryBox(), "JE");
    await user.type(numberBox(), "7797123456");
    expect(last).toBe("+44 7797123456");
    expect(countryBox().value).toBe("JE");
  });

  it("'+' ile tek tek yazılırken ülke kodu tamamlanınca ülke geçer", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(numberBox(), "+49");
    expect(countryBox().value).toBe("DE");
    await user.type(numberBox(), "301234567");
    expect(last).toBe("+49 301234567");
  });
});

/**
 * Ulusal önek ülkeye göre (2026-09-27): eski SSCB "8", Macaristan "06"; Latin
 * dışı rakamlar çevrilir; varsayılan ülke arayüz dilinden (İngilizcede yok).
 */
describe("PhoneInput — ülkeye göre ulusal önek ve varsayılan ülke", () => {
  it("Rusya: '8 916 123-45-67' → +7 9161234567 (8 son hanede düşer)", async () => {
    const user = userEvent.setup();
    render(<Harness defaultCountry="RU" />);
    expect(countryBox().value).toBe("RU");
    await user.type(numberBox(), "8 916 123-45-67");
    expect(last).toBe("+7 9161234567");
    expect(countryBox().value).toBe("RU");
  });

  it("Rusya seçiliyken '8 701…' → Kazakistan numarası", () => {
    render(<Harness defaultCountry="RU" />);
    fireEvent.change(numberBox(), { target: { value: "8 701 123 45 67" } });
    expect(last).toBe("+7 7011234567");
    expect(countryBox().value).toBe("KZ");
  });

  it("Macaristan: '06 30 123 4567' → +36 301234567", () => {
    render(<Harness defaultCountry="HU" />);
    fireEvent.change(numberBox(), { target: { value: "06 30 123 4567" } });
    expect(last).toBe("+36 301234567");
  });

  it("Arap-Hint rakamlar sessizce düşmez: '+٢٠ ١٠٠ ١٢٣ ٤٥٦٧' → Mısır", () => {
    render(<Harness />);
    fireEvent.change(numberBox(), { target: { value: "+٢٠ ١٠٠ ١٢٣ ٤٥٦٧" } });
    expect(last).toBe("+20 1001234567");
    expect(countryBox().value).toBe("EG");
  });

  it("varsayılan ülke: firma → çağıran → dil (tr → TR, ru → RU, en → seçim zorunlu)", () => {
    expect(defaultPhoneCountry({ locale: "ru" })).toBe("RU");
    expect(defaultPhoneCountry({ locale: "tr" })).toBe("TR");
    expect(defaultPhoneCountry({ locale: "en" })).toBeNull();
    expect(defaultPhoneCountry({ locale: "en", defaultCountry: "DE" })).toBe("DE");
    expect(defaultPhoneCountry({ locale: "ru", companyCountry: "AZ", defaultCountry: "DE" })).toBe("AZ");
    expect(defaultPhoneCountry({ locale: "en", companyCountry: "ZZ" })).toBeNull();
  });
});
