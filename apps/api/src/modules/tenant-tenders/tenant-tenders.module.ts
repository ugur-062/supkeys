import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { TenantTendersController } from "./controllers/tenant-tenders.controller";
import { TenantTendersService } from "./services/tenant-tenders.service";

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [TenantTendersController],
  providers: [TenantTendersService],
})
export class TenantTendersModule {}
