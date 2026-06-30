import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatTime } from "../date";

const D = new Date(2026, 6, 5, 14, 30, 0); // 5 Tem 2026 14:30 (yerel)

describe("date yardımcıları", () => {
  it("formatDate gün biçimi verir", () => {
    expect(formatDate(D)).toMatch(/2026/);
    expect(formatDate(D)).toMatch(/Tem/);
  });

  it("formatDateTime saat içerir", () => {
    expect(formatDateTime(D)).toMatch(/14:30/);
  });

  it("formatTime yalnız saat", () => {
    expect(formatTime(D)).toBe("14:30");
  });

  it("boş/null girdide tire döner", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDateTime("")).toBe("—");
    expect(formatTime(null)).toBe("—");
  });

  it("geçersiz tarihte tire döner", () => {
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDateTime("zzz")).toBe("—");
  });

  it("ISO string kabul eder", () => {
    expect(formatDate("2026-07-05T11:30:00.000Z")).toMatch(/2026/);
  });
});
