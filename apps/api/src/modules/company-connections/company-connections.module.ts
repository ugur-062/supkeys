import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyConnectionsController } from "./controllers/company-connections.controller";
import { CompanyConnectionsService } from "./services/company-connections.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyConnectionsController],
  providers: [CompanyConnectionsService],
})
export class CompanyConnectionsModule {}
