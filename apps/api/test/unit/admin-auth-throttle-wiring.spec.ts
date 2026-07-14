/**
 * #10 — Admin hesap-güvenlik uçları (change-password + 2FA setup/enable/disable)
 * sıkı `@Throttle({ auth: { limit: 5, ttl: 60_000 } })` taşımalı. Aksi halde
 * global default'a (100/60s) düşüp brute-force yüzeyi açık kalırdı.
 *
 * WIRING testi: @Throttle metadata'sını handler üzerinde doğrular (tam HTTP +
 * throttler storage ayağa kaldırmadan; admin-route-authz-wiring.spec.ts ile
 * aynı felsefe).
 */
import "reflect-metadata";
import { AdminAuthController } from "../../src/modules/admin-auth/admin-auth.controller";

// @Throttle({ auth: {...} }) → Reflect.defineMetadata("THROTTLER:LIMIT"+name, ...)
// handler fonksiyonunun üzerine yazar (ayırıcı yok → "THROTTLER:LIMITauth").
const LIMIT_KEY = "THROTTLER:LIMITauth";
const TTL_KEY = "THROTTLER:TTLauth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor = { prototype: any };
const limit = (c: Ctor, m: string): unknown =>
  Reflect.getMetadata(LIMIT_KEY, c.prototype[m]);
const ttl = (c: Ctor, m: string): unknown =>
  Reflect.getMetadata(TTL_KEY, c.prototype[m]);

describe("#10 admin auth throttle wiring", () => {
  const SECURITY_ENDPOINTS = [
    "changePassword",
    "setup2fa",
    "enable2fa",
    "disable2fa",
  ];

  it("4 güvenlik-mutasyon ucu 'auth' throttler ile 5/60s taşır", () => {
    for (const m of SECURITY_ENDPOINTS) {
      expect(limit(AdminAuthController, m)).toBe(5);
      expect(ttl(AdminAuthController, m)).toBe(60_000);
    }
  });

  it("login zaten sıkı throttle taşır (regresyon: 10/60s)", () => {
    expect(limit(AdminAuthController, "login")).toBe(10);
    expect(ttl(AdminAuthController, "login")).toBe(60_000);
  });

  it("me (salt-okuma) sıkı throttle taşımaz — global default'a düşer", () => {
    expect(limit(AdminAuthController, "me")).toBeUndefined();
  });
});
