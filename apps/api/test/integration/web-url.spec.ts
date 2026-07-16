import {
  assertProdWebUrl,
  resolveWebUrl,
} from "../../src/common/config/web-url";

const cfg = (vals: Record<string, string | undefined>) =>
  ({ get: (k: string) => vals[k] }) as never;

describe("resolveWebUrl", () => {
  it("WEB_URL set → onu döner", () => {
    expect(resolveWebUrl(cfg({ WEB_URL: "https://app.rothern.com" }))).toBe(
      "https://app.rothern.com",
    );
  });
  it("WEB_URL yok/boş → dev fallback localhost", () => {
    expect(resolveWebUrl(cfg({}))).toBe("http://localhost:3000");
    expect(resolveWebUrl(cfg({ WEB_URL: "  " }))).toBe("http://localhost:3000");
  });
});

describe("assertProdWebUrl (boot guard)", () => {
  it("dev/test'te throw ETMEZ (fallback serbest)", () => {
    expect(() => assertProdWebUrl(cfg({ NODE_ENV: "development" }))).not.toThrow();
    expect(() => assertProdWebUrl(cfg({ NODE_ENV: "test" }))).not.toThrow();
  });
  it("prod + WEB_URL yok → THROW (deploy fail)", () => {
    expect(() => assertProdWebUrl(cfg({ NODE_ENV: "production" }))).toThrow(
      /WEB_URL/,
    );
  });
  it("prod + localhost → THROW (ölü link)", () => {
    expect(() =>
      assertProdWebUrl(
        cfg({ NODE_ENV: "production", WEB_URL: "http://localhost:3000" }),
      ),
    ).toThrow(/localhost/i);
    expect(() =>
      assertProdWebUrl(
        cfg({ NODE_ENV: "production", WEB_URL: "http://127.0.0.1:3000" }),
      ),
    ).toThrow(/localhost/i);
  });
  it("prod + geçerli domain → geçer", () => {
    expect(() =>
      assertProdWebUrl(
        cfg({ NODE_ENV: "production", WEB_URL: "https://app.rothern.com" }),
      ),
    ).not.toThrow();
  });
});
