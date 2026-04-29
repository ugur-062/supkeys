import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AdminEmailLogsController } from "./admin-email-logs.controller";
import { AdminEmailLogsService } from "./admin-email-logs.service";
import { EMAIL_QUEUE_NAME } from "./dto/email-job.dto";
import { EmailProcessor } from "./email.processor";
import { EmailQueue } from "./email.queue";
import { EmailService } from "./email.service";

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>("REDIS_URL", "redis://localhost:6379");
        const parsed = new URL(url);
        return {
          connection: {
            host: parsed.hostname,
            port: parseInt(parsed.port || "6379", 10),
            password: parsed.password || undefined,
          },
        };
      },
    }),
    BullModule.registerQueue({
      name: EMAIL_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
  ],
  controllers: [AdminEmailLogsController],
  providers: [EmailService, EmailQueue, EmailProcessor, AdminEmailLogsService],
  exports: [EmailQueue, EmailService],
})
export class EmailModule {}
