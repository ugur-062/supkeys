jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));

import { reportToSentry } from "../../src/instrument";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import {
  ResendEventService,
  normalizeBounceType,
} from "../../src/modules/resend-webhook/services/resend-event.service";
import type { ResendWebhookEvent } from "../../src/modules/resend-webhook/services/resend-event.service";
import { prisma, truncateAll } from "./test-db";

/**
 * Kritik-context (email_verify/password_reset/login_2fa) e-postası KALICI teslim
 * başarısızlığı alınca (webhook) ops alarmı. Gönderim başarılıydı, bounce async
 * geldi → EmailLog güncellenir ama typo'lu/şikayetçi adres = kullanıcı kalıcı
 * mahsur. `reportToSentry` mock'la doğrulanır (Sentry/DSN gerekmez).
 */
const svc = new ResendEventService(prisma as never);
const mockSentry = reportToSentry as jest.Mock;

let seq = 0;
async function makeLog(contextType: string | null): Promise<string> {
  const providerMessageId = `pmid-${seq++}`;
  await prisma.emailLog.create({
    data: {
      template: contextType ?? "generic",
      toEmail: "typo@exampl.com",
      subject: "S",
      provider: "resend",
      providerMessageId,
      status: "SENT",
      contextType,
      contextId: contextType ? "ctx-1" : null,
    },
  });
  return providerMessageId;
}

/**
 * Resend'in GERÇEK email.bounced yükü (SES terminolojisi):
 * `bounce: { type: "Permanent" | "Transient" | "Undetermined", subType, message }`
 * — "hard"/"soft" hiç gelmez (derin denetim Y-09).
 */
function event(
  providerMessageId: string,
  type: "email.bounced" | "email.complained",
  bounceType?: string,
  subType = "General",
): ResendWebhookEvent {
  return {
    type,
    created_at: "2026-07-19T10:00:00.000Z",
    data: {
      email_id: providerMessageId,
      to: ["typo@exampl.com"],
      ...(type === "email.bounced"
        ? {
            bounce: {
              type: bounceType,
              subType,
              message: "The recipient's email address does not exist.",
            },
          }
        : {}),
    },
  };
}

