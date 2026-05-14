import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./common/prisma/prisma.module";
import { AdminApplicationsModule } from "./modules/admin-applications/admin-applications.module";
import { AdminAuthModule } from "./modules/admin-auth/admin-auth.module";
import { AuthModule } from "./modules/auth/auth.module";
import { PermissionsModule } from "./modules/auth/permissions/permissions.module";
import { DemoRequestsModule } from "./modules/demo-requests/demo-requests.module";
import { EmailModule } from "./modules/email/email.module";
import { HealthModule } from "./modules/health/health.module";
import { PublicInvitationsModule } from "./modules/public-invitations/public-invitations.module";
import { RegistrationModule } from "./modules/registration/registration.module";
import { SupplierAuthModule } from "./modules/supplier-auth/supplier-auth.module";
import { SupplierDashboardModule } from "./modules/supplier-dashboard/supplier-dashboard.module";
import { SupplierOrdersModule } from "./modules/supplier-orders/supplier-orders.module";
import { SupplierProfileModule } from "./modules/supplier-profile/supplier-profile.module";
import { SupplierSelfServiceModule } from "./modules/supplier-self-service/supplier-self-service.module";
import { SupplierTendersModule } from "./modules/supplier-tenders/supplier-tenders.module";
import { TenantAddressesModule } from "./modules/tenant-addresses/tenant-addresses.module";
import { AdminStatsModule } from "./modules/admin-stats/admin-stats.module";
import { AdminSuppliersModule } from "./modules/admin-suppliers/admin-suppliers.module";
import { AdminTenantsModule } from "./modules/admin-tenants/admin-tenants.module";
import { OrderPdfModule } from "./modules/order-pdf/order-pdf.module";
import { PdfModule } from "./modules/pdf/pdf.module";
import { ResendWebhookModule } from "./modules/resend-webhook/resend-webhook.module";
import { StorageModule } from "./modules/storage/storage.module";
import { AttachmentsModule } from "./modules/attachments/attachments.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { CurrencyModule } from "./modules/currency/currency.module";
import { MessagingModule } from "./modules/messaging/messaging.module";
import { TenantApprovalFlowsModule } from "./modules/tenant-approval-flows/tenant-approval-flows.module";
import { TenantApprovalRequestsModule } from "./modules/tenant-approval-requests/tenant-approval-requests.module";
import { TenantDashboardModule } from "./modules/tenant-dashboard/tenant-dashboard.module";
import { TenantOrdersModule } from "./modules/tenant-orders/tenant-orders.module";
import { TenantSuppliersModule } from "./modules/tenant-suppliers/tenant-suppliers.module";
import { TenantTendersModule } from "./modules/tenant-tenders/tenant-tenders.module";
import { TenantUsersModule } from "./modules/tenant-users/tenant-users.module";
import { TenderSchedulerModule } from "./modules/tender-scheduler/tender-scheduler.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env"],
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    // BUG FIX #4 — Global rate limiter. Default: 100 req / 60sn / IP.
    // Daha sıkı limitler login + register endpoint'lerinde @Throttle override ile.
    ThrottlerModule.forRoot([
      { name: "default", ttl: 60_000, limit: 100 },
      { name: "auth", ttl: 60_000, limit: 10 },
    ]),
    PdfModule,
    OrderPdfModule,
    PrismaModule,
    AuthModule,
    PermissionsModule,
    AdminAuthModule,
    SupplierAuthModule,
    EmailModule,
    DemoRequestsModule,
    RegistrationModule,
    AdminApplicationsModule,
    AdminStatsModule,
    AdminTenantsModule,
    AdminSuppliersModule,
    TenantSuppliersModule,
    SupplierSelfServiceModule,
    TenantTendersModule,
    SupplierTendersModule,
    TenantOrdersModule,
    SupplierOrdersModule,
    TenantDashboardModule,
    SupplierDashboardModule,
    SupplierProfileModule,
    TenantUsersModule,
    TenantAddressesModule,
    TenantApprovalFlowsModule,
    TenantApprovalRequestsModule,
    PublicInvitationsModule,
    TenderSchedulerModule,
    ResendWebhookModule,
    StorageModule,
    AttachmentsModule,
    CurrencyModule,
    MessagingModule,
    CategoriesModule,
    HealthModule,
  ],
  providers: [
    // Global guard: @SkipThrottle ile özel endpoint'lerde bypass edilebilir.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
