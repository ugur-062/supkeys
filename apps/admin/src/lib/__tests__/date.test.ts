import { describe, expect, it } from "vitest";
import {
  nextDateTimeLocal,
  safeFormat,
  safeFormatDistance,
  toDateTimeLocal,
} from "../date";

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

describe("toDateTimeLocal (derin denetim LU-12 — datetime-local alt sınırı yerel saat)", () => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const localOf = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  it("UTC ISO'yu yerel saate çevirir (slice(0,16) gibi UTC kesmez)", () => {
    const iso = "2026-10-01T15:00:00.000Z";
    expect(toDateTimeLocal(iso)).toBe(localOf(new Date(iso)));
  });

  it("boş/geçersiz girdide şimdiki anı verir", () => {
    const before = localOf(new Date());
    const got = toDateTimeLocal(null);
    expect(got >= before).toBe(true);
    expect(toDateTimeLocal("bozuk")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe("nextDateTimeLocal (derin denetim LU-12, gözden geçirme — alt sınır kesin sonra)", () => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const localOf = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  it("tam dakikadaki kapanışta bir sonraki dakikayı verir (eşit değer backend'de reddedilir)", () => {
    const iso = "2026-10-01T15:00:00.000Z";
    expect(nextDateTimeLocal(iso)).toBe(localOf(new Date("2026-10-01T15:01:00.000Z")));
  });

  it("saniyeli kapanışta aynı dakikayı değil sonrakini verir", () => {
    const iso = "2026-10-01T15:00:30.000Z";
    expect(nextDateTimeLocal(iso)).toBe(localOf(new Date("2026-10-01T15:01:00.000Z")));
  });

  it("alt sınır her zaman girdiden kesin sonra", () => {
    const iso = "2026-10-01T15:00:59.999Z";
    const min = nextDateTimeLocal(iso);
    expect(new Date(min).getTime()).toBeGreaterThan(new Date(iso).getTime());
  });

  it("boş girdide şimdiden sonraki dakikayı verir", () => {
    const now = Date.now();
    expect(new Date(nextDateTimeLocal()).getTime()).toBeGreaterThan(now);
  });
});
