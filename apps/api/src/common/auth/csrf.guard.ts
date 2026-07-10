import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import {
  AUTH_COOKIE,
  CSRF_COOKIE,
  CSRF_HEADER,
  parseCookies,
  type Realm,
} from "./cookie";

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
    // DİKKAT: gerçek rotalar "/api/company-auth/login" ve "/api/admin/auth/
    // login" biçiminde — muafiyet auth controller'ı + bilinen son-ek ikilisine
    // bakar (ilk sürümdeki endsWith("/auth/login") company-auth'ta hiç
    // eşleşmiyordu — ölü koddu).
    const path = req.path ?? "";
    const isAuthController =
      path.includes("/company-auth/") || path.includes("/admin/auth/");
    const PRE_SESSION_SUFFIXES = [
      "/login",
      "/logout",
      "/signup",
      "/verify-email",
      "/resend-email-code",
      "/forgot-password",
    ];
    if (
      isAuthController &&
      PRE_SESSION_SUFFIXES.some((s) => path.endsWith(s))
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
    if (typeof headerToken !== "string" || headerToken.length === 0) {
      throw new ForbiddenException("CSRF doğrulaması başarısız");
    }
    // Realm-farkında eşleşme: header, MEVCUT auth cookie'sine karşılık gelen
    // realm'in CSRF token'ıyla eşleşmeli (web ve admin ayrı cookie taşır).
    const realms: Realm[] = ["company", "admin"];
    for (const realm of realms) {
      if (!cookies[AUTH_COOKIE[realm]]) continue;
      const cookieToken = cookies[CSRF_COOKIE[realm]];
      if (cookieToken && headerToken === cookieToken) {
        return true;
      }
    }

    throw new ForbiddenException("CSRF doğrulaması başarısız");
  }
}
