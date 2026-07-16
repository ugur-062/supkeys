jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));
jest.mock("@rothern/email", () => ({
  ...jest.requireActual("@rothern/email"),
  renderEmail: jest
    .fn()
    .mockResolvedValue({ subject: "S", html: "<p>p</p>", text: "p" }),
}));

import { EmailService } from "../../src/modules/email/email.service";

/**
 * Commit 5: davet token'ları (referral_invite / company_user_invitation)
 * EmailLog.payload'da REDAKTE olmalı — admin log görüntüleyen token'ı okuyup
 * daveti kabul edememeli.
 */
function makeService() {
  const created: Array<{ payload: unknown }> = [];
  const prisma = {
    emailLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: { data: { payload: unknown } }) => {
        created.push(data);
        return { id: "log1" };
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const svc = new EmailService(
    { get: jest.fn(), getOrThrow: jest.fn() } as never,
    prisma as never,
  );
  (svc as unknown as { client: unknown }).client = {
    send: jest.fn().mockResolvedValue({ providerMessageId: "m1" }),
  };
  (svc as unknown as { providerName: string }).providerName = "resend";
  return { svc, created };
}

const TOKEN = "SECRET-INVITE-TOKEN-123";
const send = (svc: EmailService, contextType: string) =>
  svc.send({
    to: { email: "u@x.com", name: "U" },
    subject: "S",
    templateData: {
      template: "notification",
      data: {
        subject: "S",
        heading: "H",
        paragraphs: ["p"],
        ctaUrl: `https://app.rothern.com/company/davet/${TOKEN}`,
      },
    },
    context: { type: contextType, id: "id1" },
  } as never);

describe("EmailService — davet token redaksiyonu (Commit 5)", () => {
  it("referral_invite → payload REDAKTE (token sızmaz)", async () => {
    const { svc, created } = makeService();
    await send(svc, "referral_invite");
    expect(JSON.stringify(created[0].payload)).not.toContain(TOKEN);
    expect(created[0].payload).toHaveProperty("__redacted");
  });

  it("company_user_invitation → payload REDAKTE", async () => {
    const { svc, created } = makeService();
    await send(svc, "company_user_invitation");
    expect(JSON.stringify(created[0].payload)).not.toContain(TOKEN);
    expect(created[0].payload).toHaveProperty("__redacted");
  });

  it("non-redakte tip (order_status_changed) → payload DOLU kalır", async () => {
    const { svc, created } = makeService();
    await send(svc, "order_status_changed");
    expect(JSON.stringify(created[0].payload)).toContain(TOKEN);
    expect(created[0].payload).not.toHaveProperty("__redacted");
  });
});
