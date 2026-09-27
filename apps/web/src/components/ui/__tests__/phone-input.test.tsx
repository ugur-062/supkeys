// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) => sel({ company: null }),
}));

import { PhoneInput } from "../phone-input";

let last = "";
function Harness({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <PhoneInput
      value={v}
      onChange={(next) => {
        last = next;
        setV(next);
      }}
    />
  );
}

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
