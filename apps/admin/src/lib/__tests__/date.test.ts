import { describe, expect, it } from "vitest";
import { safeFormat, safeFormatDistance } from "../date";

describe("safeFormat", () => {
  it("geçerli tarihi formatlar", () => {
    expect(safeFormat("2026-07-05T10:00:00Z", "yyyy-MM-dd")).toBe("2026-07-05");
  });

  it("geçersiz/boş girdide fallback döner, throw etmez", () => {
    expect(safeFormat(null, "yyyy-MM-dd")).toBe("—");
    expect(safeFormat(undefined, "yyyy-MM-dd")).toBe("—");
    expect(safeFormat("bozuk-tarih", "yyyy-MM-dd")).toBe("—");
    expect(safeFormat("", "yyyy-MM-dd", "yok")).toBe("yok");
  });
});

describe("safeFormatDistance", () => {
  it("geçersiz girdide fallback döner, throw etmez", () => {
    expect(safeFormatDistance(null)).toBe("—");
    expect(safeFormatDistance("bozuk")).toBe("—");
  });
});
