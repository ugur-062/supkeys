// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CountryNotEligibleCard, countryGateFrom } from "../country-not-eligible-card";

/**
 * ÜLKE KAPISI (2026-09-27) — API 403 `COUNTRY_NOT_ELIGIBLE` + `targetCountries`;
 * panel "bulunamadı" yerine kuralı (hangi ülkeler, davetle aşılır) gösterir.
 */
describe("countryGateFrom", () => {
  it("yalnız 403 + COUNTRY_NOT_ELIGIBLE tanınır; hedef ülkeler dizgi olarak süzülür", () => {
    expect(
      countryGateFrom({ response: { status: 403, data: { code: "COUNTRY_NOT_ELIGIBLE", targetCountries: ["TR", 5, "AZ"] } } }),
    ).toEqual({ targetCountries: ["TR", "AZ"] });
    expect(countryGateFrom({ response: { status: 403, data: { code: "COUNTRY_NOT_ELIGIBLE" } } })).toEqual({
      targetCountries: [],
    });
    expect(countryGateFrom({ response: { status: 403, data: { code: "TIER_REQUIRED" } } })).toBeNull();
    expect(countryGateFrom({ response: { status: 404, data: { code: "COUNTRY_NOT_ELIGIBLE" } } })).toBeNull();
    expect(countryGateFrom(null)).toBeNull();
  });
});

describe("CountryNotEligibleCard", () => {
  it("ülkeleri okuyucunun dilinde sayar, davet yolunu söyler, Açık Taleplere döner", () => {
    render(<CountryNotEligibleCard targetCountries={["TR", "AZ"]} />);
    expect(screen.getByRole("heading", { name: "Bu talep firmanızın ülkesine açık değil" })).toBeInTheDocument();
    expect(screen.getByText(/Türkiye ve Azerbaycan merkezli tedarikçilere/)).toBeInTheDocument();
    expect(screen.getByText(/davet ederse teklif verebilirsiniz/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Açık taleplere dön" })).toHaveAttribute("href", "/company/satis");
  });

  it("liste gelmezse genel açıklama", () => {
    render(<CountryNotEligibleCard targetCountries={[]} />);
    expect(screen.getByText("Alıcı bu talebi yalnız belirli ülkelerdeki tedarikçilere açtı.")).toBeInTheDocument();
  });
});
