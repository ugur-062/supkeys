import { maskQueryString, maskSensitiveQuery } from "../../src/common/logging/mask-sensitive-url";
import { scrubRequestPii } from "../../src/instrument";

/**
 * Yayın denetimi 2026-09-28 Bölüm 5 — B4-7 eksik kalmıştı: pino istek
 * serileştiricisi `url`in yanında `query`yi de yazıyor, API Sentry'si
 * `query_string` ve `url`i maskesiz gönderiyordu → davet (`ref`) ve e-posta
 * çıkış (`t`) jetonları günlüğe/Sentry'e düz metin düşüyordu.
 */
describe("sorgu jetonu maskeleme", () => {
  it("nesne sorguda jeton anahtarları maskelenir, diğerleri korunur", () => {
    expect(maskSensitiveQuery({ ref: "abc", t: "x.y.z", l: "cl123", Token: "q" })).toEqual({
      ref: "[redacted]",
      t: "[redacted]",
      l: "cl123",
      Token: "[redacted]",
    });
    expect(maskSensitiveQuery(undefined)).toBeUndefined();
  });

  it("ham sorgu dizesi `?`li ya da `?`siz maskelenir", () => {
    expect(maskQueryString("ref=abc&l=cl123")).toBe("ref=[redacted]&l=cl123");
    expect(maskQueryString("?t=tok&x=1")).toBe("?t=[redacted]&x=1");
  });

  it("Sentry olayında url ve query_string (dize, çift listesi, nesne) maskelenir", () => {
    const asString = scrubRequestPii({
      request: { url: "https://api.rothern.com/api/public/invite-preview?ref=SECRETREF123&l=x", query_string: "ref=SECRETREF123&l=x" },
    });
    expect(JSON.stringify(asString)).not.toContain("SECRETREF123");

    const asPairs = scrubRequestPii({ request: { query_string: [["t", "SECRET-T"], ["l", "x"]] } });
    expect(asPairs.request).toEqual({ query_string: [["t", "[redacted]"], ["l", "x"]] });

    const asObject = scrubRequestPii({ request: { query_string: { ref: "SECRETREF123" } } });
    expect(JSON.stringify(asObject)).not.toContain("SECRETREF123");
  });
});
