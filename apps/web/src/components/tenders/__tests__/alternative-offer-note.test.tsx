// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlternativeOfferNote } from "../alternative-offer-note";

describe("AlternativeOfferNote (derin denetim Y-16)", () => {
  it("muadil değilse hiçbir şey çizmez", () => {
    const { container } = render(
      <AlternativeOfferNote bidItem={{ isAlternative: false, offeredBrand: "FAG" }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("tam görünüm: rozet + teklif edilen + istenen", () => {
    render(
      <AlternativeOfferNote
        bidItem={{ isAlternative: true, offeredBrand: "FAG", offeredMpn: " 6204-C " }}
        item={{ brand: "SKF", mpn: "6204-2RS" }}
      />,
    );
    expect(screen.getByText("Muadil")).toBeInTheDocument();
    expect(screen.getByText("Teklif edilen: FAG · 6204-C")).toBeInTheDocument();
    expect(screen.getByText("İstenen: SKF · 6204-2RS")).toBeInTheDocument();
  });

  it("karşılaştırma hücresi (compact): istenen satırı yok, teklif edilen title'da", () => {
    render(
      <AlternativeOfferNote
        bidItem={{ isAlternative: true, offeredBrand: "FAG", offeredMpn: null }}
        item={{ brand: "SKF" }}
        compact
      />,
    );
    expect(screen.getByText("Muadil")).toBeInTheDocument();
    expect(screen.getByTitle("Teklif edilen: FAG")).toBeInTheDocument();
    expect(screen.queryByText(/İstenen/)).toBeNull();
  });
});
