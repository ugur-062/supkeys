// @vitest-environment jsdom
/**
 * Talep Şartları formu (arayüz testi webB-10):
 * - D-007: vade günü / peşin yüzdesi aralık dışıysa alan işaretlenir, Türkçe hata.
 * - D-046: kabul edilen birim tavanında seçilmemiş çipler pasif + ipucu.
 * - D-263: kaydetme yetkisi yoksa (`readOnly`) bütün kontroller pasif.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { REQUEST_ALLOWED_CURRENCIES_MAX, REQUEST_DEFAULTS_FALLBACK, type RequestDefaults } from "@rothern/shared";

vi.mock("@/hooks/use-company-addresses", () => ({ useAddresses: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => ({ company: { country: "TR" } }) }));

import { RequestDefaultsForm, requestDefaultsFieldErrors } from "../request-defaults-form";

function Harness({ init, readOnly, only }: { init?: Partial<RequestDefaults>; readOnly?: boolean; only?: Parameters<typeof RequestDefaultsForm>[0]["only"] }) {
  const [v, setV] = useState<RequestDefaults>({ ...REQUEST_DEFAULTS_FALLBACK, ...init });
  return <RequestDefaultsForm value={v} onChange={setV} readOnly={readOnly} only={only} />;
}

describe("RequestDefaultsForm — aralık denetimi (D-007)", () => {
  it("vade günü 400 → alan işaretli ve Türkçe hata; 30 → temiz", () => {
    render(<Harness init={{ paymentCategory: "DEFERRED", paymentDays: 30 }} only={["payment"]} />);
    const input = screen.getByLabelText(/Vade/);
    fireEvent.change(input, { target: { value: "400" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Vade günü 1 ile 365 arasında olmalı")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "30" } });
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("requestDefaultsFieldErrors yalnız görünen alanı denetler", () => {
    const base = { ...REQUEST_DEFAULTS_FALLBACK };
    expect(requestDefaultsFieldErrors({ ...base, paymentCategory: "DEFERRED", paymentDays: -5 })).toEqual({ paymentDays: true });
    expect(requestDefaultsFieldErrors({ ...base, paymentCategory: "ADVANCE", advancePercent: 101, paymentDays: null })).toEqual({ advancePercent: true });
    expect(requestDefaultsFieldErrors({ ...base, paymentCategory: "ADVANCE", advancePercent: 100, paymentDays: null })).toEqual({});
  });
});

/**
 * Arayüz testi kapanış NUM: `type="number"` Türkçe tarayıcıda "2,5" peşini
 * %25, "0,5" vadeyi 5 gün kaydediyordu; özel gün kutusu her tuşta kırpıyordu
 * ("0,5" → 15, "12,50" → 60). Artık yerel tam sayı; geçersiz giriş işaretli.
 */
