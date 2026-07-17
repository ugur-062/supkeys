import { assertOwnProfileImageUrl } from "../../src/common/helpers/upload-validation";

const HOSTS = ["pub-abc.r2.dev", "acct.r2.cloudflarestorage.com"];
const PREFIX = "prod/tenant-profile/comp1/";
const check = (value: string, allowedHosts = HOSTS) =>
  assertOwnProfileImageUrl(value, { tenantPrefix: PREFIX, allowedHosts });

describe("assertOwnProfileImageUrl — profil görsel host+prefix", () => {
  it("own CDN URL (host + prefix path'in KÖKÜNDE) → geçer", () => {
    expect(() =>
      check("https://pub-abc.r2.dev/prod/tenant-profile/comp1/logo-x.jpg"),
    ).not.toThrow();
  });

  it("own presigned URL (prefix bucket-SONRASINDA — includes, startsWith değil) → geçer", () => {
    expect(() =>
      check(
        "https://acct.r2.cloudflarestorage.com/mybucket/prod/tenant-profile/comp1/logo-x.jpg?sig=1",
      ),
    ).not.toThrow();
  });

  it("harici host (own-prefix taklidi olsa bile) → 400", () => {
    expect(() =>
      check("https://evil.com/prod/tenant-profile/comp1/x.jpg"),
    ).toThrow(/kendi profil/);
  });

  it("data: URL → 400 (protocol elenir)", () => {
    expect(() => check("data:text/html,<script>alert(1)</script>")).toThrow(
      /Geçersiz/,
    );
  });

  it("başka tenant prefix (comp2) → 400", () => {
    expect(() =>
      check("https://pub-abc.r2.dev/prod/tenant-profile/comp2/x.jpg"),
    ).toThrow(/kendi profil/);
  });

  it("allowedHosts BOŞ → FAIL-CLOSED (own URL bile reddedilir)", () => {
    expect(() =>
      check("https://pub-abc.r2.dev/prod/tenant-profile/comp1/x.jpg", []),
    ).toThrow(/kendi profil/);
  });

  it("URL olmayan çöp → 400", () => {
    expect(() => check("just-a-string")).toThrow(/Geçersiz/);
  });
});
