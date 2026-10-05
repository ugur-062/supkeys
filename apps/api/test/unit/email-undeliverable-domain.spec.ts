jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));

// renderEmail React Email dynamic-import kullanıyor → jest'te patlar; render bu
// testin konusu değil.
jest.mock("@rothern/email", () => ({
  ...jest.requireActual("@rothern/email"),
  renderEmail: jest.fn().mockResolvedValue({ subject: "S", html: "<p>p</p>", text: "p" }),
}));

import { reportToSentry } from "../../src/instrument";
import {
  EMAIL_LOG_HANDLED_WHERE,
  EMAIL_SKIPPED_SUPPRESSED_PREFIX,
  EmailService,
} from "../../src/modules/email/email.service";
import { undeliverableEmailReason } from "../../src/modules/email/undeliverable-domain";

/**
 * Teslim edilemez alan adı kapısı (canlı öncesi son tur): staging tohum
 * adreslerine (`demir@demofill.local`) giden bildirimler ortak Resend alan
 * adında bounce üretiyordu. Kapı sağlayıcıyı HİÇ çağırmaz, suppression gibi
 * FAILED + `suppressed:` yazar, yeniden denemez, alarm üretmez.
 */
describe("undeliverableEmailReason", () => {
  it.each([
    "demir@demofill.local",
    "a@firma.test",
    "a@x.invalid",
    "a@foo.example",
    "a@host.localhost",
    "a@svc.internal",
    "A@DEMOFILL.LOCAL",
    "  a@firma.local  ",
    "a@firma.local.",
  ])("özel kullanımlı TLD engellenir: %s", (email) => {
    expect(undeliverableEmailReason(email)).toMatch(/özel kullanımlı alan adı \(\.\w+\)/);
  });

  it.each(["a@example.com", "a@example.net", "a@example.org", "a@mail.example.com", "a@Example.COM"])(
    "örnek alan adı (alt alan adı dahil) engellenir: %s",
    (email) => {
      expect(undeliverableEmailReason(email)).toMatch(/örnek alan adı \(example\.(com|net|org)\)/);
    },
  );

  it.each(["a@localhost", "root@intranet", "a@b"])("noktasız alan adı engellenir: %s", (email) => {
    expect(undeliverableEmailReason(email)).toBe("noktasız alan adı");
  });

  it.each(["", "plain", "@firma.com", "a@"])("alan adı olmayan adres engellenir: %j", (email) => {
    expect(undeliverableEmailReason(email)).toMatch(/geçersiz adres/);
  });

  it("boş etiketli alan adı engellenir", () => {
    expect(undeliverableEmailReason("a@firma..com")).toBe("geçersiz alan adı");
    expect(undeliverableEmailReason("a@.com")).toBe("geçersiz alan adı");
  });

  it.each([
    "u@x.com",
    "ali@firma.com",
    "qa.alici+satinalmaci@gmail.com",
    "achats@societe.fr",
    "info@firma.com.tr",
    "a@examples.com",
    "a@myexample.com",
    "a@example.co.uk",
    "a@local.com",
    "a@test.com.tr",
    "a@testing.io",
  ])("gerçek alan adı geçer: %s", (email) => {
    expect(undeliverableEmailReason(email)).toBeNull();
  });

  it("neden metni adresin yerel kısmını İÇERMEZ (PII)", () => {
    expect(undeliverableEmailReason("gizli.kisi@demofill.local")).not.toContain("gizli");
  });
});

function makeService(clientSend = jest.fn().mockResolvedValue({ providerMessageId: "pm1" })) {
  const prisma = {
    emailLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "log1" }),
      update: jest.fn().mockResolvedValue({}),
    },
    emailOptOut: { findFirst: jest.fn().mockResolvedValue(null) },
    referralOptOut: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const config = { get: jest.fn(), getOrThrow: jest.fn() };
  const svc = new EmailService(config as never, prisma as never);
  (svc as unknown as { client: unknown }).client = { send: clientSend };
  (svc as unknown as { providerName: string }).providerName = "resend";
  return { svc, prisma, clientSend };
}

const email = (to: string, contextType = "listing_bid_received") =>
  ({
    to: { email: to, name: "Demir" },
    subject: "S",
    templateData: {
      template: "notification" as const,
      data: { subject: "S", heading: "H", paragraphs: ["p"] },
    },
    context: { type: contextType, id: "ctx1" },
    locale: "tr",
  }) as never;

describe("EmailService — teslim edilemez alan adı kapısı", () => {
  beforeEach(() => (reportToSentry as jest.Mock).mockClear());

  it("tohum adresi (.local) sağlayıcıya GİTMEZ; suppressed: önekli FAILED satırı yazılır", async () => {
    const { svc, prisma, clientSend } = makeService();
    const res = await svc.send(email("demir@demofill.local"));

    expect(res).toEqual({ emailLogId: "log1", sent: false });
    expect(clientSend).not.toHaveBeenCalled();
    // Suppression/çıkış sorgularına bile gitmez (saf kapı, en başta).
    expect(prisma.emailLog.findFirst).not.toHaveBeenCalled();
    expect(prisma.emailOptOut.findFirst).not.toHaveBeenCalled();
    expect(prisma.emailLog.update).not.toHaveBeenCalled();
    expect(prisma.emailLog.create).toHaveBeenCalledTimes(1);
    const data = prisma.emailLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      toEmail: "demir@demofill.local",
      status: "FAILED",
      attemptCount: 0,
      contextType: "listing_bid_received",
      contextId: "ctx1",
      locale: "tr",
      provider: "resend",
    });
    expect(data.errorMessage.startsWith(EMAIL_SKIPPED_SUPPRESSED_PREFIX)).toBe(true);
    expect(data.errorMessage).toContain("teslim edilemez alan adı");
    expect(data.errorMessage).toContain(".local");
    expect(data.payload).toBeUndefined();
    expect(data.failedAt).toBeInstanceOf(Date);
  });

  it("satır tekillik süzgecinde 'denendi' sayılır (zamanlayıcı her turda yeni satır yazmaz)", async () => {
    const { svc, prisma } = makeService();
    await svc.send(email("a@example.com"));
    const { errorMessage } = prisma.emailLog.create.mock.calls[0][0].data;
    const prefixes = EMAIL_LOG_HANDLED_WHERE.OR.flatMap((c) =>
      "errorMessage" in c && c.errorMessage ? [c.errorMessage.startsWith] : [],
    );
    expect(prefixes.some((p) => errorMessage.startsWith(p))).toBe(true);
  });

  it("kritik bağlamda (email_verify) bile Sentry alarmı ÜRETMEZ ve hata fırlatmaz", async () => {
    const { svc, clientSend } = makeService();
    await expect(svc.send(email("yeni@firma.test", "email_verify"))).resolves.toMatchObject({ sent: false });
    expect(clientSend).not.toHaveBeenCalled();
    expect(reportToSentry).not.toHaveBeenCalled();
  });

  it("gerçek adres (gmail artı adresi) normal yoldan gönderilir", async () => {
    const { svc, prisma, clientSend } = makeService();
    const res = await svc.send(email("qa.alici+satinalmaci@gmail.com"));
    expect(res).toEqual({ emailLogId: "log1", sent: true });
    expect(clientSend).toHaveBeenCalledTimes(1);
    expect(prisma.emailLog.create.mock.calls[0][0].data.status).toBe("SENDING");
    expect(prisma.emailLog.update.mock.calls[0][0].data.status).toBe("SENT");
  });
});
