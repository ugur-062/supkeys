/**
 * Resend webhook — UÇTAN UCA kablolama (canlı öncesi sağlamlaştırma H5).
 *
 * `ResendEventService` ve `WebhookSignatureGuard` ayrı ayrı sınanıyordu; asıl
 * zincir (gövde ayrıştırıcının sakladığı HAM gövde → svix imza guard'ı →
 * controller → servis → DB) hiç koşmamıştı. Burada Nest uygulaması `main.ts`
 * ile AYNI kablolamayla açılır (`HTTP_BODY_APP_OPTIONS` + `configureBodyParser`
 * + global önek `api`) ve gerçek HTTP isteği atılır.
 *
 * İmza: svix `Webhook.sign` (Resend'in kullandığı şema) — bilinen test sırrı.
 */
jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));

import { Controller, Module, Post, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Webhook } from "svix";
import {
  configureBodyParser,
  HTTP_BODY_APP_OPTIONS,
  shouldKeepRawBody,
} from "../../src/common/http/body-parser";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import { ResendWebhookController } from "../../src/modules/resend-webhook/controllers/resend-webhook.controller";
import { ResendEventService } from "../../src/modules/resend-webhook/services/resend-event.service";
import { prisma, truncateAll } from "./test-db";

// svix sırrı: "whsec_" + base64 (yalnız test — gerçek sır değil).
const SECRET = `whsec_${Buffer.from("rothern-h5-webhook-test-secret").toString("base64")}`;
const OTHER_SECRET = `whsec_${Buffer.from("some-other-webhook-secret-xx").toString("base64")}`;

/** Ham gövdenin saklanıp saklanmadığını dışarıdan görmek için sonda ucu. */
@Controller("probe")
class RawBodyProbeController {
  @Post()
  probe(@Req() req: { rawBody?: Buffer; body?: unknown }): {
    hasRawBody: boolean;
    body: unknown;
  } {
    return { hasRawBody: Buffer.isBuffer(req.rawBody), body: req.body };
  }
}

const env: Record<string, string | undefined> = {
  RESEND_WEBHOOK_SECRET: SECRET,
  // Canlıdaki gibi: bypass yolu kapalı (ALLOW_INSECURE_WEBHOOK etkisiz).
  NODE_ENV: "production",
  ALLOW_INSECURE_WEBHOOK: "true",
};

@Module({
  controllers: [ResendWebhookController, RawBodyProbeController],
  providers: [
    ResendEventService,
    { provide: PrismaService, useValue: prisma },
    { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
  ],
})
class TestWebhookModule {}

let app: NestExpressApplication;
let base: string;
let seq = 0;

const ADDRESS = "bounce-target@firma.com";

async function makeLog(toEmail = ADDRESS): Promise<string> {
  const providerMessageId = `re_e2e_${Date.now()}_${seq++}`;
  await prisma.emailLog.create({
    data: {
      template: "listing_invitation",
      toEmail,
      subject: "S",
      provider: "resend",
      providerMessageId,
      status: "SENT",
    },
  });
  return providerMessageId;
}

/** Resend'in GERÇEK email.bounced yükü (SES terimleri: Permanent/Transient). */
function bouncedPayload(emailId: string, bounceType = "Permanent"): string {
  return JSON.stringify({
    type: "email.bounced",
    created_at: "2026-10-07T09:00:00.000Z",
    data: {
      email_id: emailId,
      from: "Rothern <bildirim@rothern.com>",
      to: [ADDRESS],
      subject: "S",
      bounce: {
        type: bounceType,
        subType: "General",
        message: "The recipient's email address does not exist.",
      },
    },
  });
}

function signedHeaders(
  body: string,
  opts: { id?: string; secret?: string; at?: Date } = {},
): Record<string, string> {
  const id = opts.id ?? `msg_e2e_${seq++}`;
  const at = opts.at ?? new Date();
  const signature = new Webhook(opts.secret ?? SECRET).sign(id, at, body);
  return {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": String(Math.floor(at.getTime() / 1000)),
    "svix-signature": signature,
  };
}

async function post(
  path: string,
  body: string,
  headers: Record<string, string>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}${path}`, { method: "POST", headers, body });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* gövde JSON değil */
  }
  return { status: res.status, json };
}

beforeAll(async () => {
  app = await NestFactory.create<NestExpressApplication>(TestWebhookModule, {
    logger: false,
    ...HTTP_BODY_APP_OPTIONS,
  });
  configureBodyParser(app);
  app.setGlobalPrefix("api");
  await app.listen(0);
  const port = (app.getHttpServer().address() as { port: number }).port;
  base = `http://127.0.0.1:${port}`;
}, 20000);

