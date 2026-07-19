jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));

import { reportToSentry } from "../../src/instrument";
import { ResendEventService } from "../../src/modules/resend-webhook/services/resend-event.service";
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

function event(
  providerMessageId: string,
  type: "email.bounced" | "email.complained",
  bounceType?: "hard" | "soft" | "undetermined",
): ResendWebhookEvent {
  return {
    type,
    created_at: "2026-07-19T10:00:00.000Z",
    data: {
      email_id: providerMessageId,
      to: ["typo@exampl.com"],
      ...(type === "email.bounced"
        ? { bounce: { type: bounceType, reason: "mailbox not found" } }
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
  it("hard-bounce + kritik context (password_reset) → reportToSentry", async () => {
    const pmid = await makeLog("password_reset");
    await svc.handleEvent(event(pmid, "email.bounced", "hard"), "evt-1");

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

  it("soft-bounce + kritik context → alarm YOK (geçici)", async () => {
    const pmid = await makeLog("email_verify");
    await svc.handleEvent(event(pmid, "email.bounced", "soft"), "evt-3");
    expect(mockSentry).not.toHaveBeenCalled();
  });

  it("hard-bounce + NON-kritik context → alarm YOK", async () => {
    const pmid = await makeLog("order_status_changed");
    await svc.handleEvent(event(pmid, "email.bounced", "hard"), "evt-4");
    expect(mockSentry).not.toHaveBeenCalled();
  });

  it("context'siz (contextType null) hard-bounce → alarm YOK", async () => {
    const pmid = await makeLog(null);
    await svc.handleEvent(event(pmid, "email.bounced", "hard"), "evt-5");
    expect(mockSentry).not.toHaveBeenCalled();
  });

  it("duplicate event → çift alarm YOK (idempotency erken döner)", async () => {
    const pmid = await makeLog("password_reset");
    await svc.handleEvent(event(pmid, "email.bounced", "hard"), "evt-dup");
    await svc.handleEvent(event(pmid, "email.bounced", "hard"), "evt-dup");
    expect(mockSentry).toHaveBeenCalledTimes(1);
  });
});
