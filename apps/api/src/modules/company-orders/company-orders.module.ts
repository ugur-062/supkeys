import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyOrdersController } from "./controllers/company-orders.controller";
import { CompanyOrdersService } from "./services/company-orders.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyOrdersController],
  providers: [CompanyOrdersService],
})
export class CompanyOrdersModule {}
