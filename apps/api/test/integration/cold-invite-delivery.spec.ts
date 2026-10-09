/**
 * SOĞUK DAVET — POSTA SAĞLAYICISINA GERÇEKTE GİDEN İSTEK (2026-10-09, sahip:
 * "AI'ın bulduğu, hiç kayıt olmamış firmalara giden davet Promosyonlar'a ya da
 * spam'e düşmemeli; bizim tarafımızdaki her nedeni kaldırın").
 *
 * Dört bağlam GERÇEK yoldan geçer: `inviteExternalForListing` → kuyruk →
 * `ExternalInviteDispatcher` (talep daveti, adı gizli sürümü, hatırlatması,
 * özeti) ve `inviteByEmail` ("katıl" daveti) → gerçek `EmailService` → gerçek
 * `renderEmail` → gerçek `EmailClient` + `ResendProvider`. Yalnız Resend
 * SDK'sının ağ çağrısı sahtedir; test onun aldığı isteği okur:
 *   gönderen adı + adresi (INVITE akışı), Reply-To, List-Unsubscribe +
 *   List-Unsubscribe-Post, Feedback-ID, ek/görsel/izleme pikseli yokluğu,
 *   bağlantı sayısı (≤ 4) ve alan adı, HTML boyutu, düz metin parçası.
 * Biçim kuralları (üç dil, en kötü veri) `test/unit/cold-invite-plain-letter.spec.ts`.
 */
import { PLAIN_LETTER_MAX_LINKS } from "@rothern/email";
import { Prisma } from "@rothern/db";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { ExternalInviteDispatcher } from "../../src/modules/company-connections/services/external-invite-dispatcher.service";
import { EmailService } from "../../src/modules/email/email.service";
import { INVITE_CONTEXT_TYPES } from "../../src/modules/email/email-streams";
import { verifyUnsubscribeToken } from "../../src/modules/email/unsubscribe-token";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { holdInviteSendWindowOpen } from "./invite-send-window";

// These suites test other rules with the real clock; the send-time business window is covered in invite-send-window.spec.ts.
holdInviteSendWindowOpen();

const WEB = "https://www.rothern.com";
const WEB_HOST = "www.rothern.com";
const ENV: Record<string, string> = {
  WEB_URL: WEB,
  JWT_SECRET: "cold-invite-delivery-secret",
  APP_ENV: "production",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM_NAME: "Rothern",
  EMAIL_FROM_ADDRESS: "hesap@rothern.com",
  // INVITE akışı kendi adresinden çıkar; kod/şifre göndericisi ayrı kalır.
  EMAIL_FROM_ADDRESS_INVITE: "davet@rothern.com",
  EMAIL_REPLY_TO: "destek@rothern.com",
  // Testte hız kısıcı beklemesin.
  EMAIL_SEND_RATE_PER_SEC: "1000",
};
const config = {
  get: (k: string) => ENV[k],
  getOrThrow: (k: string) => {
    if (!ENV[k]) throw new Error(`missing ${k}`);
    return ENV[k];
  },
};

type ProviderPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: unknown;
};

/** Gerçek EmailService; yalnız Resend SDK'sının `emails.send`i sahte. */
function makeEmail() {
  const svc = new EmailService(config as never, prisma as never);
  svc.onModuleInit();
  const sdkSend = jest.fn().mockResolvedValue({ data: { id: "msg_1" }, error: null });
  const client = (svc as unknown as { client: { provider: { client: unknown } } }).client;
  client.provider.client = { emails: { send: sdkSend } };
  const payloads = () => sdkSend.mock.calls.map((c) => c[0] as ProviderPayload);
  return { svc, sdkSend, payloads };
}

