import { describe, expect, it } from "vitest";
import { closesAtError, closesAtErrorKey } from "../closes-at";

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
  it("i18n Faz 2: kural anahtar döner, metni çağıranın çevirmeni basar", () => {
    expect(closesAtErrorKey("")).toBe("required");
    expect(closesAtErrorKey("abc")).toBe("invalid");
    expect(closesAtErrorKey(new Date(Date.now() - 1000).toISOString())).toBe("mustBeFuture");
    expect(closesAtErrorKey(new Date(Date.now() + 3 * 365 * 864e5).toISOString())).toBe("tooFar");
    expect(closesAtErrorKey(new Date(Date.now() + 7 * 864e5).toISOString())).toBeNull();
    expect(closesAtError("", (key) => `k:${key}`)).toBe("k:required");
  });
});
