import { Module } from "@nestjs/common";
import { ResendWebhookController } from "./controllers/resend-webhook.controller";
import { ResendEventService } from "./services/resend-event.service";

@Module({
  controllers: [ResendWebhookController],
  providers: [ResendEventService],
  exports: [ResendEventService],
})
export class ResendWebhookModule {}
