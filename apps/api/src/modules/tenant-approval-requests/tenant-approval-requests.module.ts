import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { TenantApprovalRequestsController } from "./controllers/tenant-approval-requests.controller";
import { TenantApprovalRequestsService } from "./services/tenant-approval-requests.service";

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [TenantApprovalRequestsController],
  providers: [TenantApprovalRequestsService],
  exports: [TenantApprovalRequestsService],
})
export class TenantApprovalRequestsModule {}