afterAll(async () => {
  await app?.close();
  await truncateAll();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll();
});

describe("Resend webhook uçtan uca — main.ts kablolamasıyla", () => {
  it("svix imzalı email.bounced (Permanent) → 200, EmailEvent yazılır, adres hard bounce ile bastırılır", async () => {
    const emailId = await makeLog();
    const body = bouncedPayload(emailId);
    const headers = signedHeaders(body, { id: "msg_bounce_ok" });

    const res = await post("/api/webhooks/resend", body, headers);

    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      ok: true,
      result: { status: "processed", eventType: "BOUNCED" },
    });

    const event = await prisma.emailEvent.findUnique({
      where: { eventId: "msg_bounce_ok" },
    });
    expect(event).not.toBeNull();
    expect(event).toMatchObject({ eventType: "BOUNCED", bounceType: "hard" });
    // Ham Resend tipi payload'da kalır (kolon normalize edilir).
    expect(
      (event!.payload as { data: { bounce: { type: string } } }).data.bounce
        .type,
    ).toBe("Permanent");

    const log = await prisma.emailLog.findUnique({
      where: { providerMessageId: emailId },
    });
    expect(log).toMatchObject({ status: "BOUNCED", bounceType: "hard" });
    expect(log!.bouncedAt?.toISOString()).toBe("2026-10-07T09:00:00.000Z");

    // Bastırma listesi (tek kaynak EmailSuppressionService — EmailLog'dan türer).
    const suppression = await new EmailSuppressionService(
      prisma as never,
    ).getSuppressionStatus([ADDRESS]);
    expect(suppression.get(ADDRESS)).toMatchObject({ status: "BOUNCED" });
    // Gönderim kapısının sorgusu (email.service.ts G-M2) da adresi yakalar.
    expect(
      await prisma.emailLog.count({
        where: { toEmail: ADDRESS, status: "BOUNCED", bounceType: "hard" },
      }),
    ).toBe(1);
  });

  it("Transient bounce → 200 ama adres BASTIRILMAZ (soft)", async () => {
    const emailId = await makeLog();
    const body = bouncedPayload(emailId, "Transient");
    const res = await post("/api/webhooks/resend", body, signedHeaders(body));

    expect(res.status).toBe(200);
    const log = await prisma.emailLog.findUnique({
      where: { providerMessageId: emailId },
    });
    expect(log).toMatchObject({ status: "BOUNCED", bounceType: "soft" });
    const suppression = await new EmailSuppressionService(
      prisma as never,
    ).getSuppressionStatus([ADDRESS]);
    expect(suppression.has(ADDRESS)).toBe(false);
  });

  it("yanlış imza (başka sırla imzalı) → 401, hiçbir şey yazılmaz", async () => {
    const emailId = await makeLog();
    const body = bouncedPayload(emailId);
    const res = await post(
      "/api/webhooks/resend",
      body,
      signedHeaders(body, { secret: OTHER_SECRET }),
    );

    expect(res.status).toBe(401);
    expect(await prisma.emailEvent.count()).toBe(0);
    const log = await prisma.emailLog.findUnique({
      where: { providerMessageId: emailId },
    });
    expect(log!.status).toBe("SENT");
  });

  it("gövdesi değiştirilmiş istek (imza özgün gövdeye ait) → 401, hiçbir şey yazılmaz", async () => {
    const emailId = await makeLog();
    const victim = await makeLog("baska-kisi@firma.com");
    const original = bouncedPayload(emailId);
    const headers = signedHeaders(original);
    // Saldırgan geçerli imzayı başka bir e-postanın olayına takmaya çalışır.
    const tampered = original.replace(emailId, victim);
    expect(tampered).not.toBe(original);

    const res = await post("/api/webhooks/resend", tampered, headers);

    expect(res.status).toBe(401);
    expect(await prisma.emailEvent.count()).toBe(0);
    expect(await prisma.emailLog.count({ where: { status: "BOUNCED" } })).toBe(0);
  });

  it("anlamca aynı ama baytları farklı gövde (boşluk eklenmiş) → 401 — imza HAM gövdeye bağlı", async () => {
    const emailId = await makeLog();
    const original = bouncedPayload(emailId);
    const headers = signedHeaders(original);
    const reformatted = JSON.stringify(JSON.parse(original), null, 2);

    const res = await post("/api/webhooks/resend", reformatted, headers);

    expect(res.status).toBe(401);
    expect(await prisma.emailEvent.count()).toBe(0);
  });

  it("svix başlıkları eksik → 401", async () => {
    const emailId = await makeLog();
    const body = bouncedPayload(emailId);
    const res = await post("/api/webhooks/resend", body, {
      "content-type": "application/json",
    });
    expect(res.status).toBe(401);
    expect(await prisma.emailEvent.count()).toBe(0);
  });

  it("eski zaman damgalı (yeniden oynatılan) geçerli imza → 401", async () => {
    const emailId = await makeLog();
    const body = bouncedPayload(emailId);
    const headers = signedHeaders(body, {
      at: new Date(Date.now() - 60 * 60 * 1000),
    });
    const res = await post("/api/webhooks/resend", body, headers);
    expect(res.status).toBe(401);
    expect(await prisma.emailEvent.count()).toBe(0);
  });

  it("aynı svix-id iki kez → ikisi de 200, olay BİR kez yazılır (idempotent)", async () => {
    const emailId = await makeLog();
    const body = bouncedPayload(emailId);
    const headers = signedHeaders(body, { id: "msg_dup" });

    const first = await post("/api/webhooks/resend", body, headers);
    const second = await post("/api/webhooks/resend", body, headers);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.json).toMatchObject({
      result: { status: "skipped", reason: "duplicate_event" },
    });
    expect(await prisma.emailEvent.count()).toBe(1);
  });

  it("sorgu dizgili ve sonu '/' ile biten URL'de de ham gövde saklanır → 200", async () => {
    const a = await makeLog();
    const bodyA = bouncedPayload(a);
    const resA = await post(
      "/api/webhooks/resend?x=1",
      bodyA,
      signedHeaders(bodyA),
    );
    expect(resA.status).toBe(200);

    const b = await makeLog();
    const bodyB = bouncedPayload(b);
    const resB = await post(
      "/api/webhooks/resend/",
      bodyB,
      signedHeaders(bodyB),
    );
    expect(resB.status).toBe(200);
    expect(await prisma.emailEvent.count()).toBe(2);
  });

  it("eşleşen EmailLog yoksa imza geçerliyse 200 + skipped (svix yeniden denemesin)", async () => {
    const body = bouncedPayload("re_bilinmeyen");
    const res = await post("/api/webhooks/resend", body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      result: { status: "skipped", reason: "email_log_not_found" },
    });
  });

  it("webhook DIŞI uçta ham gövde saklanmaz (bellekte ikinci kopya yok), gövde yine ayrıştırılır", async () => {
    const res = await post("/api/probe", JSON.stringify({ a: 1 }), {
      "content-type": "application/json",
    });
    expect(res.status).toBe(201);
    expect(res.json).toEqual({ hasRawBody: false, body: { a: 1 } });
  });

  it("urlencoded gövde ayrıştırılmaz (JSON-only API — form CSRF yüzeyi kapalı)", async () => {
    const res = await post("/api/probe", "a=1&b=2", {
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(res.json.hasRawBody).toBe(false);
    expect(res.json.body ?? {}).toEqual({});
  });
});

describe("shouldKeepRawBody — yol eşleşmesi", () => {
  it("yalnız webhook yolu (sorgu ve sondaki '/' yok sayılır)", () => {
    expect(shouldKeepRawBody("/api/webhooks/resend")).toBe(true);
    expect(shouldKeepRawBody("/api/webhooks/resend?x=1")).toBe(true);
    expect(shouldKeepRawBody("/api/webhooks/resend/")).toBe(true);
    expect(shouldKeepRawBody("/api/webhooks/resend/extra")).toBe(false);
    expect(shouldKeepRawBody("/api/webhooks/resendx")).toBe(false);
    expect(shouldKeepRawBody("/api/company-auth/login")).toBe(false);
    expect(shouldKeepRawBody("/api/probe?next=/api/webhooks/resend")).toBe(false);
    expect(shouldKeepRawBody(undefined)).toBe(false);
  });
});
