import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./common/prisma/prisma.module";
import { AdminApplicationsModule } from "./modules/admin-applications/admin-applications.module";
import { AdminAuthModule } from "./modules/admin-auth/admin-auth.module";
import { AuthModule } from "./modules/auth/auth.module";
import { DemoRequestsModule } from "./modules/demo-requests/demo-requests.module";
import { EmailModule } from "./modules/email/email.module";
import { HealthModule } from "./modules/health/health.module";
import { RegistrationModule } from "./modules/registration/registration.module";
import { TenantSuppliersModule } from "./modules/tenant-suppliers/tenant-suppliers.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env"],
    }),
    PrismaModule,
    AuthModule,
    AdminAuthModule,
    EmailModule,
    DemoRequestsModule,
    RegistrationModule,
    AdminApplicationsModule,
    TenantSuppliersModule,
    HealthModule,
  ],
})
export class AppModule {}
