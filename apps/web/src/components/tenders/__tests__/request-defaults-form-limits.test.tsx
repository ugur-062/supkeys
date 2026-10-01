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
