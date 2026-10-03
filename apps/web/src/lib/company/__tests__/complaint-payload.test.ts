import { describe, expect, it } from "vitest";
import {
  COMPLAINT_DETAIL_MAX,
  COMPLAINT_REASON_MAX,
  complaintPayload,
} from "../complaint-payload";

describe("complaintPayload", () => {
  it("short text goes as reason only (trimmed)", () => {
    expect(complaintPayload("  spam messages  ")).toEqual({
      reason: "spam messages",
    });
  });

  it("text exactly at the reason limit is not split", () => {
    const text = "a".repeat(COMPLAINT_REASON_MAX);
    expect(complaintPayload(text)).toEqual({ reason: text });
  });

  it("long text: reason is a shortened head within the API limit, detail is the full text", () => {
    const text = "word ".repeat(40).trim(); // 199 chars
    const out = complaintPayload(text);
    expect(Array.from(out.reason).length).toBeLessThanOrEqual(COMPLAINT_REASON_MAX);
    expect(out.reason.endsWith("…")).toBe(true);
    expect(text.startsWith(out.reason.slice(0, -1))).toBe(true);
    expect(out.detail).toBe(text);
  });

  it("does not split a surrogate pair at the cut point", () => {
    const text = "a".repeat(COMPLAINT_REASON_MAX - 2) + "\u{1F600}".repeat(10);
    const out = complaintPayload(text);
    expect(Array.from(out.reason).length).toBeLessThanOrEqual(COMPLAINT_REASON_MAX);
    expect(out.reason).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("detail never exceeds the API detail limit", () => {
    const out = complaintPayload("x".repeat(COMPLAINT_DETAIL_MAX + 50));
    expect(out.detail).toHaveLength(COMPLAINT_DETAIL_MAX);
  });
});
