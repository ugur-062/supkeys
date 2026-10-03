// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ListingEligibilityNote } from "../listing-eligibility-note";

/**
 * ÜLKE UYGUNLUK NOTU (2026-09-27) — yalnız belirli ülkelere açık talebin
 * herkese açık sayfası, kayıt çağrısından ÖNCE kimin teklif verebileceğini
 * söyler (Alman tedarikçi [TR] talebine kaydolup panelde "bulunamadı"
 * alıyordu).
 */
describe("ListingEligibilityNote", () => {
  it("hedef ülkeler okuyucunun dilinde, kısaltmadan listelenir", () => {
    render(<ListingEligibilityNote targetCountries={["TR", "DE", "AZ"]} />);
    const note = screen.getByTestId("listing-eligibility-note");
    expect(note).toHaveTextContent("Türkiye");
    expect(note).toHaveTextContent("Almanya");
    expect(note).toHaveTextContent("Azerbaycan");
    expect(note).toHaveTextContent(/teklif verebilir/);
  });

  it("tüm ülkelere açık talepte (boş liste) çizilmez", () => {
    const { container } = render(<ListingEligibilityNote targetCountries={[]} />);
    expect(container).toBeEmptyDOMElement();
    const { container: c2 } = render(<ListingEligibilityNote targetCountries={undefined} />);
    expect(c2).toBeEmptyDOMElement();
  });
});
