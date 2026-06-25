import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./common/prisma/prisma.module";
import { AdminApplicationsModule } from "./modules/admin-applications/admin-applications.module";
import { AdminAuthModule } from "./modules/admin-auth/admin-auth.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AdminCompaniesModule } from "./modules/admin-companies/admin-companies.module";
import { CompanyAuthModule } from "./modules/company-auth/company-auth.module";
import { CompanyBlocksModule } from "./modules/company-blocks/company-blocks.module";
import { CompanyComplaintsModule } from "./modules/company-complaints/company-complaints.module";
import { CompanyConnectionsModule } from "./modules/company-connections/company-connections.module";
import { CompanyInboxModule } from "./modules/company-inbox/company-inbox.module";
import { CompanyListingsModule } from "./modules/company-listings/company-listings.module";
import { CompanyOrdersModule } from "./modules/company-orders/company-orders.module";
import { CompanyProfileModule } from "./modules/company-profile/company-profile.module";
import { CompanyUsersModule } from "./modules/company-users/company-users.module";
import { PermissionsModule } from "./modules/auth/permissions/permissions.module";
import { DemoRequestsModule } from "./modules/demo-requests/demo-requests.module";
import { EmailModule } from "./modules/email/email.module";
import { HealthModule } from "./modules/health/health.module";
import { OrderPaymentsModule } from "./modules/order-payments/order-payments.module";
import { PublicInvitationsModule } from "./modules/public-invitations/public-invitations.module";
import { PublicSupplierProfileModule } from "./modules/public-supplier-profile/public-supplier-profile.module";
import { TenantPublicProfileModule } from "./modules/tenant-public-profile/tenant-public-profile.module";
import { SupplierReviewsModule } from "./modules/supplier-reviews/supplier-reviews.module";
import { RegistrationModule } from "./modules/registration/registration.module";
import { SupabaseAuthModule } from "./modules/supabase-auth/supabase-auth.module";
import { SupplierAccountModule } from "./modules/supplier-account/supplier-account.module";
import { SupplierPublicInvitationsModule } from "./modules/supplier-public-invitations/supplier-public-invitations.module";
import { SupplierAuthModule } from "./modules/supplier-auth/supplier-auth.module";
import { SupplierBanksModule } from "./modules/supplier-banks/supplier-banks.module";
import { SupplierCertificatesModule } from "./modules/supplier-certificates/supplier-certificates.module";
import { SupplierDashboardModule } from "./modules/supplier-dashboard/supplier-dashboard.module";
import { SupplierOrdersModule } from "./modules/supplier-orders/supplier-orders.module";
import { SupplierProfileModule } from "./modules/supplier-profile/supplier-profile.module";
import { SupplierSelfServiceModule } from "./modules/supplier-self-service/supplier-self-service.module";
import { SupplierTendersModule } from "./modules/supplier-tenders/supplier-tenders.module";
import { TenantAddressesModule } from "./modules/tenant-addresses/tenant-addresses.module";
import { AdminAuditModule } from "./modules/admin-audit/admin-audit.module";
import { AdminConnectionsModule } from "./modules/admin-connections/admin-connections.module";
import { AdminInterventionsModule } from "./modules/admin-interventions/admin-interventions.module";
import { AdminMessagesModule } from "./modules/admin-messages/admin-messages.module";
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
import { TenantReportsModule } from "./modules/tenant-reports/tenant-reports.module";
import { TenantSuppliersModule } from "./modules/tenant-suppliers/tenant-suppliers.module";
import { TenantTendersModule } from "./modules/tenant-tenders/tenant-tenders.module";
import { TenantTemplatesModule } from "./modules/tenant-templates/tenant-templates.module";
import { TenantOnboardingModule } from "./modules/tenant-onboarding/tenant-onboarding.module";
import { AdminCompanyVerificationsModule } from "./modules/admin-company-verifications/admin-company-verifications.module";
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
    // Test/dev için THROTTLE_DEFAULT_LIMIT env ile geçici olarak yükseltilebilir.
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60_000,
        limit: Number(process.env.THROTTLE_DEFAULT_LIMIT ?? 100),
      },
      {
        name: "auth",
        ttl: 60_000,
        limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 10),
      },
    ]),
    PdfModule,
    OrderPdfModule,
    PrismaModule,
    AuthModule,
    PermissionsModule,
    AdminAuthModule,
    CompanyAuthModule,
    AdminCompaniesModule,
    CompanyBlocksModule,
    CompanyComplaintsModule,
    CompanyConnectionsModule,
    CompanyInboxModule,
    CompanyListingsModule,
    CompanyOrdersModule,
    CompanyProfileModule,
    CompanyUsersModule,
    SupabaseAuthModule,
    SupplierAuthModule,
    SupplierAccountModule,
    SupplierPublicInvitationsModule,
    EmailModule,
    DemoRequestsModule,
    RegistrationModule,
    AdminApplicationsModule,
    AdminStatsModule,
    AdminTenantsModule,
    AdminSuppliersModule,
    AdminAuditModule,
    AdminConnectionsModule,
    AdminInterventionsModule,
    AdminMessagesModule,
    TenantSuppliersModule,
    SupplierSelfServiceModule,
    TenantTendersModule,
    SupplierTendersModule,
    TenantOrdersModule,
    SupplierOrdersModule,
    OrderPaymentsModule,
    TenantDashboardModule,
    TenantReportsModule,
    TenantTemplatesModule,
    TenantOnboardingModule,
    AdminCompanyVerificationsModule,
    SupplierDashboardModule,
    SupplierProfileModule,
    SupplierBanksModule,
    SupplierCertificatesModule,
    TenantUsersModule,
    TenantAddressesModule,
    TenantApprovalFlowsModule,
    TenantApprovalRequestsModule,
    PublicInvitationsModule,
    PublicSupplierProfileModule,
    TenantPublicProfileModule,
    SupplierReviewsModule,
    TenderSchedulerModule,
    ResendWebhookModule,
    StorageModule,
    AttachmentsModule,
    CurrencyModule,
    MessagingModule,
    CategoriesModule,
    HealthModule,
    AuditModule,
  ],
  providers: [
    // Global guard: @SkipThrottle ile özel endpoint'lerde bypass edilebilir.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
