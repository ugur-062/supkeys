jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));
jest.mock("@rothern/email", () => ({
  ...jest.requireActual("@rothern/email"),
  renderEmail: jest.fn().mockResolvedValue({ subject: "S", html: "<p>p</p>", text: "p" }),
}));

import { renderEmail } from "@rothern/email";
import { EmailService } from "../../src/modules/email/email.service";
import { EmailUnsubscribeService } from "../../src/modules/email/email-unsubscribe.service";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "../../src/modules/email/unsubscribe-token";
import {
  COLD_INVITE_LIST_UNSUBSCRIBE_HEADER_ENV,
  INVITE_CONTEXT_TYPES,
  resolveStreamSenders,
} from "../../src/modules/email/email-streams";
import { AdminEmailLogsService } from "../../src/modules/email/admin-email-logs.service";
import { NOTIFICATION_PREF_KEYS } from "../../src/common/notifications/notification-prefs";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

/**
 * TEK TIK ÇIKIŞ sözleşmesi (2026-09-27, teslim edilebilirlik Faz 0):
 *  - işlem dışı e-posta RFC 8058 başlıkları + alt bilgi bağlantısı taşır,
 *    işlem e-postası taşımaz
 *  - kayıtsız adrese davet (INVITE) alt bilgi bağlantısını ve `invite`
 *    kapsamını korur ama `List-Unsubscribe*` başlıklarını TAŞIMAZ (2026-10-10,
 *    sahip: "davetler reklama düşmemeli"); operatör anahtarı
 *    `COLD_INVITE_LIST_UNSUBSCRIBE_HEADER=true` başlıkları geri getirir
 *  - çıkış kullanıcıda tercih anahtarına, kullanıcı olmayan adreste
 *    email_opt_outs'a, davet kapsamında referral_opt_outs'a yazılır
 *  - çıkmış adrese o tür GİTMEZ; Ayarlar'da yeniden açmak kaydı kaldırır
 *  - GET hiçbir şey değiştirmez
 */
const SECRET = "integration-secret";
const configWith = (extra: Record<string, string> = {}) => ({
  get: jest.fn(
    (k: string) => extra[k] ?? (k === "JWT_SECRET" ? SECRET : k === "WEB_URL" ? "https://www.rothern.com" : undefined),
  ),
  getOrThrow: jest.fn(),
});
const config = configWith();

/** `extra`: ek ortam değişkenleri (ör. operatör anahtarı) — servis kurucuda okur. */
function makeEmail(extra?: Record<string, string>) {
  let seq = 0;
  const send = jest.fn().mockImplementation(async () => ({ providerMessageId: `m${++seq}` }));
  const svc = new EmailService((extra ? configWith(extra) : config) as never, prisma as never);
  (svc as unknown as { client: unknown }).client = { send };
  (svc as unknown as { providerName: string }).providerName = "resend";
  return { svc, send };
}

/**
 * Şikâyet geri bildirim başlıkları (Feedback-ID, X-Mailru-Msgtype) HER e-postada
 * var; "çıkış başlığı yok" = `List-Unsubscribe*` anahtarı yok.
 */
