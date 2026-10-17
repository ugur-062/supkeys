// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) => sel({ company: null }),
}));

import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
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

/**
 * Firefox bayrak ezilmesi (canlı öncesi sağlamlaştırma H3): ülke seçici
 * sarmalayıcısı küçülebilir esnek öğeydi; Firefox onu 16 px kırpıyor, 16×12
 * bayrak 8×12 çiziliyordu. jsdom yerleşim hesaplamaz → sınıf sözleşmesi
 * doğrulanır: seçici küçülmez, dar kapta numara kutusu daralır.
 */
describe("PhoneInput — ülke seçici küçülmez (Firefox bayrak)", () => {
  it("seçici sarmalayıcısı flex-none, numara kutusu min-w-0 flex-1", () => {
    render(<Harness initial="+90 5321234567" />);
    const wrap = screen.getByTestId("phone-country");
    expect(wrap.classList.contains("flex-none")).toBe(true);
    expect(wrap.contains(countryBox())).toBe(true);
    // Bayrağı taşıyan iç kutu da küçülmez.
    expect(wrap.firstElementChild?.classList.contains("flex-none")).toBe(true);
    const cls = numberBox().classList;
    expect(cls.contains("min-w-0")).toBe(true);
    expect(cls.contains("flex-1")).toBe(true);
  });

  it("ülke seçilmemişken (küre simgesi) de seçici küçülmez", () => {
    render(<Harness defaultCountry="" />);
    expect(screen.getByTestId("phone-country").classList.contains("flex-none")).toBe(true);
  });
});

/**
 * Arayüz testi 2026-10 code-auth-11: numara kutusu Catalyst `<Field>`e bağlı —
 * görünen etikete tıklamak kutuyu odaklar, hata `aria-invalid` +
 * `aria-describedby` ile duyurulur (eskiden yalnız çerçeve kızarıyordu).
 */
describe("PhoneInput — Field etiketi ve hata bağı", () => {
  function InField({ invalid = false, onBlur }: { invalid?: boolean; onBlur?: () => void }) {
    const [v, setV] = useState("");
    return (
      <Field>
        <Label>Cep telefonu</Label>
        <PhoneInput value={v} onChange={setV} invalid={invalid} onBlur={onBlur} />
        {invalid ? <ErrorMessage>Geçerli bir numara girin.</ErrorMessage> : null}
      </Field>
    );
  }

  it("görünen etiket numara kutusunun adıdır; etikete tıklamak kutuyu odaklar", async () => {
    const user = userEvent.setup();
    render(<InField />);
    const box = screen.getByLabelText("Cep telefonu");
    expect(box).toHaveAttribute("type", "tel");
    await user.click(screen.getByText("Cep telefonu"));
    expect(box).toHaveFocus();
    // Ülke seçici kendi adını korur.
    expect(screen.getByLabelText("Ülke kodu").tagName).toBe("SELECT");
  });

  it("geçersizken aria-invalid olur ve hata iletisi kutuya bağlanır; geçerliyken ikisi de yok", () => {
    const { rerender } = render(<InField invalid />);
    const box = screen.getByLabelText("Cep telefonu");
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("Geçerli bir numara girin.");
    rerender(<InField />);
    expect(box).not.toHaveAttribute("aria-invalid");
    expect(box).not.toHaveAttribute("aria-describedby");
  });

  it("kök Field'in doğrudan çocuğu: etiketin ardında data-slot=control, hatadan önce de o", () => {
    render(<InField invalid />);
    expect(screen.getByText("Cep telefonu").nextElementSibling).toHaveAttribute("data-slot", "control");
    expect(screen.getByText("Geçerli bir numara girin.").previousElementSibling).toHaveAttribute("data-slot", "control");
  });

  it("onBlur yalnız odak denetimin TAMAMINDAN çıkınca çalışır (seçici ↔ numara geçişi sayılmaz)", async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    render(
      <>
        <InField onBlur={onBlur} />
        <button type="button">dışarı</button>
      </>,
    );
    await user.click(screen.getByLabelText("Cep telefonu"));
    await user.click(screen.getByLabelText("Ülke kodu"));
    expect(onBlur).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "dışarı" }));
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("Field dışında aria-label erişilebilir addır (bağımsız kullanım bozulmaz)", () => {
    render(<PhoneInput value="" onChange={() => {}} ariaLabel="İrtibat telefonu" />);
    expect(screen.getByLabelText("İrtibat telefonu")).toHaveAttribute("type", "tel");
  });

  it("küçük simgeler ve yer tutucu zinc-400 değil (beyazda 2,6:1)", () => {
    const { container } = render(<Harness />);
    expect(container.innerHTML).not.toContain("text-zinc-400");
    expect(numberBox().className).toContain("placeholder:text-zinc-500");
  });
});
