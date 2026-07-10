import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { AUTH_COOKIE, CSRF_COOKIE, CSRF_HEADER, parseCookies } from "./cookie";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF çift-gönderim (double-submit) guard'ı. Yalnız COOKIE ile kimlik
 * doğrulanan mutating isteklerde `X-CSRF-Token` header'ı = `rk_csrf` cookie'si
 * şartını arar. Muaf:
 *  - Güvenli metotlar (GET/HEAD/OPTIONS)
 *  - Auth cookie'si olmayan istekler (login/signup/public/webhook — korunacak
 *    oturum yok) veya Bearer ile gelen istekler (cross-site header konamaz,
 *    CSRF'e kapalı — geçiş uyumu).
 * Global guard: ThrottlerGuard'dan sonra, route JWT guard'ından önce çalışır;
 * yalnız cookie VARLIĞINI kontrol eder (geçerliliğini değil).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "http") return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method.toUpperCase())) return true;

    // Ön-oturum auth uçları CSRF'ten muaf: login zaten kimlik bilgisiyle
    // korunur; BAYAT bir auth cookie'si (JWT süresi dolmuş ama cookie 30 gün
    // yaşıyor — ya da aynı localhost'ta admin logout'unun paylaşılan rk_csrf'i
    // silmesi) yüzünden login'in 403 "CSRF doğrulaması başarısız" ile
    // kilitlenmesi kullanıcıyı içeri hiç alamaz hale getiriyordu.
    const path = req.path ?? "";
    if (
      path.endsWith("/auth/login") ||
      path.endsWith("/auth/logout") ||
      path.endsWith("/auth/signup") ||
      path.endsWith("/auth/verify-email") ||
      path.endsWith("/auth/resend-email-code") ||
      path.endsWith("/auth/forgot-password")
    ) {
      return true;
    }

    // Cross-domain kurulum (SameSite=None, ör. Vercel frontend + Render API):
    // frontend farklı origin'de olduğundan JS-okunabilir CSRF cookie'sini
    // document.cookie ile okuyup echo'layamaz → double-submit yapısal olarak
    // çalışmaz. Bu modda CSRF koruması CORS origin-allowlist + JSON (preflight)
    // katmanına devredilir. Effective SameSite cookie.ts ile AYNI kural:
    // açıkça COOKIE_SAMESITE, yoksa prod → "none" / dev → "lax".
    const configuredSameSite = (process.env.COOKIE_SAMESITE ?? "").toLowerCase();
    const effectiveSameSite =
      configuredSameSite ||
      (process.env.NODE_ENV === "production" ? "none" : "lax");
    if (effectiveSameSite === "none") {
      return true;
    }

    const cookies = parseCookies(req.headers.cookie);
    const hasAuthCookie =
      !!cookies[AUTH_COOKIE.company] || !!cookies[AUTH_COOKIE.admin];
    if (!hasAuthCookie) return true; // cookie yoksa korunacak oturum yok

    const headerToken = req.headers[CSRF_HEADER];
    const cookieToken = cookies[CSRF_COOKIE];
    if (
      cookieToken &&
      typeof headerToken === "string" &&
      headerToken.length > 0 &&
      headerToken === cookieToken
    ) {
      return true;
    }

    throw new ForbiddenException("CSRF doğrulaması başarısız");
  }
}
