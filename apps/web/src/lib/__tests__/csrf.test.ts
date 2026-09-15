// @vitest-environment jsdom
/**
 * ÇEREZ ADI ÖN EKİ — SÖZLEŞME (2026-09-15).
 *
 * Canlı `.rothern.com` çerezleri staging'e de gidiyor; aynı adlar staging
 * kaydında CSRF çakışması üretiyordu. Staging `rks_`, canlı/yerel `rk_`.
 * Aynı tablo admin'de de sınanır (`apps/admin/src/lib/__tests__/csrf.test.ts`):
 * admin kuralın kopyasını taşır, ayrışırsa iki testten biri kırılır.
 */
import { cookieNamePrefix, cookieNames } from "@rothern/shared";
import { afterEach, describe, expect, it } from "vitest";
import { csrfCookieName, readCsrfToken } from "../csrf";

const HOST_TABLOSU: Array<[string, "rk_" | "rks_"]> = [
  ["www.rothern.com", "rk_"],
  ["rothern.com", "rk_"],
  [".rothern.com", "rk_"],
  ["api.rothern.com", "rk_"],
  ["admin.rothern.com", "rk_"],
  ["localhost", "rk_"],
  ["", "rk_"],
  ["staging.rothern.com", "rks_"],
  [".staging.rothern.com", "rks_"],
  ["admin.staging.rothern.com", "rks_"],
  ["api.staging.rothern.com", "rks_"],
  ["STAGING.ROTHERN.COM", "rks_"],
  // Benzer görünen ama staging olmayan alanlar ön ek ALMAZ.
  ["notstaging.rothern.com", "rk_"],
  ["staging.rothern.com.evil.test", "rk_"],
];

describe("çerez adı ön eki", () => {
  it.each(HOST_TABLOSU)("%s → %s", (host, prefix) => {
    expect(cookieNamePrefix(host)).toBe(prefix);
    expect(csrfCookieName(host)).toBe(`${prefix}csrf`);
  });

  it("canlı adlar DEĞİŞMEDİ (canlıda oturum düşmesin)", () => {
    expect(cookieNames("rk_")).toEqual({
      companyAuth: "rk_company",
      adminAuth: "rk_admin",
      companyCsrf: "rk_csrf",
      adminCsrf: "rk_admin_csrf",
    });
  });
});

describe("readCsrfToken", () => {
  afterEach(() => {
    document.cookie = "rk_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  it("yerelde rk_csrf okunur", () => {
    document.cookie = "rk_csrf=yerel-deger; path=/";
    expect(readCsrfToken()).toBe("yerel-deger");
  });
});