function makeHarness() {
  const email = makeEmail();
  const service = new CompanyConnectionsService(
    prisma as never,
    prisma as never,
    { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never,
    email.svc as never,
    config as never,
    {
      notify: jest.fn().mockResolvedValue(1),
      pushToCompany: jest.fn().mockResolvedValue(1),
      pushToUser: jest.fn().mockResolvedValue(1),
    } as never,
    new AuditService(prisma as never),
  );
  const dispatcher = new ExternalInviteDispatcher(prisma as never, email.svc as never, config as never, undefined);
  return { ...email, service, dispatcher };
}

async function buyer(name: string) {
  const owner = await makeCompanyWithUser(prisma);
  await prisma.company.update({ where: { id: owner.company.id }, data: { name } });
  return owner;
}

/** Yasaklı alanları da taşıyan (e-postaya SIZMAMASI gereken) 12 kalemli açık talep. */
async function richListing(
  owner: Awaited<ReturnType<typeof buyer>>,
  extra: { title?: string; closesAt?: Date; inviteShowName?: boolean } = {},
) {
  const address = await prisma.companyAddress.create({
    data: {
      companyId: owner.company.id,
      type: "TESLIMAT",
      title: "Depo",
      country: "TR",
      city: "İzmir",
      district: "Çiğli",
      addressLine: "Atatürk OSB 10001 Sk. No:5",
      postalCode: "35620",
    },
  });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    title: "Baret ve iş güvenliği malzemesi alımı",
    deliveryAddressId: address.id,
    closesAt: new Date(Date.now() + 10 * 24 * 3_600_000),
    preferredActivities: ["MANUFACTURER"],
    ...extra,
  });
  for (let i = 1; i <= 12; i++) {
    await makeItem(prisma, listing.id, {
      lineNo: i,
      name: `Baret tip ${i}`,
      quantity: new Prisma.Decimal(100 * i),
      unit: "adet",
      unitCode: "PCE",
      targetPrice: new Prisma.Decimal(987.65),
      specification: "EN 397 GİZLİ ŞARTNAME",
    });
  }
  return listing;
}

async function makeDue() {
  await prisma.externalListingInvite.updateMany({ data: { sendAfter: new Date(Date.now() - 60_000) } });
}

const decode = (s: string) => s.replace(/&amp;/g, "&");
const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => decode(m[1]!));
const textUrls = (text: string) => text.match(/https?:\/\/\S+/g) ?? [];
const SHORTENERS = /\b(bit\.ly|t\.co|goo\.gl|tinyurl\.com|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|lnkd\.in|t\.ly|rb\.gy)\b/i;

/**
 * Dört bağlamın ORTAK sözleşmesi — sağlayıcının aldığı istek üzerinde.
 * `contentLinks`: gövdedeki bağlantı sayısı (ana + varsa önizleme).
 */
/** Bu dosyada sağlayıcı isteği sınanan bağlam tipleri (kapsama denetimi, en sonda). */
const checkedContextTypes = new Set<string>();

