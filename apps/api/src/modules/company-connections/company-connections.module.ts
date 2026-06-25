import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyBlocksModule } from "../company-blocks/company-blocks.module";
import { CompanyConnectionsController } from "./controllers/company-connections.controller";
import { CompanyConnectionsService } from "./services/company-connections.service";

@Module({
  imports: [CompanyAuthModule, CompanyBlocksModule],
  controllers: [CompanyConnectionsController],
  providers: [CompanyConnectionsService],
})
export class CompanyConnectionsModule {}
