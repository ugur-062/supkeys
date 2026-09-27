jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));
jest.mock("@rothern/email", () => ({
  ...jest.requireActual("@rothern/email"),
  renderEmail: jest.fn().mockResolvedValue({ subject: "S", html: "<p>p</p>", text: "p" }),
}));

import { renderEmail } from "@rothern/email";
import { EmailService } from "../../src/modules/email/email.service";
import { EmailUnsubscribeService } from "../../src/modules/email/email-unsubscribe.service";
import { signUnsubscribeToken } from "../../src/modules/email/unsubscribe-token";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

/**
 * TEK TIK ÇIKIŞ sözleşmesi (2026-09-27, teslim edilebilirlik Faz 0):
 *  - işlem dışı e-posta RFC 8058 başlıkları + alt bilgi bağlantısı taşır,
 *    işlem e-postası taşımaz
 *  - çıkış kullanıcıda tercih anahtarına, kullanıcı olmayan adreste
 *    email_opt_outs'a, davet kapsamında referral_opt_outs'a yazılır
 *  - çıkmış adrese o tür GİTMEZ; Ayarlar'da yeniden açmak kaydı kaldırır
 *  - GET hiçbir şey değiştirmez
 */
const SECRET = "integration-secret";
const config = {
  get: jest.fn((k: string) => (k === "JWT_SECRET" ? SECRET : k === "WEB_URL" ? "https://www.rothern.com" : undefined)),
  getOrThrow: jest.fn(),
};

function makeEmail() {
  const send = jest.fn().mockResolvedValue({ providerMessageId: "m1" });
  const svc = new EmailService(config as never, prisma as never);
  (svc as unknown as { client: unknown }).client = { send };
  (svc as unknown as { providerName: string }).providerName = "resend";
  return { svc, send };
}

const unsub = () => new EmailUnsubscribeService(config as never, prisma as never, prisma as never);

const mail = (to: string, type: string) =>
  ({
    to: { email: to },
    subject: "S",
    locale: "en",
    templateData: { template: "notification", data: { subject: "S", heading: "H", paragraphs: ["p"] } },
    context: { type, id: "ctx1" },
  }) as never;

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
  (renderEmail as jest.Mock).mockClear();
});

describe("EmailService — çıkış başlıkları", () => {
  it("bildirim (categoryMatch) → List-Unsubscribe + One-Click + alt bilgi bağlantıları", async () => {
    const { svc, send } = makeEmail();
    await svc.send(mail("tedarik@firma.com", "listing_category_match"));
    const headers = send.mock.calls[0][0].headers as Record<string, string>;
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(headers["List-Unsubscribe"]).toMatch(/^<https:\/\/www\.rothern\.com\/api\/email\/unsubscribe\?t=[A-Za-z0-9_-]+>$/);
    const env = (renderEmail as jest.Mock).mock.calls[0][2];
    // Sayfa bağlantısı e-postanın dilinde (EN yolu), tercih sayfası da.
    expect(env.unsubscribeUrl).toMatch(/^https:\/\/www\.rothern\.com\/en\/email-preferences\?t=/);
    expect(env.preferencesUrl).toBe("https://www.rothern.com/en/company/settings/notifications");
  });

  it("işlem e-postası (email_verify) çıkış başlığı TAŞIMAZ", async () => {
    const { svc, send } = makeEmail();
    await svc.send(mail("u@firma.com", "email_verify"));
    expect(send.mock.calls[0][0].headers).toBeUndefined();
    expect((renderEmail as jest.Mock).mock.calls[0][2].unsubscribeUrl).toBeUndefined();
  });

  it("davet akışında tercih bağlantısı yok (kayıtsız adres)", async () => {
    const { svc } = makeEmail();
    await svc.send(mail("dis@firma.com", "tender_external_invite"));
    const env = (renderEmail as jest.Mock).mock.calls[0][2];
    expect(env.unsubscribeUrl).toBeDefined();
    expect(env.preferencesUrl).toBeUndefined();
  });
});

describe("EmailUnsubscribeService", () => {
  it("kullanıcı olmayan adres (billingEmail) → email_opt_outs; o tür artık GİTMEZ, başka tür gider", async () => {
    const { svc, send } = makeEmail();
    const token = signUnsubscribeToken({ email: "muhasebe@firma.com", scope: "categoryMatch", locale: "tr" }, SECRET);
    // GET değiştirmez
    expect((await unsub().describe(token)).unsubscribed).toBe(false);
    expect(await prisma.emailOptOut.count()).toBe(0);

    await unsub().unsubscribe(token);
    expect((await unsub().describe(token)).unsubscribed).toBe(true);

    const blocked = await svc.send(mail("muhasebe@firma.com", "listing_category_match"));
    expect(blocked.sent).toBe(false);
    const other = await svc.send(mail("muhasebe@firma.com", "listing_invitation"));
    expect(other.sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("kayıtlı kullanıcı → notificationPrefs'e yazılır (Ayarlar aynı değeri görür)", async () => {
    const { user } = await makeCompanyWithUser(prisma);
    const token = signUnsubscribeToken({ email: user.email, scope: "reminder", locale: "tr" }, SECRET);
    await unsub().unsubscribe(token);
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: user.id }, select: { notificationPrefs: true } });
    expect(row.notificationPrefs).toMatchObject({ reminder: false });
    expect(await prisma.emailOptOut.count()).toBe(0);
  });

  it("'tümü' → kullanıcının bütün tercihleri kapanır + karşılama serisi durur", async () => {
    const { user } = await makeCompanyWithUser(prisma);
    const token = signUnsubscribeToken({ email: user.email, scope: "categoryMatch", locale: "tr" }, SECRET);
    await unsub().unsubscribe(token, true);
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: user.id }, select: { notificationPrefs: true } });
    expect(row.notificationPrefs).toMatchObject({ categoryMatch: false, invitation: false, announcement: false });
    expect(await prisma.emailOptOut.findFirst({ where: { email: user.email.toLowerCase(), scope: "lifecycle" } })).not.toBeNull();
  });

  it("davet kapsamı → referral_opt_outs (mevcut davet frenleri aynı tabloyu okur)", async () => {
    const token = signUnsubscribeToken({ email: "Dis@Firma.com", scope: "invite", locale: "en" }, SECRET);
    await unsub().unsubscribe(token);
    expect(await prisma.referralOptOut.findUnique({ where: { email: "dis@firma.com" } })).not.toBeNull();
    const { svc } = makeEmail();
    expect((await svc.send(mail("dis@firma.com", "tender_external_invite"))).sent).toBe(false);
  });

  it("geçersiz jeton → 400", async () => {
    await expect(unsub().unsubscribe("bozuk")).rejects.toMatchObject({ status: 400 });
    await expect(unsub().describe(undefined)).rejects.toMatchObject({ status: 400 });
  });
});
