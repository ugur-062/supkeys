import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { TenantAddressesModule } from "../tenant-addresses/tenant-addresses.module";
import { TenantApprovalRequestsModule } from "../tenant-approval-requests/tenant-approval-requests.module";
import { TenantSuppliersModule } from "../tenant-suppliers/tenant-suppliers.module";
import { TenderSchedulerModule } from "../tender-scheduler/tender-scheduler.module";
import { TenantTendersController } from "./controllers/tenant-tenders.controller";
import { TenantTendersService } from "./services/tenant-tenders.service";

@Module({
  imports: [
    AuthModule,
    EmailModule,
    TenantAddressesModule,
    TenantApprovalRequestsModule,
    TenantSuppliersModule,
    TenderSchedulerModule,
  ],
  controllers: [TenantTendersController],
  providers: [TenantTendersService],
})
export class TenantTendersModule {}
