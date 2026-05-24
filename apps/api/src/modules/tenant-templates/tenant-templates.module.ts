import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantTemplatesController } from "./controllers/tenant-templates.controller";
import { QuestionTemplatesService } from "./services/question-templates.service";
import { SupplierTemplatesService } from "./services/supplier-templates.service";

@Module({
  imports: [AuthModule],
  controllers: [TenantTemplatesController],
  providers: [QuestionTemplatesService, SupplierTemplatesService],
})
export class TenantTemplatesModule {}
