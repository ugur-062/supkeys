/**
 * Admin CSRF çerez adı — `@rothern/shared` `cookie-names.ts` kuralının KOPYASI
 * burada sınanır. Tablo web testindekiyle (`apps/web/src/lib/__tests__/csrf.test.ts`)
 * AYNI olmalı; kural değişirse iki dosya birlikte güncellenir.
 */
import { describe, expect, it } from "vitest";
import { adminCsrfCookieName } from "../csrf";

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
  ["notstaging.rothern.com", "rk_"],
  ["staging.rothern.com.evil.test", "rk_"],
];

describe("admin CSRF çerez adı", () => {
  it.each(HOST_TABLOSU)("%s → %sadmin_csrf", (host, prefix) => {
    expect(adminCsrfCookieName(host)).toBe(`${prefix}admin_csrf`);
  });
});
