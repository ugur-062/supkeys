import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { type Observable, map } from "rxjs";
import { type Realm, setAuthCookies } from "./cookie";

/**
 * Token içeren HTTP yanıtlarında (login/verify/2fa/davet-kabul/şifre-değiştir —
 * hepsi `{ token, ... }` döner) httpOnly oturum cookie'sini + CSRF cookie'sini
 * OTOMATİK yazar. Tek nokta: her controller'a el ile cookie eklemek yerine.
 * Realm token'ın `type` claim'inden çözülür. Token yanıt gövdesinde KALIR
 * (geçiş uyumu — frontend artık onu saklamıyor, cookie kullanıyor).
 */
@Injectable()
export class AuthCookieInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    return next.handle().pipe(
      map((body: unknown) => {
        const token = extractToken(body);
        if (token) {
          const realm = decodeRealm(token);
          if (realm) {
            const res = context.switchToHttp().getResponse<Response>();
            setAuthCookies(res, realm, token, this.config);
          }
        }
        return body;
      }),
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
