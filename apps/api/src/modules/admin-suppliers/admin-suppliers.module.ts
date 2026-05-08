import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminSuppliersController } from "./controllers/admin-suppliers.controller";
import { AdminSuppliersService } from "./services/admin-suppliers.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminSuppliersController],
  providers: [AdminSuppliersService],
})
export class AdminSuppliersModule {}
