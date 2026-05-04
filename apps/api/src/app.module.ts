import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./common/prisma/prisma.module";
import { AdminApplicationsModule } from "./modules/admin-applications/admin-applications.module";
import { AdminAuthModule } from "./modules/admin-auth/admin-auth.module";
import { AuthModule } from "./modules/auth/auth.module";
import { DemoRequestsModule } from "./modules/demo-requests/demo-requests.module";
import { EmailModule } from "./modules/email/email.module";
import { HealthModule } from "./modules/health/health.module";
import { RegistrationModule } from "./modules/registration/registration.module";
import { SupplierAuthModule } from "./modules/supplier-auth/supplier-auth.module";
import { SupplierSelfServiceModule } from "./modules/supplier-self-service/supplier-self-service.module";
import { SupplierTendersModule } from "./modules/supplier-tenders/supplier-tenders.module";
import { TenantSuppliersModule } from "./modules/tenant-suppliers/tenant-suppliers.module";
import { TenantTendersModule } from "./modules/tenant-tenders/tenant-tenders.module";
import { TenderSchedulerModule } from "./modules/tender-scheduler/tender-scheduler.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env"],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    AdminAuthModule,
    SupplierAuthModule,
    EmailModule,
    DemoRequestsModule,
    RegistrationModule,
    AdminApplicationsModule,
    TenantSuppliersModule,
    SupplierSelfServiceModule,
    TenantTendersModule,
    SupplierTendersModule,
    TenderSchedulerModule,
    HealthModule,
  ],
})
export class AppModule {}
