import { Module } from "@nestjs/common";
import { AdminEmailLogsController } from "./admin-email-logs.controller";
import { AdminEmailLogsService } from "./admin-email-logs.service";
import { EmailService } from "./email.service";

@Module({
  controllers: [AdminEmailLogsController],
  providers: [EmailService, AdminEmailLogsService],
  exports: [EmailService],
})
export class EmailModule {}
