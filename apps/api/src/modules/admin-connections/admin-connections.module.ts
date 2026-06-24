import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminConnectionsController } from "./admin-connections.controller";
import { AdminConnectionsService } from "./admin-connections.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminConnectionsController],
  providers: [AdminConnectionsService],
})
export class AdminConnectionsModule {}
