import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { SupplierInvitationsController } from "./controllers/supplier-invitations.controller";
import { SupplierInvitationsService } from "./services/supplier-invitations.service";

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [SupplierInvitationsController],
  providers: [SupplierInvitationsService],
})
export class TenantSuppliersModule {}
