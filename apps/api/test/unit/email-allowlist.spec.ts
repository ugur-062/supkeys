jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));

// renderEmail React Email dynamic-import kullanıyor → jest'te patlar; çizim
// sonucu sabit (konu "Rendered S" — satıra çizilen konunun yazıldığını sınar).
jest.mock("@rothern/email", () => ({
  ...jest.requireActual("@rothern/email"),
  renderEmail: jest.fn().mockResolvedValue({ subject: "Rendered S", html: "<p>p</p>", text: "p" }),
}));

import { reportToSentry } from "../../src/instrument";
import {
  EMAIL_LOG_HANDLED_WHERE,
  EMAIL_SKIPPED_ALLOWLIST_REASON,
  EMAIL_SKIPPED_SUPPRESSED_PREFIX,
  EmailService,
} from "../../src/modules/email/email.service";
import { EMAIL_ALLOWLIST_ENV, parseEmailAllowlist } from "../../src/modules/email/email-allowlist";

/**
 * Staging alıcı izin listesi (2026-10-05, sahip kararı): staging'in test
 * e-postaları Gmail'de Rothern'i Promosyonlar'a düşürüyordu. `EMAIL_ALLOWLIST`
 * doluysa listede olmayan alıcıya giden e-posta sağlayıcıya GİTMEZ ama satır
 * konu + payload ile yazılır (e2e içeriği günlükten okur). Boş = kapı yok.
 */
describe("parseEmailAllowlist", () => {
  it.each([undefined, null, "", "   ", " , ,\n"])("boş/tanımsız değer kapı kurmaz: %j", (raw) => {
    expect(parseEmailAllowlist(raw)).toBeNull();
  });

  it("tam adres eşleşir; büyük/küçük harf ve boşluk önemsiz", () => {
    const list = parseEmailAllowlist("  Uguray156@Gmail.com ,ops@firma.com ")!;
    expect(list.size).toBe(2);
    expect(list.allows("uguray156@gmail.com")).toBe(true);
    expect(list.allows("UGURAY156@GMAIL.COM")).toBe(true);
    expect(list.allows("  ops@FIRMA.com ")).toBe(true);
    expect(list.allows("baska@gmail.com")).toBe(false);
  });

  it("artı adresi BİREBİR eşleşir: ana adres girdisi artı adresini kapsamaz, tersi de", () => {
    const list = parseEmailAllowlist("uguray156@gmail.com,uguray156+qa-alici-kurucu@gmail.com")!;
    expect(list.allows("uguray156+qa-alici-kurucu@gmail.com")).toBe(true);
    expect(list.allows("Uguray156+QA-Alici-Kurucu@gmail.com")).toBe(true);
    expect(list.allows("uguray156+qa-alici-satisci@gmail.com")).toBe(false);
    expect(list.allows("uguray156+x@gmail.com")).toBe(false);
    expect(parseEmailAllowlist("uguray156+qa-alici-kurucu@gmail.com")!.allows("uguray156@gmail.com")).toBe(false);
  });

  it("joker alan adı: *@firma.com yalnız o alan adını kapsar (alt alan adı / benzer ad değil)", () => {
    const list = parseEmailAllowlist("*@Firma.com")!;
    expect(list.allows("ali@firma.com")).toBe(true);
    expect(list.allows("Veli+teklif@FIRMA.COM")).toBe(true);
    expect(list.allows("ali@mail.firma.com")).toBe(false);
    expect(list.allows("ali@firma.com.tr")).toBe(false);
    expect(list.allows("ali@xfirma.com")).toBe(false);
  });

  it("yerel kısımda joker: uguray156+qa-kayit-*@gmail.com yalnız o öneki kapsar", () => {
    const list = parseEmailAllowlist("uguray156@gmail.com, uguray156+qa-kayit-*@gmail.com")!;
    expect(list.allows("uguray156+qa-kayit-mgx81a@gmail.com")).toBe(true);
    expect(list.allows("uguray156+qa-kayit-@gmail.com")).toBe(true);
    expect(list.allows("uguray156+qa-alici-kurucu@gmail.com")).toBe(false);
    expect(list.allows("uguray156+qa-kayit-x@evil.com")).toBe(false);
    // Joker `@`'yi aşmaz.
    expect(list.allows("uguray156+qa-kayit-a@b@gmail.com")).toBe(false);
  });

  it("regex özel karakterleri düz metin sayılır (nokta herhangi bir karakter değildir)", () => {
    const list = parseEmailAllowlist("a.b@firma.com,*@x.io")!;
    expect(list.allows("a.b@firma.com")).toBe(true);
    expect(list.allows("aXb@firma.com")).toBe(false);
    expect(list.allows("a@xXio")).toBe(false);
  });

  it("geçersiz girdi atlanır ve sayılır; geçerli girdi kalmazsa kapı KAPALI kalır (herkese göndermez)", () => {
    const mixed = parseEmailAllowlist("firma.com, @firma.com, a@, a@b@c.com, ok@firma.com")!;
    expect(mixed.size).toBe(1);
    expect(mixed.invalid).toBe(4);
    expect(mixed.allows("ok@firma.com")).toBe(true);

    const none = parseEmailAllowlist("firma.com")!;
    expect(none).not.toBeNull();
    expect(none.size).toBe(0);
    expect(none.allows("ali@firma.com")).toBe(false);
  });

  it("noktalı virgül ve satır sonu da ayraç sayılır", () => {
    const list = parseEmailAllowlist("a@firma.com;\nb@firma.com")!;
    expect(list.size).toBe(2);
    expect(list.allows("b@firma.com")).toBe(true);
  });
});

