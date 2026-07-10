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

/**
 * JS-okunabilir CSRF cookie'si (httpOnly DEĞİL — frontend header'a echo'lar).
 * REALM BAŞINA AYRI: localhost'ta web+admin aynı cookie kavanozunu paylaşır;
 * ortak tek "rk_csrf" kullanılınca bir uygulamanın logout'u diğerinin GEÇERLİ
 * oturumunun CSRF token'ını siliyor, tüm mutasyonları 403'e düşürüyordu.
 */
export const CSRF_COOKIE: Record<Realm, string> = {
  company: "rk_csrf",
  admin: "rk_admin_csrf",
};
export const CSRF_HEADER = "x-csrf-token";

/** Cookie ömrü — JWT 1sa'de expire olur (asıl kapı); cookie daha uzun yaşar. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün

function isProd(config: ConfigService): boolean {
  return config.get<string>("NODE_ENV") === "production";
}

/** Ortak cookie opsiyonları — prod'da Secure + cross-subdomain Domain. */
function baseOptions(config: ConfigService, persistent: boolean) {
  const prod = isProd(config);
  // COOKIE_DOMAIN yalnız SAME-SITE prod'da set edilir (Railway: app/api ortak
  // .rothern.com → Domain ile paylaşılır). Cross-domain kurulumda (Vercel +
  // Render) ASLA set etme: API kendi sahibi olmadığı domain'e cookie yazamaz,
  // tarayıcı düşürür → auth komple çöker. Dev: localhost → host-only.
  const domain = config.get<string>("COOKIE_DOMAIN") || undefined;
  // SameSite kuralı: "none" tarayıcıda Secure gerektirir → aşağıda secure zorlanır.
  // Prod VARSAYILANI "none" — Vercel+Render gibi cross-domain kurulumlar
  // out-of-the-box çalışsın (auth cookie'si cross-site XHR'de gönderilir).
  // Same-site prod (app.rothern.com + api.rothern.com, COOKIE_DOMAIN) isteyen
  // COOKIE_SAMESITE=lax ile geri alır. Dev'de (localhost, HTTP) "lax".
  const configuredSameSite = (config.get<string>("COOKIE_SAMESITE") || "")
    .toLowerCase();
  const sameSite = (configuredSameSite || (prod ? "none" : "lax")) as
    | "lax"
    | "none"
    | "strict";
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
  res.cookie(CSRF_COOKIE[realm], randomBytes(32).toString("hex"), {
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
  // Silme Set-Cookie'si de set ile AYNI attribute'ları taşımalı: cross-site
  // yanıtta SameSite=None+Secure olmayan Set-Cookie'yi tarayıcı REDDEDER →
  // logout cookie'yi silemez (oturum JWT ömrü boyunca yaşar). maxAge'i
  // clearCookie kendisi epoch'a çeker, o yüzden düşürüyoruz.
  const { maxAge: _maxAge, ...base } = baseOptions(config, true);
  res.clearCookie(AUTH_COOKIE[realm], base);
  res.clearCookie(CSRF_COOKIE[realm], base);
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
