import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { AdminDemoRequestsController } from "./admin-demo-requests.controller";
import { DemoRequestsController } from "./demo-requests.controller";
import { DemoRequestsService } from "./demo-requests.service";

@Module({
  imports: [EmailModule],
  controllers: [DemoRequestsController, AdminDemoRequestsController],
  providers: [DemoRequestsService],
})
export class DemoRequestsModule {}
