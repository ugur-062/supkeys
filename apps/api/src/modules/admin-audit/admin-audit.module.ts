import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminAuditController } from "./admin-audit.controller";

// AuditService global (AuditModule @Global) — ayrıca provide etmeye gerek yok.
@Module({
  imports: [AdminAuthModule],
  controllers: [AdminAuditController],
})
export class AdminAuditModule {}
