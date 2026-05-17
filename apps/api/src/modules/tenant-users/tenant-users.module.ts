import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { TenantUsersController } from "./controllers/tenant-users.controller";
import { TenantUsersService } from "./services/tenant-users.service";

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [TenantUsersController],
  providers: [TenantUsersService],
  exports: [TenantUsersService],
})
export class TenantUsersModule {}
