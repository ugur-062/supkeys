import { describe, expect, it } from "vitest";
import { closesAtError, closesAtErrorKey } from "../closes-at";

/* i18n Faz 2: metin katalogdan (`web.panel.requests.closesAt.*`) — burada
   çevirmen sahte (anahtarı geri basar), sınanan KURAL. */
const t = (key: string) => `k:${key}`;

describe("closesAtError (F2: gelecekte + en fazla 2 yıl, backend birebir)", () => {
  it("boş/geçersiz reddedilir", () => {
    expect(closesAtError("", t)).toBe("k:required");
    expect(closesAtError("abc", t)).toBe("k:invalid");
  });
  it("geçmiş tarih reddedilir", () => {
    expect(closesAtError(new Date(Date.now() - 1000).toISOString(), t)).toBe(
      "k:mustBeFuture",
    );
  });
  it("2 yıldan ileri reddedilir", () => {
    expect(
      closesAtError(new Date(Date.now() + 3 * 365 * 864e5).toISOString(), t),
    ).toBe("k:tooFar");
  });
  it("gelecekte + sınır içinde geçerli (null)", () => {
    expect(
      closesAtError(new Date(Date.now() + 7 * 864e5).toISOString(), t),
    ).toBeNull();
  });
  it("i18n Faz 2: kural anahtar döner, metni çağıranın çevirmeni basar", () => {
    expect(closesAtErrorKey("")).toBe("required");
    expect(closesAtErrorKey("abc")).toBe("invalid");
    expect(closesAtErrorKey(new Date(Date.now() - 1000).toISOString())).toBe("mustBeFuture");
    expect(closesAtErrorKey(new Date(Date.now() + 3 * 365 * 864e5).toISOString())).toBe("tooFar");
    expect(closesAtErrorKey(new Date(Date.now() + 7 * 864e5).toISOString())).toBeNull();
  });
});
