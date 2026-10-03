import { describe, expect, it } from "vitest";
import { isSealedListing } from "../listing-format";

// Arayüz testi webB-02 (T-16): rozet kayıtlı bayrağa değil formata bakar.
describe("isSealedListing", () => {
  it("RFQ bayraktan bağımsız kapalı zarftır", () => {
    expect(isSealedListing({ format: "RFQ", isSealedBid: false })).toBe(true);
    expect(isSealedListing({ format: "RFQ", isSealedBid: true })).toBe(true);
  });

  it("açık eksiltme bayrak true olsa da kapalı zarf değildir", () => {
    expect(isSealedListing({ format: "ENGLISH_AUCTION", isSealedBid: true })).toBe(false);
  });

  it("format yoksa kayıtlı bayrak kullanılır", () => {
    expect(isSealedListing({ format: null, isSealedBid: true })).toBe(true);
    expect(isSealedListing({ format: null, isSealedBid: false })).toBe(false);
  });
});
