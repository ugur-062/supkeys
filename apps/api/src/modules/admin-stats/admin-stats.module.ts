import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminStatsController } from "./controllers/admin-stats.controller";
import { AdminStatsService } from "./services/admin-stats.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminStatsController],
  providers: [AdminStatsService],
})
export class AdminStatsModule {}
