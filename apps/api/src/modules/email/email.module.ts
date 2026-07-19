import { Module } from "@nestjs/common";
import { AdminEmailLogsController } from "./admin-email-logs.controller";
import { AdminEmailLogsService } from "./admin-email-logs.service";
import { EmailService } from "./email.service";
import { EmailSuppressionService } from "./email-suppression.service";

@Module({
  controllers: [AdminEmailLogsController],
  providers: [EmailService, AdminEmailLogsService, EmailSuppressionService],
  exports: [EmailService, EmailSuppressionService],
})
export class EmailModule {}
