import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { SentryModule } from "@sentry/nestjs/setup";
import { ServerErrorSentryFilter } from "./common/logging/server-error-sentry.filter";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { ClientIpThrottlerGuard } from "./common/http/client-ip-throttler.guard";
import { maskSensitiveUrl } from "./common/logging/mask-sensitive-url";
import { LoggerModule } from "nestjs-pino";
import { AuthCookieInterceptor } from "./common/auth/auth-cookie.interceptor";
import { CsrfGuard } from "./common/auth/csrf.guard";
import { RequestContextMiddleware } from "./common/logging/request-context.middleware";
import { TenantContextMiddleware } from "./common/tenant/tenant-context.middleware";
import { TenantContextInterceptor } from "./common/tenant/tenant-context.interceptor";
import { genRequestId } from "./common/logging/request-id";
import { PrismaModule } from "./common/prisma/prisma.module";
import { AdminAuditModule } from "./modules/admin-audit/admin-audit.module";
import { AdminAuthModule } from "./modules/admin-auth/admin-auth.module";
import { AdminCompaniesModule } from "./modules/admin-companies/admin-companies.module";
import { AdminSystemModule } from "./modules/admin-system/admin-system.module";
import { CronRegistryModule } from "./common/cron/cron-registry.module";
import { AiModule } from "./modules/ai/ai.module";
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
import { CompanyActivityModule } from "./modules/company-activity/company-activity.module";
import { CompanyDocsModule } from "./modules/company-docs/company-docs.module";
import { CompanyReportsModule } from "./modules/company-reports/company-reports.module";
import { CompanyReviewsModule } from "./modules/company-reviews/company-reviews.module";
import { CompanyListingTemplatesModule } from "./modules/company-listing-templates/company-listing-templates.module";
import { CompanySupplierTemplatesModule } from "./modules/company-supplier-templates/company-supplier-templates.module";
import { CompanyAffinityModule } from "./modules/company-affinity/company-affinity.module";
import { CompanyItemsModule } from "./modules/company-items/company-items.module";
import { CompanyListingsModule } from "./modules/company-listings/company-listings.module";
import { CompanyOrdersModule } from "./modules/company-orders/company-orders.module";
import { CompanyProfileModule } from "./modules/company-profile/company-profile.module";
import { CompanyDirectoryModule } from "./modules/company-directory/company-directory.module";
import { PublicInquiryModule } from "./modules/public-inquiry/public-inquiry.module";
import { PublicMarketplaceModule } from "./modules/public-marketplace/public-marketplace.module";
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
        // Correlation-id: gelen x-request-id'yi onurlandır/üret + response
        // header'ında dön (genRequestId). `req.id` buradan gelir.
        genReqId: genRequestId,
        // Access (completion) log'u da servis loglarıyla AYNI `reqId` alanını
        // taşısın → tek alandan grep. (Servis logları reqId'yi RequestContext
        // middleware'inin PinoLogger.assign'ından alır.)
        customProps: (req) => ({ reqId: (req as { id?: string }).id }),
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty", options: { singleLine: true } }
            : undefined,
        // Denetim 2026-08-23 #6: path/query'de taşınan davet/referral/sıfırlama
        // token'ları access-log'a düşmesin — url maskelenir (saf fonksiyon).
        serializers: {
          req: (req: Record<string, unknown>) => ({
            ...req,
            url: maskSensitiveUrl(req.url as string | undefined),
          }),
        },
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.headers[\"cf-connecting-ip\"]",
            'res.headers["set-cookie"]',
            "req.body.password",
            "req.body.currentPassword",
            "req.body.newPassword",
            "req.body.confirmPassword",
            "req.body.token",
            "req.body.code",
            "req.params.token",
            "req.query.token",
          ],
          censor: "[redacted]",
        },
        autoLogging: {
          ignore: (req: { url?: string }) =>
            (req.url ?? "").startsWith("/api/health"),
        },
      },
    }),
    // Kayan oturum: AuthCookieInterceptor (root) token doğrulama/yeniden
    // imzalama için JwtService ister — realm modülleriyle AYNI secret + TTL.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: config.get<string>("JWT_EXPIRES_IN", "1h"),
        },
      }),
    }),
    // Sentry (hata izleme) — Sentry.init instrument.ts'te; DSN yoksa no-op.
    SentryModule.forRoot(),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    // Global rate limiter. Etkin global tavan = "default" (100 req/60sn/IP).
    //
    // DİKKAT (footgun): @nestjs/throttler'da forRoot'taki HER isimli throttler
    // TÜM route'lara uygulanır — "auth" da global geçerli. Bu yüzden "auth"un
    // GLOBAL limiti YÜKSEK tutulur (non-binding), aksi halde işaretsiz tüm
    // endpoint'ler (ilan listesi, bildirim, profil…) bu tavana takılıp panel
    // sayfa açılışındaki istek patlamasında 429 alır.
    //
    // Hassas route'ların sıkılığı forRoot'tan DEĞİL, route üstündeki
    // @Throttle({ auth: { limit: 5, ttl } }) OVERRIDE'ından gelir (override her
    // zaman kazanır) → login/register/reset aynen sıkı kalır. THROTTLE_AUTH_LIMIT
    // yalnız bu global tavanı ayarlar; auth route override'larını etkilemez.
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60_000,
        limit: Number(process.env.THROTTLE_DEFAULT_LIMIT ?? 100),
      },
      {
        name: "auth",
        ttl: 60_000,
        limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 1000),
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
    AdminSystemModule,
    CronRegistryModule,
    // Birleşik firma sistemi
    CompanyAuthModule,
    CompanyBidDocumentsModule,
    CompanyListingDocumentsModule,
    CompanyUsersModule,
    CompanyActivityModule,
    CompanyAffinityModule,
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
    CompanyItemsModule,
    CompanyOrdersModule,
    CompanyInboxModule,
    CompanyMessagesModule,
    CompanyDashboardModule,
    CurrencyModule,
    CompanyQuestionTemplatesModule,
    CompanyDirectoryModule,
    PublicInquiryModule,
    PublicMarketplaceModule,
    PublicProfileModule,
    // Faz AI-0 — AI altyapısı (sağlayıcı adapteri + bütçe + kullanım ekranı)
    AiModule,
  ],
  providers: [
    // Global guard: @SkipThrottle ile özel endpoint'lerde bypass edilebilir.
    // Tracker = gerçek istemci IP'si (Cloudflare arkasında cf-connecting-ip).
    { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
    // CSRF çift-gönderim — cookie ile kimlik doğrulanan mutasyonları korur.
    { provide: APP_GUARD, useClass: CsrfGuard },
    // Token'lı yanıtlarda httpOnly oturum + CSRF cookie'lerini yazar.
    { provide: APP_INTERCEPTOR, useClass: AuthCookieInterceptor },
    // RLS Faz 1a: guard'lardan sonra req.user.companyId'yi tenant ALS'e yazar
    // (bugün hiçbir sorgu okumaz → davranış değişmez). bkz. common/tenant/*.
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    // Yakalanmamış istisnaları Sentry'e raporlar, sonra normal hata yanıtına
    // devreder (DSN yoksa capture no-op; yanıt davranışı değişmez).
    // Denetim 2026-08-27 Parça 11 #1: üst sınıf `'status' in exception` gördüğü
    // için ELLE ATILAN 5xx'leri de "beklenen" sayıp atlıyordu → alt sınıf
    // ≥500 HttpException'ları açıkça raporlar.
    { provide: APP_FILTER, useClass: ServerErrorSentryFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // nestjs-pino'nun middleware'i (LoggerModule) bundan ÖNCE kaydolur →
    // burada `req.id` + ALS store hazır. reqId'yi Pino context'ine + Sentry
    // isolation-scope'a bağlar. Health dahil tüm rotalara uygulanır (yeni log
    // satırı üretmez → health gürültüsü artmaz).
    // TenantContextMiddleware ÖNCE: als.run tüm isteği (RequestContext dahil
    // guard/interceptor/handler) sarar → tenant bağlamı her yerde erişilebilir.
    consumer
      .apply(TenantContextMiddleware, RequestContextMiddleware)
      .forRoutes("*");
  }
}