function makeService(allowlist: string | undefined, clientSend = jest.fn().mockResolvedValue({ providerMessageId: "pm1" })) {
  const prisma = {
    emailLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "log1" }),
      update: jest.fn().mockResolvedValue({}),
    },
    emailOptOut: { findFirst: jest.fn().mockResolvedValue(null) },
    referralOptOut: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const config = {
    get: jest.fn((key: string) => (key === EMAIL_ALLOWLIST_ENV ? allowlist : undefined)),
    getOrThrow: jest.fn(),
  };
  const svc = new EmailService(config as never, prisma as never);
  (svc as unknown as { client: unknown }).client = { send: clientSend };
  (svc as unknown as { providerName: string }).providerName = "resend";
  return { svc, prisma, clientSend, config };
}

const email = (to: string, contextType = "listing_bid_received") =>
  ({
    to: { email: to, name: "Demir" },
    subject: "S",
    templateData: {
      template: "notification" as const,
      data: { subject: "S", heading: "H", paragraphs: ["p"], ctaUrl: "https://staging.supkeys.com/x", ctaLabel: "Aç" },
    },
    context: { type: contextType, id: "ctx1" },
    locale: "tr",
  }) as never;

describe("EmailService — alıcı izin listesi (EMAIL_ALLOWLIST)", () => {
  beforeEach(() => (reportToSentry as jest.Mock).mockClear());

  it.each([undefined, ""])("değişken boşken (%j, canlı) her alıcıya normal gönderilir", async (raw) => {
    const { svc, prisma, clientSend } = makeService(raw);
    const res = await svc.send(email("kimse@firma.com"));
    expect(res).toEqual({ emailLogId: "log1", sent: true });
    expect(clientSend).toHaveBeenCalledTimes(1);
    expect(prisma.emailLog.update.mock.calls[0][0].data.status).toBe("SENT");
  });

  it("değer süreç açılışında BİR KEZ okunur (gönderim başına değil)", async () => {
    const { svc, config } = makeService("*@firma.com");
    const reads = () => config.get.mock.calls.filter(([k]) => k === EMAIL_ALLOWLIST_ENV).length;
    expect(reads()).toBe(1);
    await svc.send(email("a@firma.com"));
    await svc.send(email("b@baska.com"));
    expect(reads()).toBe(1);
  });

  it("listedeki alıcı (tam adres, harf farkıyla) normal yoldan gönderilir", async () => {
    const { svc, clientSend } = makeService("uguray156@gmail.com");
    await expect(svc.send(email("Uguray156@Gmail.com"))).resolves.toEqual({ emailLogId: "log1", sent: true });
    expect(clientSend).toHaveBeenCalledTimes(1);
  });

  it("listedeki alıcı (joker alan adı) normal yoldan gönderilir", async () => {
    const { svc, clientSend } = makeService("*@firma.com");
    await expect(svc.send(email("ali@firma.com"))).resolves.toMatchObject({ sent: true });
    expect(clientSend).toHaveBeenCalledTimes(1);
  });

  it("listede olmayan alıcı sağlayıcıya GİTMEZ; satır konu + payload ile yazılır, suppressed: allowlist ile kapanır", async () => {
    const { svc, prisma, clientSend } = makeService("uguray156@gmail.com, uguray156+qa-kayit-*@gmail.com");
    const res = await svc.send(email("uguray156+qa-alici-kurucu@gmail.com"));

    expect(res).toEqual({ emailLogId: "log1", sent: false, skipReason: "allowlist" });
    expect(clientSend).not.toHaveBeenCalled();

    // Çizim ve günlük bugünkü gibi: payload dolu satır açılır…
    expect(prisma.emailLog.create).toHaveBeenCalledTimes(1);
    const created = prisma.emailLog.create.mock.calls[0][0].data;
    expect(created.payload).toMatchObject({ paragraphs: ["p"], ctaUrl: "https://staging.supkeys.com/x" });
    expect(created.toEmail).toBe("uguray156+qa-alici-kurucu@gmail.com");

    // …ve çizilen konuyla, deneme 0, FAILED + ayrı nedenle kapanır.
    expect(prisma.emailLog.update).toHaveBeenCalledTimes(1);
    const updated = prisma.emailLog.update.mock.calls[0][0];
    expect(updated.where).toEqual({ id: "log1" });
    expect(updated.data).toMatchObject({
      status: "FAILED",
      subject: "Rendered S",
      errorMessage: EMAIL_SKIPPED_ALLOWLIST_REASON,
      attemptCount: 0,
    });
    expect(updated.data.failedAt).toBeInstanceOf(Date);
    expect(EMAIL_SKIPPED_ALLOWLIST_REASON.startsWith(`${EMAIL_SKIPPED_SUPPRESSED_PREFIX} allowlist`)).toBe(true);
    // Neden adres içermez (PII).
    expect(updated.data.errorMessage).not.toContain("uguray156");
  });

  it("atlanan satır tekillik süzgecinde 'denendi' sayılır (zamanlayıcı her turda yeni satır yazmaz)", () => {
    const prefixes = EMAIL_LOG_HANDLED_WHERE.OR.flatMap((c) =>
      "errorMessage" in c && c.errorMessage ? [c.errorMessage.startsWith] : [],
    );
    expect(prefixes.some((p) => EMAIL_SKIPPED_ALLOWLIST_REASON.startsWith(p))).toBe(true);
  });

  it("kritik bağlamda (email_verify) yeniden deneme / Sentry alarmı yok, hata fırlatmaz", async () => {
    const clientSend = jest.fn().mockRejectedValue(Object.assign(new Error("rate"), { statusCode: 429 }));
    const { svc } = makeService("uguray156@gmail.com", clientSend);
    await expect(svc.send(email("yeni@firma.com", "email_verify"))).resolves.toMatchObject({
      sent: false,
      skipReason: "allowlist",
    });
    expect(clientSend).not.toHaveBeenCalled();
    expect(reportToSentry).not.toHaveBeenCalled();
  });

  it("hassas bağlamda payload yine maskeli yazılır (izin listesi redaksiyonu atlatmaz)", async () => {
    const { svc, prisma } = makeService("uguray156@gmail.com");
    await svc.send(email("yeni@firma.com", "password_reset"));
    expect(prisma.emailLog.create.mock.calls[0][0].data.payload).toEqual({
      __redacted: expect.any(String),
    });
  });

  it("teslim edilemez alan adı önce gelir: kendi nedeniyle, çizimsiz atlanır", async () => {
    const { svc, prisma } = makeService("uguray156@gmail.com");
    const res = await svc.send(email("demir@demofill.local"));
    expect(res).toMatchObject({ sent: false, skipReason: "undeliverable" });
    expect(prisma.emailLog.update).not.toHaveBeenCalled();
    expect(prisma.emailLog.create.mock.calls[0][0].data.errorMessage).toContain("undeliverable domain");
  });

  it("geçerli girdisi olmayan değer kapıyı kapalı tutar: hiçbir alıcıya gönderilmez", async () => {
    const { svc, clientSend } = makeService("gmail.com");
    await expect(svc.send(email("uguray156@gmail.com"))).resolves.toMatchObject({ sent: false, skipReason: "allowlist" });
    expect(clientSend).not.toHaveBeenCalled();
  });
});
