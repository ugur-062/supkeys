import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantApprovalFlowsController } from "./controllers/tenant-approval-flows.controller";
import { TenantApprovalFlowsService } from "./services/tenant-approval-flows.service";

@Module({
  imports: [AuthModule],
  controllers: [TenantApprovalFlowsController],
  providers: [TenantApprovalFlowsService],
  exports: [TenantApprovalFlowsService],
})
export class TenantApprovalFlowsModule {}