function expectColdInvitePayload(
  p: ProviderPayload,
  o: { to: string; from: string; contextType: string; contentLinks: number },
) {
  checkedContextTypes.add(o.contextType);
  // Sağlayıcıya giden alanlar: ek YOK, izleme / etiket / zamanlama alanı YOK.
  expect(Object.keys(p).sort()).toEqual(["from", "headers", "html", "replyTo", "subject", "text", "to"]);
  expect(p).not.toHaveProperty("attachments");
  expect(p.to).toEqual([o.to]);

  // Gönderen: INVITE akışının adresi; yanıt gerçek bir kutuya.
  expect(p.from).toBe(o.from);
  expect(p.replyTo).toBe("destek@rothern.com");

  // Başlıklar: tek tık çıkış (RFC 8058) + şikâyet geri bildirimi — başkası yok.
  const h = p.headers!;
  expect(Object.keys(h).sort()).toEqual(["Feedback-ID", "List-Unsubscribe", "List-Unsubscribe-Post", "X-Mailru-Msgtype"]);
  expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  const oneClick = h["List-Unsubscribe"]!.match(/^<(https:\/\/www\.rothern\.com\/api\/email\/unsubscribe\?t=([A-Za-z0-9_-]+))>$/);
  expect(oneClick).not.toBeNull();
  expect(verifyUnsubscribeToken(oneClick![2]!, ENV.JWT_SECRET!)).toMatchObject({ email: o.to, scope: "invite" });
  expect(h["Feedback-ID"]).toBe(`${o.contextType}:INVITE:prod:rothern`);
  expect(h["X-Mailru-Msgtype"]).toBe(o.contextType);
  // Başlıklarda alıcı adresi yok (jeton şifreli).
  expect(JSON.stringify(h)).not.toContain(o.to);

  // Görsel, gömülü kaynak, izleme pikseli, gizli metin yok.
  expect(p.html).not.toMatch(/<(img|picture|svg|video|object|embed|iframe|link|script|style|table)\b/i);
  expect(p.html).not.toMatch(/cid:|data:image|url\(|\bsrc=|display\s*:\s*none|<!--/i);

  // Bağlantılar: gövde + TEK çıkış + aydınlatma; hepsi kendi alan adımızda, https, kısaltıcı yok.
  const links = hrefs(p.html);
  expect(links).toHaveLength(o.contentLinks + 2);
  expect(links.length).toBeLessThanOrEqual(PLAIN_LETTER_MAX_LINKS);
  for (const link of links) {
    const url = new URL(link);
    expect(url.protocol).toBe("https:");
    expect(url.host).toBe(WEB_HOST);
    expect(link).not.toMatch(SHORTENERS);
  }
  // Gövdedeki çıkış bağlantısı başlıktaki jetonun sayfasıdır (aynı adres + kapsam).
  const unsubscribePage = new URL(links.at(-2)!);
  expect(unsubscribePage.pathname).toBe("/e-posta-tercihleri");
  expect(unsubscribePage.searchParams.get("t")).toBe(oneClick![2]);
  expect(links.at(-1)).toBe(`${WEB}/sozlesmeler/kvkk`);
  expect(p.html).not.toContain("davet-kapat");

  // Düz metin parçası her zaman var ve aynı bağlantıları taşır.
  expect(typeof p.text).toBe("string");
  expect(p.text.trim().length).toBeGreaterThan(200);
  expect(textUrls(p.text)).toEqual(links);

  // Küçük HTML (marka kabuğu ~13 KB idi).
  expect(Buffer.byteLength(p.html, "utf8")).toBeLessThan(6 * 1024);

  // Sakin metin.
  for (const part of [p.subject, p.text]) {
    expect(part).not.toContain("!");
    expect(part).not.toMatch(/\p{Extended_Pictographic}/u);
  }
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("soğuk davet — sağlayıcıya giden istek", () => {
  it("talep daveti: gönderen 'Firma (Rothern üzerinden)' + davet adresi; beyaz liste; iki gövde bağlantısı", async () => {
    const { service, dispatcher, payloads } = makeHarness();
    const owner = await buyer("ABC İnşaat");
    const listing = await richListing(owner);
    await service.inviteExternalForListing(owner.auth, listing.id, ["satinalma@tedarikci.com.tr"]);

    const report = await dispatcher.dispatch();
    expect(report.sent).toBe(1);
    const [p] = payloads();
    expectColdInvitePayload(p!, {
      to: "satinalma@tedarikci.com.tr",
      from: '"ABC İnşaat (Rothern üzerinden)" <davet@rothern.com>',
      contextType: "tender_external_invite",
      contentLinks: 2,
    });
    expect(p!.subject).toBe("ABC İnşaat sizden teklif istiyor: Baret tip 1, Baret tip 2 +10 kalem");

    // Gövde bağlantıları: kayıt (talebe dönüşlü) + kayıtsız önizleme.
    const [register, preview] = hrefs(p!.html).map((l) => new URL(l));
    expect(register!.pathname).toBe("/company/kayit");
    expect(register!.searchParams.get("redirect")).toBe(`/company/ilan/${listing.id}`);
    expect(preview!.pathname).toBe("/talep-davet");
    expect(preview!.searchParams.get("l")).toBe(listing.id);

    // Beyaz liste: firma adı, başlık, ilk 10 kalem (ad + miktar + birim), şehir + ülke, son tarih, tedarikçi tipi.
    const lines = p!.text.split("\n");
    expect(lines[0]).toBe("Merhaba,");
    expect(lines[2]).toBe("ABC İnşaat, Rothern B2B tedarik platformunda açtığı alım talebi için sizden teklif istiyor.");
    expect(lines).toContain("Talep: Baret ve iş güvenliği malzemesi alımı");
    expect(lines.some((l) => /^Teslim yeri: İzmir, /.test(l))).toBe(true);
    expect(lines.some((l) => /^Son teklif tarihi: .+ GMT\+3$/.test(l))).toBe(true);
    expect(lines).toContain("Aranan tedarikçi tipi: Üretici");
    expect(lines).toContain("Talep edilen 12 kalem:");
    expect(lines.filter((l) => l.startsWith("- "))).toEqual(
      Array.from({ length: 10 }, (_, i) => `- Baret tip ${i + 1} — ${i === 9 ? "1.000" : 100 * (i + 1)} adet`),
    );
    expect(lines).toContain("+2 kalem daha");
    // ASLA: hedef fiyat, şartname, tam adres (ilçe, sokak, posta kodu).
    for (const part of [p!.html, p!.text, p!.subject]) {
      for (const secret of ["987", "GİZLİ ŞARTNAME", "EN 397", "Çiğli", "10001", "35620", "Atatürk OSB"]) {
        expect(part).not.toContain(secret);
      }
    }
    expect(await prisma.emailLog.count({ where: { status: "SENT", template: "tender_external_invite" } })).toBe(1);
  });

  it("adı gizli talep: gönderen 'Rothern', konu ve gövde nötr ad taşır (firma adı sızmaz)", async () => {
    const { service, dispatcher, payloads } = makeHarness();
    const owner = await buyer("Gizli Alıcı Sanayi");
    const listing = await richListing(owner, { inviteShowName: false });
    await service.inviteExternalForListing(owner.auth, listing.id, ["satis@tedarikci.com.tr"]);

    await dispatcher.dispatch();
    const [p] = payloads();
    expectColdInvitePayload(p!, {
      to: "satis@tedarikci.com.tr",
      from: "Rothern <davet@rothern.com>",
      contextType: "tender_external_invite",
      contentLinks: 2,
    });
    expect(p!.subject).toBe("Bir alıcı firma sizden teklif istiyor: Baret tip 1, Baret tip 2 +10 kalem");
    expect(`${p!.from}${p!.subject}${p!.html}${p!.text}`).not.toContain("Gizli Alıcı");
  });

  it("hatırlatma: aynı mektup, konu ve açılış cümlesi hatırlatma", async () => {
    const { service, dispatcher, payloads } = makeHarness();
    const owner = await buyer("ABC İnşaat");
    const listing = await richListing(owner, { closesAt: new Date(Date.now() + 30 * 3_600_000) });
    await service.inviteExternalForListing(owner.auth, listing.id, ["hatirla@tedarikci.com.tr"]);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3_600_000);
    await prisma.externalListingInvite.updateMany({ data: { state: "SENT", sentAt: threeDaysAgo } });
    await prisma.emailLog.create({
      data: {
        template: "tender_external_invite",
        toEmail: "hatirla@tedarikci.com.tr",
        subject: "s",
        provider: "test",
        status: "SENT",
        contextType: "tender_external_invite",
        contextId: "ilk",
        queuedAt: threeDaysAgo,
      },
    });

    const report = await dispatcher.dispatch();
    expect(report.reminders).toBe(1);
    const [p] = payloads();
    expectColdInvitePayload(p!, {
      to: "hatirla@tedarikci.com.tr",
      from: '"ABC İnşaat (Rothern üzerinden)" <davet@rothern.com>',
      contextType: "tender_external_invite",
      contentLinks: 2,
    });
    expect(p!.subject).toBe("Hatırlatma: ABC İnşaat teklifinizi bekliyor — Baret tip 1, Baret tip 2 +10 kalem");
    expect(p!.text.split("\n")[2]).toBe(
      "ABC İnşaat, Rothern B2B tedarik platformunda açtığı alım talebi için teklifinizi bekliyor; son teklif tarihi yaklaşıyor.",
    );
  });

  it("özet (iki alıcı, aynı adres): gönderen 'Rothern'; talepler düz satır, TEK ana bağlantı", async () => {
    const { service, dispatcher, payloads } = makeHarness();
    const a = await buyer("ABC İnşaat");
    const b = await buyer("XYZ Metal");
    const la = await richListing(a);
    const lb = await richListing(b, { title: "Çelik halat alımı" });
    await service.inviteExternalForListing(a.auth, la.id, ["ortak@tedarikci.com.tr"], "AI_FORM");
    await service.inviteExternalForListing(b.auth, lb.id, ["ortak@tedarikci.com.tr"], "AI_FORM");
    await makeDue();

    await dispatcher.dispatch();
    const all = payloads();
    expect(all).toHaveLength(1);
    const p = all[0]!;
    expectColdInvitePayload(p, {
      to: "ortak@tedarikci.com.tr",
      from: "Rothern <davet@rothern.com>",
      contextType: "tender_external_invite",
      contentLinks: 1,
    });
    expect(p.subject).toMatch(/^(ABC İnşaat|XYZ Metal) ve 1 alıcı daha sizden teklif istiyor$/);
    const text = p.text;
    expect(text).toContain("Rothern B2B tedarik platformunda 2 alım talebi için sizden teklif isteniyor.");
    expect(text).toMatch(/^1\. (ABC İnşaat — Baret ve iş güvenliği malzemesi alımı|XYZ Metal — Çelik halat alımı)$/m);
    expect(text).toMatch(/^2\. (ABC İnşaat — Baret ve iş güvenliği malzemesi alımı|XYZ Metal — Çelik halat alımı)$/m);
    // Talep başına en fazla 3 kalem + kalan sayısı.
    expect(text.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(6);
    expect(text.match(/^\+9 kalem daha$/gm)).toHaveLength(2);
    // Ana bağlantı ilk talebin önizlemesi.
    const main = new URL(hrefs(p.html)[0]!);
    expect(main.pathname).toBe("/talep-davet");
    expect([la.id, lb.id]).toContain(main.searchParams.get("l"));
    expect(text).not.toMatch(/987|GİZLİ ŞARTNAME|Çiğli|10001/);
    expect(await prisma.externalListingInvite.count({ where: { state: "SENT" } })).toBe(2);
  });

  it("'katıl' daveti: gönderen 'Rothern' + davet adresi; tek gövde bağlantısı (kayıt)", async () => {
    const { service, payloads } = makeHarness();
    const owner = await buyer("ABC İnşaat");
    const res = await service.inviteByEmail(owner.auth, "yeni@tedarikci.com.tr");
    expect(res).toMatchObject({ kind: "invited", delivery: "SENT" });

    const [p] = payloads();
    expectColdInvitePayload(p!, {
      to: "yeni@tedarikci.com.tr",
      from: "Rothern <davet@rothern.com>",
      contextType: "referral_invite",
      contentLinks: 1,
    });
    expect(p!.subject).toBe("ABC İnşaat sizi Rothern'e davet etti");
    const register = new URL(hrefs(p!.html)[0]!);
    expect(register.pathname).toBe("/company/kayit");
    expect(register.searchParams.get("ref")).toBeTruthy();
    expect(p!.text.split("\n")[2]).toBe("ABC İnşaat, Rothern B2B tedarik platformunda sizinle bağlantı kurmak istiyor.");
  });

  it("INVITE akışının HER bağlam tipi yukarıda sınandı (yeni soğuk davet tipi buraya senaryo ister)", () => {
    expect([...checkedContextTypes].sort()).toEqual([...INVITE_CONTEXT_TYPES].sort());
  });

  it("akış göndericisi tanımlı değilse davet varsayılan adresten çıkar (EMAIL_FROM_ADDRESS)", async () => {
    const saved = ENV.EMAIL_FROM_ADDRESS_INVITE!;
    delete ENV.EMAIL_FROM_ADDRESS_INVITE;
    try {
      const { service, payloads } = makeHarness();
      const owner = await buyer("ABC İnşaat");
      await service.inviteByEmail(owner.auth, "varsayilan@tedarikci.com.tr");
      expect(payloads()[0]!.from).toBe("Rothern <hesap@rothern.com>");
    } finally {
      ENV.EMAIL_FROM_ADDRESS_INVITE = saved;
    }
  });
});