beforeEach(async () => {
  await truncateAll();
  mockSentry.mockClear();
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("webhook — kritik-context bounce/complaint alarmı", () => {
  it("Permanent-bounce + kritik context (password_reset) → reportToSentry", async () => {
    const pmid = await makeLog("password_reset");
    await svc.handleEvent(event(pmid, "email.bounced", "Permanent"), "evt-1");

    expect(mockSentry).toHaveBeenCalledTimes(1);
    const [msg, level, ctx] = mockSentry.mock.calls[0];
    expect(msg).toBe("[EMAIL-KRİTİK-BOUNCE]");
    expect(level).toBe("error");
    expect(ctx.tags).toMatchObject({
      email: "critical-hard-bounce",
      context: "password_reset",
    });
    // PII yok: e-posta adresi extra'da GEÇMEZ.
    expect(JSON.stringify(ctx.extra)).not.toContain("typo@exampl.com");
    expect(ctx.extra).toMatchObject({ contextType: "password_reset", bounceType: "hard" });
  });

  it("complaint + kritik context (login_2fa) → reportToSentry (critical-complaint)", async () => {
    const pmid = await makeLog("login_2fa");
    await svc.handleEvent(event(pmid, "email.complained"), "evt-2");

    expect(mockSentry).toHaveBeenCalledTimes(1);
    expect(mockSentry.mock.calls[0][2].tags.email).toBe("critical-complaint");
  });

  it("Transient-bounce + kritik context → alarm YOK (geçici)", async () => {
    const pmid = await makeLog("email_verify");
    await svc.handleEvent(event(pmid, "email.bounced", "Transient"), "evt-3");
    expect(mockSentry).not.toHaveBeenCalled();
  });

  it("hard-bounce + NON-kritik context → alarm YOK", async () => {
    const pmid = await makeLog("order_status_changed");
    await svc.handleEvent(event(pmid, "email.bounced", "Permanent"), "evt-4");
    expect(mockSentry).not.toHaveBeenCalled();
  });

  it("context'siz (contextType null) hard-bounce → alarm YOK", async () => {
    const pmid = await makeLog(null);
    await svc.handleEvent(event(pmid, "email.bounced", "Permanent"), "evt-5");
    expect(mockSentry).not.toHaveBeenCalled();
  });

  it("duplicate event → çift alarm YOK (idempotency erken döner)", async () => {
    const pmid = await makeLog("password_reset");
    await svc.handleEvent(event(pmid, "email.bounced", "Permanent"), "evt-dup");
    await svc.handleEvent(event(pmid, "email.bounced", "Permanent"), "evt-dup");
    expect(mockSentry).toHaveBeenCalledTimes(1);
  });
});

describe("normalizeBounceType — Resend SES terimleri → hard/soft/undetermined", () => {
  it.each([
    ["Permanent", "hard"],
    ["permanent", "hard"],
    ["PERMANENT", "hard"],
    ["hard", "hard"],
    ["Transient", "soft"],
    ["soft", "soft"],
    ["Undetermined", "undetermined"],
    ["undetermined", "undetermined"],
    ["SomethingNew", "undetermined"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeBounceType(raw)).toBe(expected);
  });

  it.each([[undefined], [null], [""], ["  "]])("%p → null", (raw) => {
    expect(normalizeBounceType(raw as string | null | undefined)).toBeNull();
  });
});

describe("webhook — bounceType normalize yazılır (gönderim bastırma/fren tüketicileri 'hard' sorgular)", () => {
  it("Permanent → EmailLog + EmailEvent bounceType='hard', ham tip payload'da kalır, adres suppress", async () => {
    const pmid = await makeLog("order_status_changed");
    await svc.handleEvent(event(pmid, "email.bounced", "Permanent", "Suppressed"), "evt-perm");

    const log = await prisma.emailLog.findUniqueOrThrow({ where: { providerMessageId: pmid } });
    expect(log.status).toBe("BOUNCED");
    expect(log.bounceType).toBe("hard");
    expect(log.bounceReason).toBe("The recipient's email address does not exist.");

    const ev = await prisma.emailEvent.findUniqueOrThrow({ where: { eventId: "evt-perm" } });
    expect(ev.bounceType).toBe("hard");
    expect((ev.payload as { data: { bounce: { type: string; subType: string } } }).data.bounce)
      .toMatchObject({ type: "Permanent", subType: "Suppressed" });

    // Tüketici: gönderim öncesi / admin bastırma sorgusu ("BOUNCED"+"hard").
    const suppression = new EmailSuppressionService(prisma as never);
    const map = await suppression.getSuppressionStatus(["typo@exampl.com"]);
    expect(map.get("typo@exampl.com")?.status).toBe("BOUNCED");
  });

  it("Transient → bounceType='soft', adres suppress EDİLMEZ", async () => {
    const pmid = await makeLog(null);
    await svc.handleEvent(event(pmid, "email.bounced", "Transient", "MailboxFull"), "evt-trans");

    const log = await prisma.emailLog.findUniqueOrThrow({ where: { providerMessageId: pmid } });
    expect(log.bounceType).toBe("soft");
    const suppression = new EmailSuppressionService(prisma as never);
    expect((await suppression.getSuppressionStatus(["typo@exampl.com"])).size).toBe(0);
  });

  it("Undetermined → bounceType='undetermined', alarm YOK", async () => {
    const pmid = await makeLog("email_verify");
    await svc.handleEvent(event(pmid, "email.bounced", "Undetermined"), "evt-und");

    const log = await prisma.emailLog.findUniqueOrThrow({ where: { providerMessageId: pmid } });
    expect(log.bounceType).toBe("undetermined");
    expect(mockSentry).not.toHaveBeenCalled();
  });
});
