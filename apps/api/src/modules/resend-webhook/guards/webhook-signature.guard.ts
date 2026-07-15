import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { Webhook } from "svix";
import { reportToSentry } from "../../../instrument";

/**
 * V2-1 — Resend webhook svix imza doğrulayıcısı.
 *
 * Security audit Y-5 — fail-closed: dev bypass artık explicit opt-in.
 * `RESEND_WEBHOOK_SECRET` yoksa **sadece** `ALLOW_INSECURE_WEBHOOK=true` flag'i
 * set edilmiş + non-production ortamda devre dışı kalır. Production'da
 * `NODE_ENV` set edilmesi unutulsa bile secret yoksa 401 döner.
 *
 * IMPORTANT: Bu guard `request.rawBody`'ye erişmek zorunda; main.ts
 * `/webhooks/resend` için raw body parser ayarlanmış olmalı (`rawBody:
 * true` + body buffer saklama).
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<
      Request & { rawBody?: Buffer }
    >();

    const secret = this.config.get<string>("RESEND_WEBHOOK_SECRET");
    const nodeEnv = this.config.get<string>("NODE_ENV");
    // #6 — Allowlist / fail-closed: bypass yalnız AÇIKÇA development/test
    // ortamında mümkün. ESKİ mantık (`!== "production"`) bir denylist'ti —
    // NODE_ENV unset (default "development") ya da "staging"/"prod" gibi
    // yanlış yazımlar bypass'ı açık bırakıyordu. Artık tanınmayan/unset env
    // production gibi sıkı davranır.
    const bypassableEnv = nodeEnv === "development" || nodeEnv === "test";
    const allowInsecure =
      this.config.get<string>("ALLOW_INSECURE_WEBHOOK") === "true";

    if (!secret) {
      // Fail-closed: bypass sadece (1) explicit ALLOW_INSECURE_WEBHOOK=true
      // VE (2) env açıkça development/test ise mümkün. Eksik env config
      // production'da (ve unset/tanınmayan env'de) hata fırlatır.
      if (bypassableEnv && allowInsecure) {
        this.logger.warn(
          "RESEND_WEBHOOK_SECRET yok + ALLOW_INSECURE_WEBHOOK=true → imza doğrulaması atlanıyor (sadece dev/test)",
        );
        return true;
      }
      this.logger.error(
        `Webhook secret yapılandırılmamış (NODE_ENV=${nodeEnv ?? "(unset)"}, allowInsecure=${allowInsecure})`,
      );
      // 401 fırlatıyor → SentryGlobalFilter (yalnız 5xx/unhandled) yakalamaz.
      // Config hatası: prod'da webhook'lar sessizce reddedilir → operatör görmeli.
      reportToSentry("Webhook secret yapılandırılmamış", "error", {
        tags: { webhook: "misconfig" },
        extra: { nodeEnv: nodeEnv ?? null, allowInsecure },
      });
      throw new UnauthorizedException("Webhook secret yapılandırılmamış");
    }

    const svixId = request.headers["svix-id"] as string | undefined;
    const svixTimestamp = request.headers["svix-timestamp"] as string | undefined;
    const svixSignature = request.headers["svix-signature"] as string | undefined;

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new UnauthorizedException("Eksik webhook header'ları");
    }

    if (!request.rawBody) {
      throw new UnauthorizedException(
        "Raw body yok — body parser config hatası",
      );
    }

    try {
      const wh = new Webhook(secret);
      wh.verify(request.rawBody.toString("utf8"), {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Webhook imza doğrulama hatası: ${reason}`);
      // Geçersiz imza olası saldırı/replay sinyali; 401 fırlatıldığı için
      // SentryGlobalFilter yakalamaz → manuel bildir. rawBody/imza değeri GEÇME.
      reportToSentry("Webhook imza doğrulama hatası", "warning", {
        tags: { webhook: "bad-signature" },
        extra: { svixId: svixId ?? null, reason },
      });
      throw new UnauthorizedException("Geçersiz webhook imzası");
    }
  }
}
