// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * Arayüz testi son tur (webA-1): İngilizce arayüzde varsayılan ülke YOK
 * (bilinçli, bkz. `defaultPhoneCountry`). Ülke seçilmeden yazılan numara
 * değeri boş bırakır; form "boş alan"ı "ülkesiz numara"dan ayırıp doğru
 * hatayı verebilsin diye bileşen `onCountryMissingChange` bildirir.
 *
 * `vitest.setup.ts` sahtesi dili `tr`ye sabitler; burada `en`.
 */
vi.mock("next-intl", async () => {
  const { createTranslator } = await import("use-intl/core");
  const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
  const MESSAGES = messagesFor("tr", WEB_NAMESPACES);
  return {
    useTranslations: (namespace?: string) =>
      createTranslator({
        locale: "tr",
        messages: MESSAGES,
        namespace: namespace as never,
        timeZone: "Europe/Istanbul",
        onError: () => {},
        getMessageFallback: ({ namespace: ns, key }) => (ns ? `${ns}.${key}` : key),
      }),
    useLocale: () => "en",
  };
});
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) => sel({ company: null }),
}));

import { PhoneInput } from "../phone-input";

const calls: boolean[] = [];
let last = "";
function Harness() {
  const [v, setV] = useState("");
  return (
    <PhoneInput
      value={v}
      onChange={(next) => {
        last = next;
        setV(next);
      }}
      onCountryMissingChange={(m) => calls.push(m)}
    />
  );
}

const numberBox = () => screen.getByLabelText("Telefon");
const countryBox = () => screen.getByLabelText("Ülke kodu") as HTMLSelectElement;

describe("PhoneInput — İngilizce, ülke seçilmeden numara", () => {
  it("ülkesiz ulusal numara: değer boş, 'ülke eksik' bildirilir; ülke seçilince numara birleşir ve bildirim düşer", () => {
    render(<Harness />);
    expect(countryBox().value).toBe("");
    fireEvent.change(numberBox(), { target: { value: "2025550143" } });
    expect(last).toBe("");
    expect(calls.at(-1)).toBe(true);

    fireEvent.change(countryBox(), { target: { value: "CA" } });
    expect(last).toBe("+1 2025550143");
    expect(calls.at(-1)).toBe(false);
  });

  it("'+kod' ile yazılan numara ülke eksik sayılmaz; alan silinince bildirim düşer", () => {
    calls.length = 0;
    render(<Harness />);
    fireEvent.change(numberBox(), { target: { value: "555" } });
    expect(calls.at(-1)).toBe(true);
    fireEvent.change(numberBox(), { target: { value: "" } });
    expect(calls.at(-1)).toBe(false);
    fireEvent.change(numberBox(), { target: { value: "+49 30 1234567" } });
    expect(calls.at(-1)).toBe(false);
    expect(countryBox().value).toBe("DE");
  });
});
