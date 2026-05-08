import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminTenantsController } from "./controllers/admin-tenants.controller";
import { AdminTenantsService } from "./services/admin-tenants.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminTenantsController],
  providers: [AdminTenantsService],
})
export class AdminTenantsModule {}
