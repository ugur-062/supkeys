import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { SupplierInvitationsController } from "./controllers/supplier-invitations.controller";
import { TenantSuppliersController } from "./controllers/tenant-suppliers.controller";
import { SupplierInvitationsService } from "./services/supplier-invitations.service";
import { TenantSuppliersService } from "./services/tenant-suppliers.service";

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [SupplierInvitationsController, TenantSuppliersController],
  providers: [SupplierInvitationsService, TenantSuppliersService],
  // V2-7 — tenant-tenders, ihaleye e-posta ile davet için createForTender'ı kullanır
  exports: [SupplierInvitationsService],
})
export class TenantSuppliersModule {}
