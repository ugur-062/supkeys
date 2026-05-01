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
})
export class TenantSuppliersModule {}
