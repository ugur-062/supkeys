import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";

// Global — her servis AuditService'i ekstra import olmadan inject edebilir.
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
