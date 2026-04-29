import { Module } from "@nestjs/common";
import { AdminDemoRequestsController } from "./admin-demo-requests.controller";
import { DemoRequestsController } from "./demo-requests.controller";
import { DemoRequestsService } from "./demo-requests.service";

@Module({
  controllers: [DemoRequestsController, AdminDemoRequestsController],
  providers: [DemoRequestsService],
})
export class DemoRequestsModule {}
