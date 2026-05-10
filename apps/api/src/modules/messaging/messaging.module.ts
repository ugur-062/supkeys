import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { SupplierAuthModule } from "../supplier-auth/supplier-auth.module";
import { SupplierMessagesController } from "./controllers/supplier-messages.controller";
import { TenantMessagesController } from "./controllers/tenant-messages.controller";
import { NoCacheInterceptor } from "./interceptors/no-cache.interceptor";
import { MessageEmailScheduler } from "./schedulers/message-email.scheduler";
import { MessagesService } from "./services/messages.service";

@Module({
  imports: [AuthModule, SupplierAuthModule, EmailModule],
  providers: [
    MessagesService,
    MessageEmailScheduler,
    NoCacheInterceptor,
  ],
  controllers: [TenantMessagesController, SupplierMessagesController],
  exports: [MessagesService],
})
export class MessagingModule {}
