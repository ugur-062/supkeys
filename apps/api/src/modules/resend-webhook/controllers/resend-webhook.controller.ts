import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from "@nestjs/common";
import { WebhookSignatureGuard } from "../guards/webhook-signature.guard";
import {
  ResendEventService,
  type ResendWebhookEvent,
} from "../services/resend-event.service";

/**
 * V2-1 — Resend webhook endpoint.
 *
 * Public (auth guard YOK), svix imza ile korunur.
 *
 * Resend dashboard'unda (production) URL:
 *   https://api.rothern.com/api/webhooks/resend
 *
 * Local'de mock script `pnpm test:webhook` doğrudan ResendEventService'i
 * çağırır — bu controller'a HTTP request atmaz.
 */
@Controller("webhooks/resend")
export class ResendWebhookController {
  private readonly logger = new Logger(ResendWebhookController.name);

  constructor(private readonly eventService: ResendEventService) {}

  @Post()
  @UseGuards(WebhookSignatureGuard)
  @HttpCode(200)
  async handle(
    @Body() body: ResendWebhookEvent,
    @Headers("svix-id") svixId: string,
  ): Promise<{ ok: true; result: unknown }> {
    if (!svixId) {
      throw new BadRequestException("svix-id header zorunlu");
    }
    if (!body || typeof body !== "object" || !body.type || !body.data) {
      throw new BadRequestException("Geçersiz webhook payload");
    }
    const result = await this.eventService.handleEvent(body, svixId);
    return { ok: true, result };
  }
}
