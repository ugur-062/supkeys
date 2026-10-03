import { Module } from "@nestjs/common";
import { CompanyConnectionsModule } from "../company-connections/company-connections.module";
import { AdminGrowthController } from "./admin-growth.controller";
import { AdminGrowthService } from "./admin-growth.service";

@Module({
  imports: [CompanyConnectionsModule],
  controllers: [AdminGrowthController],
  providers: [AdminGrowthService],
})
export class AdminGrowthModule {}