function expectNoUnsubscribeHeaders(headers: Record<string, string> | undefined) {
  const keys = Object.keys(headers ?? {}).map((k) => k.toLowerCase());
  expect(keys.filter((k) => k.startsWith("list-unsubscribe"))).toEqual([]);
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
    expectNoUnsubscribeHeaders(send.mock.calls[0][0].headers);
    expect((renderEmail as jest.Mock).mock.calls[0][2].unsubscribeUrl).toBeUndefined();
  });

  it("üye olmayan adrese işlem e-postası: çıkış yok ama KVKK aydınlatma bayrağı açık (derin denetim boşluk taraması GA2)", async () => {
    const { svc, send } = makeEmail();
    await svc.send(mail("yeni@firma.com", "company_user_invitation"));
    await svc.send(mail("misafir@firma.com", "public_inquiry_verify"));
    await svc.send(mail("u@firma.com", "email_verify"));
    await svc.send(mail("tedarik@firma.com", "listing_category_match"));
    const envs = (renderEmail as jest.Mock).mock.calls.map((c) => c[2]);
    expect(envs[0]).toEqual(expect.objectContaining({ privacyNotice: true }));
    expect(envs[0].unsubscribeUrl).toBeUndefined();
    expectNoUnsubscribeHeaders(send.mock.calls[0][0].headers);
    expect(envs[1].privacyNotice).toBe(true);
    expect(envs[2].privacyNotice).toBe(false);
    expect(envs[3].privacyNotice).toBe(true);
  });

  it("ACTIVITY (kendi teklifim elendi) → çıkış başlığı YOK, alt bilgide yalnız bildirim ayarları (2026-10-05)", async () => {
    const { svc, send } = makeEmail();
    const res = await svc.send(mail("tedarik@firma.com", "bid_eliminated"));
    expect(res.sent).toBe(true);
    expectNoUnsubscribeHeaders(send.mock.calls[0][0].headers);
    const env = (renderEmail as jest.Mock).mock.calls[0][2];
    expect(env.unsubscribeUrl).toBeUndefined();
    // Alt bilgi bağlantısı oturum istemeyen jetonlu tercih sayfası (kapsam =
    // tercih anahtarı) — firma billingEmail'i gibi hesabı olmayan alıcı da
    // türü kapatabilsin. Tek tık POST adresi YOK.
    expect(env.preferencesUrl).toMatch(/^https:\/\/www\.rothern\.com\/en\/email-preferences\?t=[A-Za-z0-9_-]+$/);
    expect(env.preferencesUrl).not.toContain("/api/email/unsubscribe");
    expect(env.privacyNotice).toBe(true);
  });

  it("ACTIVITY billingEmail alıcısı: başlık yok, alt bilgideki jetonlu sayfadan türü kapatır, sonra o tür GİTMEZ (inceleme)", async () => {
    const { svc, send } = makeEmail();
    await svc.send(mail("fatura@firma.com", "bid_eliminated"));
    expectNoUnsubscribeHeaders(send.mock.calls[0][0].headers);
    const url = (renderEmail as jest.Mock).mock.calls[0][2].preferencesUrl as string;
    const token = new URL(url).searchParams.get("t")!;
    const described = await unsub().describe(token);
    expect(described).toMatchObject({ scope: "bidElimination", unsubscribed: false });
    await unsub().unsubscribe(token);
    expect(await prisma.emailOptOut.findMany({ select: { email: true, scope: true } })).toEqual([
      { email: "fatura@firma.com", scope: "bidElimination" },
    ]);
    expect(await svc.send(mail("fatura@firma.com", "bid_lost"))).toMatchObject({ sent: false, skipReason: "opted_out" });
    // Başka tür gider.
    expect((await svc.send(mail("fatura@firma.com", "listing_closed"))).sent).toBe(true);
  });

  it("JWT_SECRET yoksa ACTIVITY alt bilgisi oturumlu ayarlar sayfasına düşer", async () => {
    const noSecret = {
      get: jest.fn((k: string) => (k === "WEB_URL" ? "https://www.rothern.com" : undefined)),
      getOrThrow: jest.fn(),
    };
    const svc = new EmailService(noSecret as never, prisma as never);
    (svc as unknown as { client: unknown }).client = { send: jest.fn().mockResolvedValue({ providerMessageId: "m" }) };
    (svc as unknown as { providerName: string }).providerName = "resend";
    await svc.send(mail("a@firma.com", "listing_closed"));
    expect((renderEmail as jest.Mock).mock.calls[0][2].preferencesUrl).toBe(
      "https://www.rothern.com/en/company/settings/notifications",
    );
  });

  it("keşif alt tercihi: AI davetinden çıkmak alıcının adıyla daveti kapatmaz; eski `invitation` çıkışı AI davetini de kapatır (inceleme)", async () => {
    const { svc, send } = makeEmail();
    // AI davetindeki tek tık çıkış → kapsam aiInvitation.
    await svc.send(mail("tedarik@firma.com", "listing_invitation_ai"));
    const oneClick = send.mock.calls[0][0].headers["List-Unsubscribe"] as string;
    const token = new URL(oneClick.slice(1, -1)).searchParams.get("t")!;
    expect((await unsub().describe(token)).scope).toBe("aiInvitation");
    await unsub().unsubscribe(token);
    expect(await svc.send(mail("tedarik@firma.com", "listing_invitation_ai"))).toMatchObject({ sent: false });
    expect(await svc.send(mail("tedarik@firma.com", "listing_reminder_ai"))).toMatchObject({ sent: false });
    expect((await svc.send(mail("tedarik@firma.com", "listing_invitation"))).sent).toBe(true);
    expect((await svc.send(mail("tedarik@firma.com", "listing_reminder"))).sent).toBe(true);

    // Eskiden paylaşılan `invitation` kapsamından çıkmış adres AI davetini de almaz.
    await prisma.emailOptOut.create({ data: { email: "eski@firma.com", scope: "invitation" } });
    expect(await svc.send(mail("eski@firma.com", "listing_invitation_ai"))).toMatchObject({ sent: false });
    expect(await svc.send(mail("eski@firma.com", "listing_invitation_digest"))).toMatchObject({ sent: false });
    const t2 = signUnsubscribeToken({ email: "eski@firma.com", scope: "aiInvitation", locale: "tr" }, SECRET);
    expect((await unsub().describe(t2)).unsubscribed).toBe(true);
    // `reminder`dan çıkmış adres teklifsiz talep dürtmesini ve AI davetlisi hatırlatmasını almaz.
    await prisma.emailOptOut.create({ data: { email: "hatir@firma.com", scope: "reminder" } });
    expect(await svc.send(mail("hatir@firma.com", "listing_zero_bid"))).toMatchObject({ sent: false });
    expect(await svc.send(mail("hatir@firma.com", "listing_reminder_ai"))).toMatchObject({ sent: false });
  });

  it("ACTIVITY işlem göndericisinden, keşif bildirimi kendi göndericisinden çıkar", async () => {
    const { svc, send } = makeEmail();
    const senders = (env: Record<string, string>) =>
      resolveStreamSenders((k) => env[k], "no-reply@rothern.com", "Rothern");
    (svc as unknown as { senders: unknown }).senders = senders({
      EMAIL_FROM_ADDRESS_ACTIVITY: "hesap@rothern.com",
      EMAIL_FROM_ADDRESS_NOTIFICATION: "bildirim@rothern.com",
    });
    await svc.send(mail("a@firma.com", "listing_closed"));
    await svc.send(mail("a@firma.com", "listing_category_match"));
    expect(send.mock.calls[0][0].from).toEqual({ email: "hesap@rothern.com", name: "Rothern" });
    expect(send.mock.calls[1][0].from).toEqual({ email: "bildirim@rothern.com", name: "Rothern" });
    expect(send.mock.calls[1][0].headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    // Değişken yoksa ACTIVITY EMAIL_FROM_ADDRESS'e düşer.
    (svc as unknown as { senders: unknown }).senders = senders({});
    await svc.send(mail("a@firma.com", "approval_pending"));
    expect(send.mock.calls[2][0].from).toEqual({ email: "no-reply@rothern.com", name: "Rothern" });
  });

  it("ACTIVITY: daha önce o kapsamdan ya da 'tümü'nden çıkmış adres yine atlanır", async () => {
    const { svc, send } = makeEmail();
    await prisma.emailOptOut.create({ data: { email: "muhasebe@firma.com", scope: "bidElimination" } });
    await prisma.emailOptOut.create({ data: { email: "hepsi@firma.com", scope: "all" } });
    const a = await svc.send(mail("muhasebe@firma.com", "bid_lost"));
    const b = await svc.send(mail("hepsi@firma.com", "listing_closed"));
    expect(a).toMatchObject({ sent: false, skipReason: "opted_out" });
    expect(b).toMatchObject({ sent: false, skipReason: "opted_out" });
    // Başka kapsam (listingClosed) gider.
    const c = await svc.send(mail("muhasebe@firma.com", "listing_closed"));
    expect(c.sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("davet akışında tercih bağlantısı yok (kayıtsız adres)", async () => {
    const { svc } = makeEmail();
    await svc.send(mail("dis@firma.com", "tender_external_invite"));
    const env = (renderEmail as jest.Mock).mock.calls[0][2];
    expect(env.unsubscribeUrl).toBeDefined();
    expect(env.preferencesUrl).toBeUndefined();
  });

  it.each([...INVITE_CONTEXT_TYPES])(
    "INVITE (%s): toplu posta başlığı YOK, alt bilgi çıkış bağlantısı + aydınlatma aynen (2026-10-10)",
    async (type) => {
      const { svc, send } = makeEmail();
      const res = await svc.send(mail("dis@firma.com", type));
      expect(res.sent).toBe(true);
      expectNoUnsubscribeHeaders(send.mock.calls[0][0].headers);
      // Şikâyet geri bildirim başlıkları yerinde.
      expect(Object.keys(send.mock.calls[0][0].headers).sort()).toEqual(["Feedback-ID", "X-Mailru-Msgtype"]);
      const env = (renderEmail as jest.Mock).mock.calls[0][2];
      // Mektubun alt bilgisine giden bağlantı: jetonlu çıkış SAYFASI (tek tık POST adresi değil).
      expect(env.unsubscribeUrl).toMatch(/^https:\/\/www\.rothern\.com\/en\/email-preferences\?t=[A-Za-z0-9_-]+$/);
      const token = new URL(env.unsubscribeUrl).searchParams.get("t")!;
      expect(verifyUnsubscribeToken(token, SECRET)).toEqual({ email: "dis@firma.com", scope: "invite", locale: "en" });
      expect(env.privacyNotice).toBe(true);
      expect(env.preferencesUrl).toBeUndefined();
    },
  );

  it("INVITE + operatör anahtarı 'true': iki başlık geri gelir, tek tık adresi alt bilgideki jetonu taşır", async () => {
    const { svc, send } = makeEmail({ [COLD_INVITE_LIST_UNSUBSCRIBE_HEADER_ENV]: "true" });
    for (const type of INVITE_CONTEXT_TYPES) {
      send.mockClear();
      (renderEmail as jest.Mock).mockClear();
      await svc.send(mail(`anahtar-${type}@firma.com`, type));
      const headers = send.mock.calls[0][0].headers as Record<string, string>;
      const token = new URL((renderEmail as jest.Mock).mock.calls[0][2].unsubscribeUrl).searchParams.get("t")!;
      expect(headers["List-Unsubscribe"]).toBe(`<https://www.rothern.com/api/email/unsubscribe?t=${token}>`);
      expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    }
    // Anahtar ACTIVITY / işlem e-postasına başlık EKLEMEZ.
    send.mockClear();
    await svc.send(mail("tedarik@firma.com", "bid_eliminated"));
    await svc.send(mail("u@firma.com", "email_verify"));
    expectNoUnsubscribeHeaders(send.mock.calls[0][0].headers);
    expectNoUnsubscribeHeaders(send.mock.calls[1][0].headers);
  });

  it("NOTIFICATION ve LIFECYCLE başlıkları aynen taşır (davet kararı onları değiştirmez)", async () => {
    const { svc, send } = makeEmail();
    await svc.send(mail("tedarik@firma.com", "listing_category_match"));
    await svc.send(mail("tedarik@firma.com", "lifecycle_welcome"));
    expect(send).toHaveBeenCalledTimes(2);
    const scopes = ["categoryMatch", "lifecycle"];
    send.mock.calls.forEach((call, i) => {
      const headers = call[0].headers as Record<string, string>;
      expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      const oneClick = headers["List-Unsubscribe"]!.match(/^<https:\/\/www\.rothern\.com\/api\/email\/unsubscribe\?t=([A-Za-z0-9_-]+)>$/);
      expect(oneClick).not.toBeNull();
      expect(verifyUnsubscribeToken(oneClick![1], SECRET)).toMatchObject({ email: "tedarik@firma.com", scope: scopes[i] });
      // Alt bilgi bağlantısı aynı jetonun sayfası.
      expect((renderEmail as jest.Mock).mock.calls[i][2].unsubscribeUrl).toBe(
        `https://www.rothern.com/en/email-preferences?t=${oneClick![1]}`,
      );
    });
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
    // Derin denetim MU-05: adres kaydı da yazılır (billingEmail dalı tercihsiz gider).
    const rows = await prisma.emailOptOut.findMany({ select: { email: true, scope: true } });
    expect(rows).toEqual([{ email: user.email.toLowerCase(), scope: "reminder" }]);
  });

  it("MU-05: kullanıcının adresi firmanın billingEmail'i de olsa tek tık çıkış o dalda da İŞLER", async () => {
    const { user: created } = await makeCompanyWithUser(prisma);
    // Fabrika adresi `@test.local`: teslim edilemez alan adı kapısı
    // (undeliverable-domain.ts) onu sağlayıcıya hiç göndermez → gerçek alan adı.
    const user = await prisma.companyUser.update({
      where: { id: created.id },
      data: { email: `mu05-${created.id}@firma.com` },
    });
    const { svc, send } = makeEmail();
    const token = signUnsubscribeToken({ email: user.email, scope: "categoryMatch", locale: "tr" }, SECRET);
    await unsub().unsubscribe(token);
    // Fatura dalı tercihsiz (prefs: null) gönderir → yalnız EmailService kapısı korur.
    const blocked = await svc.send(mail(user.email, "listing_category_match"));
    expect(blocked.sent).toBe(false);
    const other = await svc.send(mail(user.email, "listing_invitation"));
    expect(other.sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("'tümü' → kullanıcının bütün tercihleri kapanır (karşılama serisi `lifecycle` dahil — Ayarlar aynı değeri gösterir)", async () => {
    const { user } = await makeCompanyWithUser(prisma);
    const token = signUnsubscribeToken({ email: user.email, scope: "categoryMatch", locale: "tr" }, SECRET);
    await unsub().unsubscribe(token, true);
    const row = await prisma.companyUser.findUniqueOrThrow({ where: { id: user.id }, select: { notificationPrefs: true } });
    expect(row.notificationPrefs).toMatchObject({ categoryMatch: false, invitation: false, announcement: false, lifecycle: false });
    // Tür başına adres kaydı ("all" değil): Ayarlar'da tek türü yeniden açmak
    // yalnız o satırı siler, diğerleri kapalı kalır.
    const scopes = (await prisma.emailOptOut.findMany({ select: { scope: true } })).map((r) => r.scope).sort();
    expect(scopes).toEqual([...NOTIFICATION_PREF_KEYS].sort());
    expect(scopes).not.toContain("all");
  });

  it("davet kapsamı → referral_opt_outs (mevcut davet frenleri aynı tabloyu okur)", async () => {
    const token = signUnsubscribeToken({ email: "Dis@Firma.com", scope: "invite", locale: "en" }, SECRET);
    await unsub().unsubscribe(token);
    expect(await prisma.referralOptOut.findUnique({ where: { email: "dis@firma.com" } })).not.toBeNull();
    const { svc } = makeEmail();
    expect((await svc.send(mail("dis@firma.com", "tender_external_invite"))).sent).toBe(false);
  });

  it("davetten ya da 'tümü'nden çıkmış adres başlıksız davette de ATLANIR (kapı başlıktan bağımsız; anahtar açıkken de)", async () => {
    await prisma.referralOptOut.create({ data: { email: "cikan@firma.com" } });
    await prisma.emailOptOut.create({ data: { email: "hepsi@firma.com", scope: "all" } });
    for (const extra of [undefined, { [COLD_INVITE_LIST_UNSUBSCRIBE_HEADER_ENV]: "true" }]) {
      const { svc, send } = makeEmail(extra);
      for (const type of INVITE_CONTEXT_TYPES) {
        for (const to of ["cikan@firma.com", "Cikan@Firma.com", "hepsi@firma.com"]) {
          expect(await svc.send(mail(to, type))).toMatchObject({ sent: false, skipReason: "opted_out" });
        }
      }
      expect(send).not.toHaveBeenCalled();
    }
    expect(await prisma.emailLog.count({ where: { errorMessage: "opted_out: invite" } })).toBe(12);
    // Çıkmamış adrese gider.
    const { svc, send } = makeEmail();
    expect((await svc.send(mail("yeni@firma.com", "referral_invite"))).sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("geçersiz jeton → 400", async () => {
    await expect(unsub().unsubscribe("bozuk")).rejects.toMatchObject({ status: 400 });
    await expect(unsub().describe(undefined)).rejects.toMatchObject({ status: 400 });
  });
});

describe("AdminEmailLogsService.resend — dil ve bağlam korunur (derin denetim MU-05)", () => {
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const admin = (svc: EmailService) => new AdminEmailLogsService(prisma as never, svc, audit as never);

  it("orijinal gönderimin dili ve bağlamı log'a yazılır, yeniden gönderim aynı dil + çıkış başlığıyla gider", async () => {
    const { svc, send } = makeEmail();
    const first = await svc.send({ ...(mail("ru@firma.com", "listing_category_match") as object), locale: "ru" } as never);
    const orig = await prisma.emailLog.findUniqueOrThrow({ where: { id: first.emailLogId } });
    expect(orig.locale).toBe("ru");
    expect(orig.contextType).toBe("listing_category_match");
    (renderEmail as jest.Mock).mockClear();
    send.mockClear();

    const res = await admin(svc).resend(first.emailLogId, "admin1");
    expect(res.sent).toBe(true);
    // Dil geri geçirildi (eskiden varsayılan tr ile çiziliyordu).
    expect((renderEmail as jest.Mock).mock.calls[0][1]).toBe("ru");
    // Bağlam geri geçirildi → NOTIFICATION akışı: RFC 8058 başlığı + çıkış bağlantısı.
    const headers = send.mock.calls[0][0].headers as Record<string, string>;
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect((renderEmail as jest.Mock).mock.calls[0][2].unsubscribeUrl).toMatch(/\/ru\//);
    const copy = await prisma.emailLog.findUniqueOrThrow({ where: { id: res.emailLogId } });
    expect(copy).toMatchObject({ contextType: "listing_category_match", contextId: "ctx1", locale: "ru" });
  });

  it("alıcı o türden çıkmışsa yeniden gönderim GİTMEZ (sent:false, opted_out log satırı)", async () => {
    const { svc, send } = makeEmail();
    const first = await svc.send(mail("muhasebe@firma.com", "listing_category_match"));
    const token = signUnsubscribeToken({ email: "muhasebe@firma.com", scope: "categoryMatch", locale: "tr" }, SECRET);
    await unsub().unsubscribe(token);
    send.mockClear();

    const res = await admin(svc).resend(first.emailLogId, "admin1");
    expect(res.sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
    const copy = await prisma.emailLog.findUniqueOrThrow({ where: { id: res.emailLogId } });
    expect(copy.errorMessage).toBe("opted_out: categoryMatch");
  });

  it("eski satır (locale NULL) Türkçe varsayılana düşer, bağlamsız işlem e-postası çıkış başlığı taşımaz", async () => {
    const { svc, send } = makeEmail();
    const legacy = await prisma.emailLog.create({
      data: {
        template: "notification",
        toEmail: "eski@firma.com",
        subject: "S",
        provider: "resend",
        status: "FAILED",
        payload: { subject: "S", heading: "H", paragraphs: ["p"] },
      },
    });
    const res = await admin(svc).resend(legacy.id, "admin1");
    expect(res.sent).toBe(true);
    expect((renderEmail as jest.Mock).mock.calls[0][1]).toBeUndefined();
    expectNoUnsubscribeHeaders(send.mock.calls[0][0].headers);
  });
});
