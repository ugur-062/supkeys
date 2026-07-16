/**
 * KRİTİK KANIT — isolation-scope reqId tag'i async bağlamda taşınıyor mu?
 *
 * Middleware `Sentry.getIsolationScope().setTag("request_id", reqId)` basar.
 * `reportToSentry` çağrıları (audit [AUDIT-KRİTİK-KAYIP], webhook imza) ise
 * middleware'den SONRAKİ async bağlamda çalışır. @sentry/nestjs isolation
 * scope'u AsyncLocalStorage ile taşır → tag orada da görünmeli. Asıl korele
 * etmek istediğimiz alarmlar bunlar; reqId'siz kalırlarsa özellik boşa gider.
 *
 * Bu spec GERÇEK çağrı yerlerini (AuditService.log + WebhookSignatureGuard)
 * `withIsolationScope` içinde tetikler ve yakalanan Sentry event'inde
 * `request_id` tag'ini doğrular. Ağ yok: beforeSend event'i yakalar + null
 * döndürür (transport'a hiç ulaşmaz).
 *
 * `require` (import değil) — çünkü instrument.ts, sentryEnabled'ı import ANINDA
 * env'den hesaplar; SENTRY_DSN'i require'dan ÖNCE set etmeliyiz (import
 * hoisting'i buna izin vermez).
 */
const ORIG_DSN = process.env.SENTRY_DSN;
process.env.SENTRY_DSN = "https://examplePublicKey@o0.ingest.test/0";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Sentry = require("@sentry/nestjs") as typeof import("@sentry/nestjs");
// instrument.ts'i require et → sentryEnabled=true (DSN set) + reportToSentry gerçek.
require("../../src/instrument");
const {
  AuditService,
} = require("../../src/modules/audit/audit.service") as typeof import("../../src/modules/audit/audit.service");
const {
  WebhookSignatureGuard,
} = require("../../src/modules/resend-webhook/guards/webhook-signature.guard") as typeof import("../../src/modules/resend-webhook/guards/webhook-signature.guard");

type CapturedEvent = { message?: string; tags?: Record<string, unknown> };
const captured: CapturedEvent[] = [];

beforeAll(() => {
  // Client'ı DEĞİŞTİR: beforeSend event'i yakalar (tag assert'i için), no-op
  // transport ağı TAMAMEN keser (drop edilen event'lerin client-report'ları
  // dahil hiçbir şey gerçek host'a gitmez), sendClientReports:false ek güvence.
  Sentry.init({
    dsn: "https://examplePublicKey@o0.ingest.test/0",
    sendClientReports: false,
    beforeSend: (event) => {
      captured.push(event as CapturedEvent);
      return null;
    },
    transport: () =>
      ({
        send: async () => ({ statusCode: 200 }),
        flush: async () => true,
      }) as never,
  });
});

afterAll(async () => {
  await Sentry.close();
  if (ORIG_DSN === undefined) delete process.env.SENTRY_DSN;
  else process.env.SENTRY_DSN = ORIG_DSN;
});

beforeEach(() => {
  captured.length = 0;
});

/** İsteğin awaited servis zincirini taklit eden async derinlik. */
async function deepAsync<T>(depth: number, fn: () => T): Promise<T> {
  await Promise.resolve();
  if (depth <= 0) return fn();
  return deepAsync(depth - 1, fn);
}

describe("isolation-scope reqId — async propagation mekanizması", () => {
  it("withIsolationScope içinde set edilen tag, awaited derinlikte AYNI scope'tan okunur", async () => {
    await Sentry.withIsolationScope(async () => {
      Sentry.getIsolationScope().setTag("request_id", "req-als");
      const seen = await deepAsync(
        5,
        () => Sentry.getIsolationScope().getScopeData().tags.request_id,
      );
      expect(seen).toBe("req-als");
    });
  });

  it("reportToSentry (jenerik), nested async'te isolation-scope reqId tag'ini taşır", async () => {
    const {
      reportToSentry,
    } = require("../../src/instrument") as typeof import("../../src/instrument");
    await Sentry.withIsolationScope(async () => {
      Sentry.getIsolationScope().setTag("request_id", "req-generic");
      await deepAsync(4, () =>
        reportToSentry("jenerik test mesajı", "warning", {
          tags: { probe: "x" },
        }),
      );
    });
    await Sentry.flush(2000);
    const ev = captured.find((e) => e.message === "jenerik test mesajı");
    expect(ev).toBeDefined();
    expect(ev!.tags!.request_id).toBe("req-generic");
  });
});

describe("GERÇEK çağrı yerleri reqId tag'ini taşıyor", () => {
  it("audit.service.ts [AUDIT-KRİTİK-KAYIP] — critical iz yazımı çökünce reportToSentry reqId taşır", async () => {
    const failingPrisma = {
      auditLog: {
        create: jest.fn().mockRejectedValue(new Error("db down")),
      },
    };
    const audit = new AuditService(failingPrisma as never);

    await Sentry.withIsolationScope(async () => {
      Sentry.getIsolationScope().setTag("request_id", "req-audit");
      // Gerçek akış: log() → prisma.create reject → catch → reportToSentry.
      await audit.log({
        action: "company.listing.awarded",
        actorType: "company",
        actorId: "u1",
        entityType: "company_order",
        entityId: "o1",
        critical: true,
      });
    });
    await Sentry.flush(2000);

    const ev = captured.find(
      (e) => typeof e.message === "string" && e.message.includes("[AUDIT-KRİTİK-KAYIP]"),
    );
    expect(ev).toBeDefined();
    expect(ev!.tags!.request_id).toBe("req-audit");
    // Bağlam bozulmadı: greplenebilir marker + action da event'te.
    expect(ev!.tags!.action).toBe("company.listing.awarded");
  });

  it("webhook-signature.guard.ts — secret misconfig reportToSentry reqId taşır", async () => {
    // Secret yok + production → misconfig dalı: reportToSentry + 401.
    const guard = new WebhookSignatureGuard({
      get: (k: string) => ({ NODE_ENV: "production" } as Record<string, string>)[k],
    } as never);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, rawBody: undefined }),
      }),
    } as never;

    Sentry.withIsolationScope(() => {
      Sentry.getIsolationScope().setTag("request_id", "req-webhook");
      // canActivate SENKRON → reportToSentry aynı isolation-scope içinde çalışır.
      expect(() => guard.canActivate(ctx)).toThrow();
    });
    await Sentry.flush(2000);

    const ev = captured.find(
      (e) => e.message === "Webhook secret yapılandırılmamış",
    );
    expect(ev).toBeDefined();
    expect(ev!.tags!.request_id).toBe("req-webhook");
    expect(ev!.tags!.webhook).toBe("misconfig");
  });
});