describe("RequestDefaultsForm — yerel sayı girişi (NUM)", () => {
  function Spy({ init, only }: { init: Partial<RequestDefaults>; only: Parameters<typeof RequestDefaultsForm>[0]["only"] }) {
    const [v, setV] = useState<RequestDefaults>({ ...REQUEST_DEFAULTS_FALLBACK, ...init });
    return (
      <>
        <RequestDefaultsForm value={v} onChange={setV} only={only} />
        <output data-testid="state">{JSON.stringify({ a: v.advancePercent, p: v.paymentDays, c: v.closeDays })}</output>
      </>
    );
  }
  const state = () => JSON.parse(screen.getByTestId("state").textContent!) as { a: number | null; p: number | null; c: number };

  it("peşin '2,5' → %25 DEĞİL: alan işaretli, değer geçersiz (JSON null)", () => {
    render(<Spy init={{ paymentCategory: "ADVANCE", advancePercent: 100, paymentDays: null }} only={["payment"]} />);
    const input = screen.getByLabelText(/Peşin/);
    fireEvent.change(input, { target: { value: "2,5" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(state().a).toBeNull(); // NaN → JSON'da null; 25 değil
    expect(screen.getByText("Peşin yüzdesi 1 ile 100 arasında olmalı")).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe("2,5");
  });

  it("vade '0,5' → 5 gün DEĞİL; '1.500' → 1500 (aralık dışı), '45' → temiz", () => {
    render(<Spy init={{ paymentCategory: "DEFERRED", paymentDays: 30 }} only={["payment"]} />);
    const input = screen.getByLabelText(/Vade/);
    fireEvent.change(input, { target: { value: "0,5" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(state().p).toBeNull();
    fireEvent.change(input, { target: { value: "1.500" } });
    expect(state().p).toBe(1500);
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(input, { target: { value: "45" } });
    expect(state().p).toBe(45);
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("özel gün: '0,5' 15 / '12,50' 60 olmaz — kapanış değişmez, aralık mesajı görünür", () => {
    render(<Spy init={{ closeDays: 7 }} only={["close"]} />);
    const input = screen.getByLabelText("Özel gün sayısı");
    for (const typed of ["0,5", "12,50", "2.5", "1.500"]) {
      fireEvent.change(input, { target: { value: typed } });
      expect(state().c).toBe(7);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByRole("alert")).toHaveTextContent("1–60 gün arası tam sayı girin.");
    }
    // Geçerli değer odaktan çıkınca onaylanır (arayüz testi kalanlar NUM:NEW-7:
    // yazarken "1" / "12" önekleri kapanışa yazılmaz).
    fireEvent.change(input, { target: { value: "21" } });
    expect(state().c).toBe(7);
    fireEvent.blur(input);
    expect(state().c).toBe(21);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("özel gün: zaten seçili '7 gün' çipi geçersiz metni temizler (value değişmese de)", () => {
    render(<Spy init={{ closeDays: 7 }} only={["close"]} />);
    const input = screen.getByLabelText("Özel gün sayısı") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12,50" } });
    fireEvent.blur(input);
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "7 gün" }));
    expect(state().c).toBe(7);
    expect(input.value).toBe("7");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("RequestDefaultsForm — kabul edilen birim tavanı (D-046)", () => {
  it("tavanda seçilmemiş çipler pasif ve ipucu görünür; birini kaldırınca açılır", () => {
    render(<Harness init={{ primaryCurrency: "TRY", allowedCurrencies: ["TRY"] }} only={["currency"]} />);
    const group = screen.getByRole("group", { name: /Kabul edilen birimler/ });
    const chip = (c: string) => Array.from(group.querySelectorAll("button")).find((b) => b.textContent === c)!;
    for (const c of ["USD", "EUR", "GBP", "CHF", "JPY", "AED", "CNY"]) fireEvent.click(chip(c));
    expect(group.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(REQUEST_ALLOWED_CURRENCIES_MAX);
    expect(chip("RUB")).toBeDisabled();
    expect(screen.getByText(/En fazla 8 birim seçilebilir/)).toBeInTheDocument();
    fireEvent.click(chip("USD"));
    expect(chip("RUB")).not.toBeDisabled();
  });
});

describe("RequestDefaultsForm — salt okunur (D-263)", () => {
  it("readOnly iken düğme ve seçimler pasif", () => {
    render(<Harness readOnly init={{ paymentCategory: "DEFERRED", paymentDays: 30 }} />);
    expect(screen.getByRole("button", { name: /Tüm ülkeler/ })).toBeDisabled();
    expect(screen.getByLabelText(/Vade/)).toBeDisabled();
    for (const b of screen.getAllByRole("switch")) expect(b).toBeDisabled();
  });
});

describe("RequestDefaultsForm — iki örnek aynı sayfada (webB-10 yeniden doğrulama)", () => {
  it("id'ler örnek başına benzersiz; her etiket kendi girişini işaret eder", () => {
    const { container } = render(
      <>
        <Harness init={{ paymentCategory: "DEFERRED", paymentDays: 30 }} only={["payment"]} />
        <Harness init={{ paymentCategory: "DEFERRED", paymentDays: 45 }} only={["payment"]} />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("[id]")).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const inputs = screen.getAllByLabelText(/Vade/);
    expect(inputs).toHaveLength(2);
    expect(inputs.map((i) => (i as HTMLInputElement).value)).toEqual(["30", "45"]);
  });
});
