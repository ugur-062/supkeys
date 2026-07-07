import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AuthCookieInterceptor } from "./common/auth/auth-cookie.interceptor";
import { CsrfGuard } from "./common/auth/csrf.guard";
import { PrismaModule } from "./common/prisma/prisma.module";
import { AdminAuditModule } from "./modules/admin-audit/admin-audit.module";
import { AdminAuthModule } from "./modules/admin-auth/admin-auth.module";
import { AdminCompaniesModule } from "./modules/admin-companies/admin-companies.module";
import { AuditModule } from "./modules/audit/audit.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { CompanyAuthModule } from "./modules/company-auth/company-auth.module";
import { CompanyBidDocumentsModule } from "./modules/company-bid-documents/company-bid-documents.module";
import { CompanyListingDocumentsModule } from "./modules/company-listing-documents/company-listing-documents.module";
import { CompanyBlocksModule } from "./modules/company-blocks/company-blocks.module";
import { CompanyComplaintsModule } from "./modules/company-complaints/company-complaints.module";
import { CompanyConnectionsModule } from "./modules/company-connections/company-connections.module";
import { CompanyDashboardModule } from "./modules/company-dashboard/company-dashboard.module";
import { CurrencyModule } from "./modules/currency/currency.module";
import { CompanyInboxModule } from "./modules/company-inbox/company-inbox.module";
import { CompanyMessagesModule } from "./modules/company-messages/company-messages.module";
import { CompanyQuestionTemplatesModule } from "./modules/company-question-templates/company-question-templates.module";
import { CompanyAddressesModule } from "./modules/company-addresses/company-addresses.module";
import { CompanyBankAccountsModule } from "./modules/company-bank-accounts/company-bank-accounts.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { CompanyApprovalsModule } from "./modules/company-approvals/company-approvals.module";
import { CompanyDocsModule } from "./modules/company-docs/company-docs.module";
import { CompanyReportsModule } from "./modules/company-reports/company-reports.module";
import { CompanyReviewsModule } from "./modules/company-reviews/company-reviews.module";
import { CompanyListingTemplatesModule } from "./modules/company-listing-templates/company-listing-templates.module";
import { CompanySupplierTemplatesModule } from "./modules/company-supplier-templates/company-supplier-templates.module";
import { CompanyListingsModule } from "./modules/company-listings/company-listings.module";
import { CompanyOrdersModule } from "./modules/company-orders/company-orders.module";
import { CompanyProfileModule } from "./modules/company-profile/company-profile.module";
import { PublicProfileModule } from "./modules/public-profile/public-profile.module";
import { CompanyUsersModule } from "./modules/company-users/company-users.module";
import { EmailModule } from "./modules/email/email.module";
import { HealthModule } from "./modules/health/health.module";
import { NotificationModule } from "./modules/notifications/notification.module";
import { PasswordResetModule } from "./modules/password-reset/password-reset.module";
import { ResendWebhookModule } from "./modules/resend-webhook/resend-webhook.module";
import { StorageModule } from "./modules/storage/storage.module";
import { SupabaseAuthModule } from "./modules/supabase-auth/supabase-auth.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env"],
    }),
    // Structured logger (Pino) — prod'da JSON, dev'de okunur pretty; hassas
    // alanlar redaction ile maskelenir. Health check gürültüsü loglanmaz.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty", options: { singleLine: true } }
            : undefined,
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            'res.headers["set-cookie"]',
            "req.body.password",
            "req.body.currentPassword",
            "req.body.newPassword",
            "req.body.confirmPassword",
            "req.body.token",
            "req.body.code",
          ],
          censor: "[redacted]",
        },
        autoLogging: {
          ignore: (req: { url?: string }) =>
            (req.url ?? "").startsWith("/api/health"),
        },
      },
    }),
    // Sentry (hata izleme) — Sentry.init instrument.ts'te; DSN yoksa no-op.
    SentryModule.forRoot(),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    // Global rate limiter. Default: 100 req / 60sn / IP. Login/register'da
    // @Throttle("auth") override ile daha sıkı. Dev'de THROTTLE_DEFAULT_LIMIT.
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
    PrismaModule,
    // Altyapı (paylaşılan)
    SupabaseAuthModule,
    EmailModule,
    StorageModule,
    ResendWebhookModule,
    CategoriesModule,
    PasswordResetModule,
    AuditModule,
    HealthModule,
    // Admin
    AdminAuthModule,
    AdminAuditModule,
    AdminCompaniesModule,
    // Birleşik firma sistemi
    CompanyAuthModule,
    CompanyBidDocumentsModule,
    CompanyListingDocumentsModule,
    CompanyUsersModule,
    CompanyProfileModule,
    CompanyConnectionsModule,
    CompanyBlocksModule,
    CompanyComplaintsModule,
    CompanyListingsModule,
    NotificationModule,
    CompanyApprovalsModule,
    CompanyAddressesModule,
    CompanyBankAccountsModule,
    RealtimeModule,
    CompanyReportsModule,
    CompanyReviewsModule,
    CompanyDocsModule,
    CompanyListingTemplatesModule,
    CompanySupplierTemplatesModule,
    CompanyOrdersModule,
    CompanyInboxModule,
    CompanyMessagesModule,
    CompanyDashboardModule,
    CurrencyModule,
    CompanyQuestionTemplatesModule,
    PublicProfileModule,
  ],
  providers: [
    // Global guard: @SkipThrottle ile özel endpoint'lerde bypass edilebilir.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // CSRF çift-gönderim — cookie ile kimlik doğrulanan mutasyonları korur.
    { provide: APP_GUARD, useClass: CsrfGuard },
    // Token'lı yanıtlarda httpOnly oturum + CSRF cookie'lerini yazar.
    { provide: APP_INTERCEPTOR, useClass: AuthCookieInterceptor },
    // Yakalanmamış istisnaları Sentry'e raporlar, sonra normal hata yanıtına
    // devreder (DSN yoksa capture no-op; yanıt davranışı değişmez).
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
