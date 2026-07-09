import { randomBytes } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";

/**
 * httpOnly cookie tabanlı oturum yardımcıları — token localStorage yerine
 * httpOnly cookie'de taşınır (XSS ile sızdırılamaz). CSRF için çift-gönderim
 * (double-submit) deseni: JS-okunabilir `rk_csrf` cookie'si + mutating
 * isteklerde `X-CSRF-Token` header eşleşmesi (bkz. CsrfGuard).
 *
 * Yeni bağımlılık YOK: set = Express native `res.cookie()`, oku = elle parse.
 */

export type Realm = "company" | "admin";

/** httpOnly oturum cookie adı — realm başına ayrı (aynı tarayıcıda ikisi de). */
export const AUTH_COOKIE: Record<Realm, string> = {
  company: "rk_company",
  admin: "rk_admin",
};

/** JS-okunabilir CSRF cookie'si (httpOnly DEĞİL — frontend header'a echo'lar). */
export const CSRF_COOKIE = "rk_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** Cookie ömrü — JWT 1sa'de expire olur (asıl kapı); cookie daha uzun yaşar. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün

function isProd(config: ConfigService): boolean {
  return config.get<string>("NODE_ENV") === "production";
}

/** Ortak cookie opsiyonları — prod'da Secure + cross-subdomain Domain. */
function baseOptions(config: ConfigService, persistent: boolean) {
  const prod = isProd(config);
  // Prod: app/admin/api aynı site (.rothern.com) → Domain ile paylaşılır.
  // Dev: localhost (portlar same-site) → Domain vermiyoruz (host-only).
  const domain = config.get<string>("COOKIE_DOMAIN") || undefined;
  // SameSite: aynı-site (app+api ortak .rothern.com) → "lax" (CSRF için sıkı).
  // Cross-site (frontend Vercel + API Render farklı domain) → COOKIE_SAMESITE=none
  // ŞART, aksi halde auth cookie'si XHR'de gönderilmez ve giriş sonrası login'e
  // geri atar. "none" tarayıcıda Secure gerektirir → secure zorlanır.
  const sameSite = ((config.get<string>("COOKIE_SAMESITE") || "lax")
    .toLowerCase() as "lax" | "none" | "strict");
  return {
    domain,
    path: "/",
    sameSite,
    secure: prod || sameSite === "none",
    // "Beni hatırla": kalıcı → maxAge (30 gün). Değilse maxAge YOK → SESSION
    // cookie'si (tarayıcı kapanınca silinir). JWT 1sa'de expire eder (asıl kapı).
    ...(persistent ? { maxAge: MAX_AGE_MS } : {}),
  };
}

/**
 * Oturum (httpOnly) + CSRF (okunabilir) cookie'lerini yazar. `persistent=false`
 * → session cookie'si (tarayıcı kapanınca çıkış — "Beni hatırla" işaretsiz).
 */
export function setAuthCookies(
  res: Response,
  realm: Realm,
  token: string,
  config: ConfigService,
  persistent = true,
): void {
  const base = baseOptions(config, persistent);
  res.cookie(AUTH_COOKIE[realm], token, { ...base, httpOnly: true });
  res.cookie(CSRF_COOKIE, randomBytes(32).toString("hex"), {
    ...base,
    httpOnly: false,
  });
}

/** Oturum + CSRF cookie'lerini temizler (logout). */
export function clearAuthCookies(
  res: Response,
  realm: Realm,
  config: ConfigService,
): void {
  const { domain, path } = baseOptions(config, true);
  res.clearCookie(AUTH_COOKIE[realm], { domain, path });
  res.clearCookie(CSRF_COOKIE, { domain, path });
}

/** `Cookie` header'ını elle parse eder (cookie-parser bağımlılığı olmadan). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** İstekten realm oturum token'ını okur (cookie). Yoksa null. */
export function readAuthCookie(req: Request, realm: Realm): string | null {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[AUTH_COOKIE[realm]] ?? null;
}
