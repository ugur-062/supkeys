import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { TenderSchedulerService } from "./tender-scheduler.service";

@Module({
  imports: [EmailModule],
  providers: [TenderSchedulerService],
})
export class TenderSchedulerModule {}
