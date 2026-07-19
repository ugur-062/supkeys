/**
 * S7 — teklif son-geçerlilik formülü tek-kaynak (bidValidUntilMs).
 * `submittedAt + validityDays*gün`. Legacy (null) = süresiz. createNextRound
 * ayıklaması + extendBidValidity yeterlilik kontrolü aynı tanımı kullanır.
 */
import { bidValidUntilMs } from "../../src/common/company/listing-timing";

describe("S7 — bidValidUntilMs", () => {
  const t = Date.parse("2026-07-19T00:00:00.000Z");

  it("submittedAt + validityDays gün (ms)", () => {
    expect(bidValidUntilMs(new Date(t), 10)).toBe(t + 10 * 86_400_000);
  });

  it("validityDays 0 → tam submittedAt anı", () => {
    expect(bidValidUntilMs(new Date(t), 0)).toBe(t);
  });

  it("submittedAt null → süresiz (null)", () => {
    expect(bidValidUntilMs(null, 10)).toBeNull();
  });

  it("validityDays null → süresiz (null)", () => {
    expect(bidValidUntilMs(new Date(t), null)).toBeNull();
  });
});
