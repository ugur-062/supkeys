import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminInterventionsController } from "./admin-interventions.controller";
import { AdminInterventionsService } from "./admin-interventions.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminInterventionsController],
  providers: [AdminInterventionsService],
})
export class AdminInterventionsModule {}
