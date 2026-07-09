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

    // Cross-domain kurulum (COOKIE_SAMESITE=none, ör. Vercel frontend + Render
    // API): frontend farklı origin'de olduğundan JS-okunabilir CSRF cookie'sini
    // document.cookie ile okuyup echo'layamaz → double-submit yapısal olarak
    // çalışmaz. Bu modda CSRF koruması CORS origin-allowlist + JSON (preflight)
    // katmanına devredilir.
    if ((process.env.COOKIE_SAMESITE ?? "").toLowerCase() === "none") {
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
