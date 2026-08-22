import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Request, Response } from "express";
import { type Observable, map } from "rxjs";
import {
  isAuthCleared,
  readAuthCookie,
  setAuthCookies,
  shouldSlide,
  slideAuthCookies,
  type Realm,
} from "./cookie";

/** Yeniden imzalarken düşürülen zaman claim'leri (sign yenilerini üretir). */
type TimeClaims = { iat?: number; exp?: number; nbf?: number };

/**
 * İki görev:
 *
 * 1) Token içeren HTTP yanıtlarında (login/verify/2fa/davet-kabul/şifre-değiştir
 *    — hepsi `{ token, ... }` döner) httpOnly oturum cookie'sini + CSRF
 *    cookie'sini OTOMATİK yazar. Token, kalıcılık bilgisi kayan yenilemede
 *    bilinebilsin diye `persistent` claim'iyle YENİDEN imzalanıp cookie'ye o
 *    haliyle konur (yanıt gövdesindeki token geçiş uyumu için aynen kalır).
 *
 * 2) Kayan oturum (sliding session): her istekte realm cookie'sindeki token
 *    doğrulanır; ömrünün yarısı geçtiyse aynı claim'lerle taze token basılıp
 *    cookie yenilenir. Aktif kullanıcı hiç düşmez; TTL boyunca hiç istek
 *    atmayan düşer. CSRF değeri korunur (bkz. slideAuthCookies).
 */
@Injectable()
export class AuthCookieInterceptor implements NestInterceptor {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    return next.handle().pipe(
      map((body: unknown) => {
        const http = context.switchToHttp();
        const req = http.getRequest<Request>();
        const response = http.getResponse<Response>();

        const issued = new Set<Realm>();

        const token = extractToken(body);
        if (token) {
          const realm = decodeRealm(token);
          if (realm) {
            // "Beni hatırla / Oturumumu açık bırak": body rememberMe açıkça
            // verilmişse o; verilmemişse (parola değişimi, 2FA, davet-kabul gibi
            // token dönen akışlar) MEVCUT cookie'deki `persistent` claim'i
            // korunur (denetim 2026-08-23: session cookie'si 30 günlük kalıcıya
            // dönüşüyordu); hiçbiri yoksa varsayılan kalıcı.
            const persistent = this.resolvePersistent(req, realm);
            setAuthCookies(
              response,
              realm,
              this.withPersistentClaim(token, persistent) ?? token,
              this.config,
              persistent,
            );
            issued.add(realm);
          }
        }

        for (const realm of ["company", "admin"] as const) {
          if (!issued.has(realm)) this.maybeSlide(req, response, realm);
        }
        return body;
      }),
    );
  }

  private resolvePersistent(req: Request, realm: Realm): boolean {
    const remember = (req.body as { rememberMe?: unknown } | undefined)?.rememberMe;
    if (remember === false) return false;
    if (remember === true) return true;
    const existing = readAuthCookie(req, realm);
    if (existing) {
      try {
        const decoded = this.jwt.verify<Record<string, unknown>>(existing);
        if (decoded?.type === realm && decoded.persistent === false) return false;
      } catch {
        /* bozuk/eski cookie — varsayılan */
      }
    }
    return true;
  }

  /** Login token'ını `persistent` claim'iyle yeniden imzalar (TTL tazelenir). */
  private withPersistentClaim(
    token: string,
    persistent: boolean,
  ): string | null {
    try {
      const decoded = this.jwt.verify<Record<string, unknown> & TimeClaims>(
        token,
      );
      const { iat: _i, exp: _e, nbf: _n, ...claims } = decoded;
      return this.jwt.sign({ ...claims, persistent });
    } catch {
      return null;
    }
  }

  private maybeSlide(req: Request, res: Response, realm: Realm): void {
    // @Res() ile doğrudan yazan uçlar (PDF export vb.): header'lar gitmişse
    // Set-Cookie eklenemez — sessizce atla (bir sonraki istek yeniler).
    if (res.headersSent) return;
    // Logout (clearAuthCookies) bu yanıtta cookie'yi SİLDİ — üstüne taze token
    // yazma (denetim 2026-08-23 #2: logout çalışmıyordu).
    if (isAuthCleared(res, realm)) return;
    const token = readAuthCookie(req, realm);
    if (!token) return;
    let decoded: (Record<string, unknown> & TimeClaims) | null = null;
    try {
      decoded = this.jwt.verify<Record<string, unknown> & TimeClaims>(token);
    } catch {
      return; // süresi dolmuş/bozuk token — dokunma (guard zaten 401 verir)
    }
    if (decoded?.type !== realm) return;
    if (!shouldSlide(decoded.iat, decoded.exp)) return;
    const { iat: _i, exp: _e, nbf: _n, ...claims } = decoded;
    const fresh = this.jwt.sign(claims);
    // Eski token'larda (claim'siz) varsayılan kalıcı — mevcut davranış.
    slideAuthCookies(
      req,
      res,
      realm,
      fresh,
      this.config,
      decoded.persistent !== false,
    );
  }
}

function extractToken(body: unknown): string | null {
  if (body && typeof body === "object" && "token" in body) {
    const t = (body as { token?: unknown }).token;
    if (typeof t === "string" && t.length > 0) return t;
  }
  return null;
}

/** JWT payload'ını doğrulamadan decode edip `type` claim'ini okur. */
function decodeRealm(token: string): Realm | null {
  try {
    const seg = token.split(".")[1];
    if (!seg) return null;
    const json = JSON.parse(
      Buffer.from(seg, "base64url").toString("utf8"),
    ) as { type?: unknown };
    if (json.type === "company" || json.type === "admin") return json.type;
    return null;
  } catch {
    return null;
  }
}
