import { isCorsOriginAllowed } from "../../src/common/cors-origin";

const ORIGINS = ["https://app.rothern.com", "https://admin.rothern.com"];

describe("isCorsOriginAllowed — vercel jokeri env-gate", () => {
  it("strict allowlist eşleşmesi izinli", () => {
    expect(
      isCorsOriginAllowed("https://app.rothern.com", {
        corsOrigins: ORIGINS,
        allowVercel: false,
      }),
    ).toBe(true);
  });

  it("*.vercel.app allowVercel=false iken REDDEDİLİR (prod default)", () => {
    expect(
      isCorsOriginAllowed("https://evil-attacker.vercel.app", {
        corsOrigins: ORIGINS,
        allowVercel: false,
      }),
    ).toBe(false);
  });

  it("*.vercel.app yalnız allowVercel=true iken izinli (preview/demo)", () => {
    expect(
      isCorsOriginAllowed("https://supkeys-web.vercel.app", {
        corsOrigins: ORIGINS,
        allowVercel: true,
      }),
    ).toBe(true);
  });

  it("allowlist dışı origin REDDEDİLİR", () => {
    expect(
      isCorsOriginAllowed("https://evil.com", {
        corsOrigins: ORIGINS,
        allowVercel: true,
      }),
    ).toBe(false);
  });

  it("origin yok (curl/same-origin/mobil) izinli", () => {
    expect(
      isCorsOriginAllowed(undefined, { corsOrigins: ORIGINS, allowVercel: false }),
    ).toBe(true);
  });
});
