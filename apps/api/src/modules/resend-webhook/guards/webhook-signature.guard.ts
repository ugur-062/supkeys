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

/**
 * V2-1 — Resend webhook svix imza doğrulayıcısı.
 *
 * Prod'da `RESEND_WEBHOOK_SECRET` zorunlu. Dev'de (NODE_ENV=development VEYA
 * secret yokken) doğrulama atlanır — local mock test scriptlerine izin
 * verilir.
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
    const isProduction =
      this.config.get<string>("NODE_ENV") === "production";

    if (!secret) {
      if (!isProduction) {
        // Dev/test ortamında secret yoksa skip — mock script ile test için
        this.logger.warn(
          "RESEND_WEBHOOK_SECRET yok; webhook imza doğrulaması atlanıyor (dev)",
        );
        return true;
      }
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
      this.logger.warn(
        `Webhook imza doğrulama hatası: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new UnauthorizedException("Geçersiz webhook imzası");
    }
  }
}
