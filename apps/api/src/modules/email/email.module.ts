import { Module } from "@nestjs/common";
import { AdminEmailLogsController } from "./admin-email-logs.controller";
import { AdminEmailLogsService } from "./admin-email-logs.service";
import { EmailService } from "./email.service";
import { EmailSuppressionService } from "./email-suppression.service";
import { EmailUnsubscribeController } from "./email-unsubscribe.controller";
import { EmailUnsubscribeService } from "./email-unsubscribe.service";

@Module({
  controllers: [AdminEmailLogsController, EmailUnsubscribeController],
  providers: [EmailService, AdminEmailLogsService, EmailSuppressionService, EmailUnsubscribeService],
  exports: [EmailService, EmailSuppressionService],
})
export class EmailModule {}
