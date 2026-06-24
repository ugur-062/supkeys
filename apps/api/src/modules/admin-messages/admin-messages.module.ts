import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminMessagesController } from "./admin-messages.controller";
import { AdminMessagesService } from "./admin-messages.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminMessagesController],
  providers: [AdminMessagesService],
})
export class AdminMessagesModule {}
