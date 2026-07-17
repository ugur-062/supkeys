import { describe, expect, it } from "vitest";
import { closesAtError } from "../closes-at";

describe("closesAtError (F2: gelecekte + en fazla 2 yıl, backend birebir)", () => {
  it("boş/geçersiz reddedilir", () => {
    expect(closesAtError("")).toBeTruthy();
    expect(closesAtError("abc")).toBeTruthy();
  });
  it("geçmiş tarih reddedilir", () => {
    expect(closesAtError(new Date(Date.now() - 1000).toISOString())).toMatch(
      /gelecekte/,
    );
  });
  it("2 yıldan ileri reddedilir", () => {
    expect(
      closesAtError(new Date(Date.now() + 3 * 365 * 864e5).toISOString()),
    ).toMatch(/2 yıl/);
  });
  it("gelecekte + sınır içinde geçerli (null)", () => {
    expect(
      closesAtError(new Date(Date.now() + 7 * 864e5).toISOString()),
    ).toBeNull();
  });
});
