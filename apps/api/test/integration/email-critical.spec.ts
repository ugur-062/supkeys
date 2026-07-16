jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));

// renderEmail React Email dynamic-import kullanıyor → jest'te patlar; gönderim-
// hatası yolunu izole etmek için render'ı stub'la (render bu testin konusu değil).
jest.mock("@rothern/email", () => ({
  ...jest.requireActual("@rothern/email"),
  renderEmail: jest
    .fn()
    .mockResolvedValue({ subject: "S", html: "<p>p</p>", text: "p" }),
}));

import { reportToSentry } from "../../src/instrument";
import {
  EmailService,
  isCriticalEmailContext,
} from "../../src/modules/email/email.service";

/**
 * Commit 1 (1a) teyidi: kritik e-posta gönderim hatası → reportToSentry alarmı
 * (mock prisma + throw'a zorlanmış client; DB/Sentry gerekmez).
 */
function makeService(clientSend: jest.Mock) {
  const prisma = {
    emailLog: {
      findFirst: jest.fn().mockResolvedValue(null), // suppression yok, clear-marker yok
      create: jest.fn().mockResolvedValue({ id: "log1" }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const config = { get: jest.fn(), getOrThrow: jest.fn() };
  const svc = new EmailService(config as never, prisma as never);
  (svc as unknown as { client: unknown }).client = { send: clientSend };
  (svc as unknown as { providerName: string }).providerName = "resend";
  return { svc, prisma };
}

const email = (contextType: string) =>
  ({
    to: { email: "u@x.com", name: "U" },
    subject: "S",
    templateData: {
      template: "notification" as const,
      data: { subject: "S", heading: "H", paragraphs: ["p"] },
    },
    context: { type: contextType, id: "id1" },
  }) as never;

describe("EmailService — kritik gönderim hatası Sentry alarmı (1a)", () => {
  beforeEach(() => (reportToSentry as jest.Mock).mockClear());

  it("isCriticalEmailContext: erişim-kapılayan tipler true, diğerleri false", () => {
    expect(isCriticalEmailContext("email_verify")).toBe(true);
    expect(isCriticalEmailContext("password_reset")).toBe(true);
    expect(isCriticalEmailContext("login_2fa")).toBe(true);
    expect(isCriticalEmailContext("order_status_changed")).toBe(false);
    expect(isCriticalEmailContext("referral_invite")).toBe(false);
    expect(isCriticalEmailContext(undefined)).toBe(false);
  });

  it("kritik context (email_verify) gönderim hatası → reportToSentry + throw", async () => {
    const { svc } = makeService(
      jest.fn().mockRejectedValue(new Error("resend down")),
    );
    await expect(svc.send(email("email_verify"))).rejects.toThrow(/resend down/);
    expect(reportToSentry).toHaveBeenCalledTimes(1);
    expect(reportToSentry).toHaveBeenCalledWith(
      "[EMAIL-KRİTİK-GÖNDERİLEMEDİ]",
      "error",
      expect.objectContaining({
        tags: expect.objectContaining({ context: "email_verify" }),
      }),
    );
  });

  it("non-kritik context (order_status_changed) hatası → reportToSentry ÇAĞRILMAZ", async () => {
    const { svc } = makeService(
      jest.fn().mockRejectedValue(new Error("down")),
    );
    await expect(svc.send(email("order_status_changed"))).rejects.toThrow();
    expect(reportToSentry).not.toHaveBeenCalled();
  });

  it("PII sızmaz: Sentry çağrısında adres/gövde/kod YOK (yalnız log-id + context)", async () => {
    const { svc } = makeService(
      jest.fn().mockRejectedValue(new Error("down")),
    );
    await expect(svc.send(email("password_reset"))).rejects.toThrow();
    const arg = (reportToSentry as jest.Mock).mock.calls[0];
    const serialized = JSON.stringify(arg);
    expect(serialized).not.toContain("u@x.com"); // adres yok
    expect(serialized).toContain("log1"); // yalnız log-id
  });
});
