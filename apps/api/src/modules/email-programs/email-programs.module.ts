import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { NotificationModule } from "../notifications/notification.module";
import { EmailProgramsScheduler } from "./email-programs.scheduler";
import { EmailProgramsService } from "./email-programs.service";

/** Günlük e-posta programı (Faz 2) — özet, karşılama serisi, haftalık özet, teklifsiz talep. */
@Module({
  imports: [EmailModule, NotificationModule],
  providers: [EmailProgramsService, EmailProgramsScheduler],
  exports: [EmailProgramsService],
})
export class EmailProgramsModule {}
