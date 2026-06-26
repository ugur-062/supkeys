import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./common/prisma/prisma.module";
import { AdminAuditModule } from "./modules/admin-audit/admin-audit.module";
import { AdminAuthModule } from "./modules/admin-auth/admin-auth.module";
import { AdminCompaniesModule } from "./modules/admin-companies/admin-companies.module";
import { AuditModule } from "./modules/audit/audit.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { CompanyAuthModule } from "./modules/company-auth/company-auth.module";
import { CompanyBidDocumentsModule } from "./modules/company-bid-documents/company-bid-documents.module";
import { CompanyBlocksModule } from "./modules/company-blocks/company-blocks.module";
import { CompanyComplaintsModule } from "./modules/company-complaints/company-complaints.module";
import { CompanyConnectionsModule } from "./modules/company-connections/company-connections.module";
import { CompanyInboxModule } from "./modules/company-inbox/company-inbox.module";
import { CompanyMessagesModule } from "./modules/company-messages/company-messages.module";
import { CompanyListingTemplatesModule } from "./modules/company-listing-templates/company-listing-templates.module";
import { CompanyListingsModule } from "./modules/company-listings/company-listings.module";
import { CompanyOrdersModule } from "./modules/company-orders/company-orders.module";
import { CompanyProfileModule } from "./modules/company-profile/company-profile.module";
import { CompanyUsersModule } from "./modules/company-users/company-users.module";
import { EmailModule } from "./modules/email/email.module";
import { HealthModule } from "./modules/health/health.module";
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
    CompanyUsersModule,
    CompanyProfileModule,
    CompanyConnectionsModule,
    CompanyBlocksModule,
    CompanyComplaintsModule,
    CompanyListingsModule,
    CompanyListingTemplatesModule,
    CompanyOrdersModule,
    CompanyInboxModule,
    CompanyMessagesModule,
  ],
  providers: [
    // Global guard: @SkipThrottle ile özel endpoint'lerde bypass edilebilir.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
