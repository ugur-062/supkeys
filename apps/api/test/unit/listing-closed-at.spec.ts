/**
 * S6 — "kapanış anı DAHİL kapalı" tek-kaynak (isListingClosedAt).
 * Sınır dahil-edici: tam closesAt anında KAPALI (placeBid/buyNow reddi + cron
 * `lte` aynı yönde). Null closesAt = süresiz açık.
 */
import { isListingClosedAt } from "../../src/common/company/listing-timing";

describe("S6 — isListingClosedAt", () => {
  const t = Date.parse("2026-07-19T12:00:00.000Z");

  it("closesAt'tan ÖNCE açık", () => {
    expect(isListingClosedAt(new Date(t), t - 1)).toBe(false);
  });

  it("tam closesAt anı KAPALI (sınır dahil)", () => {
    expect(isListingClosedAt(new Date(t), t)).toBe(true);
  });

  it("closesAt'tan SONRA kapalı", () => {
    expect(isListingClosedAt(new Date(t), t + 1)).toBe(true);
  });

  it("closesAt null/undefined → süresiz açık", () => {
    expect(isListingClosedAt(null, t)).toBe(false);
    expect(isListingClosedAt(undefined, t)).toBe(false);
  });
});
