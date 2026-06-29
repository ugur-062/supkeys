import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyBlocksModule } from "../company-blocks/company-blocks.module";
import { EmailModule } from "../email/email.module";
import { CompanyConnectionsController } from "./controllers/company-connections.controller";
import { CompanyDirectoryController } from "./controllers/company-directory.controller";
import { CompanyConnectionsService } from "./services/company-connections.service";

@Module({
  imports: [CompanyAuthModule, CompanyBlocksModule, EmailModule],
  controllers: [CompanyConnectionsController, CompanyDirectoryController],
  providers: [CompanyConnectionsService],
})
export class CompanyConnectionsModule {}
