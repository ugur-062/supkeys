import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SupplierAuthModule } from "../supplier-auth/supplier-auth.module";
import { SupplierAttachmentsController } from "./controllers/supplier-attachments.controller";
import { TenantAttachmentsController } from "./controllers/tenant-attachments.controller";
import { AttachmentsService } from "./services/attachments.service";

@Module({
  imports: [AuthModule, SupplierAuthModule],
  controllers: [TenantAttachmentsController, SupplierAttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
