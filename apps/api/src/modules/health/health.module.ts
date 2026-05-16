import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { EMAIL_QUEUE_NAME } from "../email/dto/email-job.dto";
import { HealthController } from "./health.controller";

@Module({
  // Logging audit O-1 — health endpoint'in email queue waiting/failed
  // count'larına erişebilmesi için kuyruk handle'ını bu modülde de register
  // ediyoruz. (Tek BullMQ connection paylaşılır.)
  imports: [BullModule.registerQueue({ name: EMAIL_QUEUE_NAME })],
  controllers: [HealthController],
})
export class HealthModule {}
