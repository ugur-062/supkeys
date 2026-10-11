jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));
// renderEmail React Email dynamic-import kullanıyor → jest'te patlar; gerçek
// EmailService'li (staging izin listesi) senaryoda çizim sonucu sabit.
jest.mock("@rothern/email", () => ({
  ...jest.requireActual("@rothern/email"),
  renderEmail: jest.fn().mockResolvedValue({ subject: "S", html: "<p>p</p>", text: "p" }),
}));

/**
 * YAYIN SONRASI AI KEŞFİ BULDUĞUNU KENDİSİ DAVET EDER (2026-10-08) — sözleşme.
 *
 * Sahip: "kutu seçildiği anda AI arasın ve göndersin, bir daha soru sormasın;
 * arkada arasın, bulabildiğine göndersin; kalem adları ve detayları gidecek ve
 * şu şirket sizi davet etti diyecek".
 *
 *  - Onay YOK: tur (yayın + ikinci tur) bulduğu Rothern üyesini doğrudan talebe
 *    (`inviteDiscoveredMembers`), diğerlerini e-posta kuyruğuna (`AI_AUTO`)
 *    talebi YAYINLAYAN kişi adına davet eder.
 *  - HİÇBİR FREN ATLANMAZ: firma günlük tavanı, platform soğuk davet tavanı +
 *    freni, adres başına 7 gün + özet, onay isteyen ülke, MX, çıkış/suppression,
 *    kayda kapalı ülke, engelli/askıdaki firma, görünürlük ülkesi, yalnız
 *    doğrulanmış üye, staging izin listesi, AI platform bütçesi, en fazla iki
 *    otomatik tur, özel talepte hiç.
 *  - Aday iki kez davet edilmez; tur çökmeden sonra kaldığı yerden sürer.
 *  - Sonuç mesajı: "talebinize N tedarikçi davet edildi" (kimse davet
 *    edilmediyse hiçbir şey gitmez); ekran yalnız DURUM okur (`forListing`).
 */
import { Prisma, PrismaClient } from "@rothern/db";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { ExternalInviteDispatcher } from "../../src/modules/company-connections/services/external-invite-dispatcher.service";
import { ListingEmailInvitesService } from "../../src/modules/company-connections/services/listing-email-invites.service";
import { nextBusinessWindow, timeZoneForCountry } from "../../src/common/time/country-time-zone";
import { DiscoveryRunsService } from "../../src/modules/ai/supplier-discovery/discovery-runs.service";
import { SupplierDiscoveryService } from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";
import { EmailService } from "../../src/modules/email/email.service";
import { gatingPrefKeysForType } from "../../src/common/notifications/notification-prefs";
import { TEST_DB_URL } from "./env";
import { prisma, truncateAll } from "./test-db";
import { ListingScheduler } from "../../src/modules/company-listings/schedulers/listing.scheduler";
import { connect, makeCompanyWithUser, makeItem, makeListing, proveAccounts } from "./factories";
import { makeService as makeListingsService } from "./make-service";
import { holdInviteSendWindowOpen } from "./invite-send-window";

// These suites test other rules with the real clock; the send-time business window is covered in invite-send-window.spec.ts.
holdInviteSendWindowOpen();

const MIN = 60_000;
const DAY = 24 * 3_600_000;

type Batch = Array<Record<string, unknown>>;
type SendArg = {
  to: { email: string };
  locale: string;
  subject?: string;
  fromName?: string;
  templateData: { template: string; data: Record<string, unknown> };
  context: { type: string; id: string };
};

/** Gerçek EmailService gibi EmailLog satırı yazar (dağıtıcı geçmişi oradan okur). */
function loggingEmail(sent = true) {
  return {
    send: jest.fn(async (a: SendArg) => {
      await prisma.emailLog.create({
        data: {
          template: a.templateData.template,
          toEmail: a.to.email,
          subject: "s",
          provider: "test",
          status: sent ? "SENT" : "FAILED",
          contextType: a.context.type,
          contextId: a.context.id,
        },
      });
      return { emailLogId: "t", sent };
    }),
  };
}

/**
 * Gerçek servisler (keşif, tur, bağlantılar, talepler, dağıtıcı) + sahte model.
 * `batches`: web aramasının geçiş başına aday listesi (sırayla).
 */
function rig(
  opts: {
    batches?: Batch[];
    config?: Record<string, string>;
    mx?: (email: string) => boolean;
    emailSent?: boolean;
    email?: { send: jest.Mock } | EmailService;
  } = {},
) {
  let parse = 0;
  const ai = {
    isEnabled: true,
    callAiSystem: jest.fn(async (o: { responseSchema?: object }) => {
      if (!o.responseSchema) return { text: "research", costUsd: 0.05, downgraded: false, warned: false };
      return {
        text: JSON.stringify({ companies: opts.batches?.[parse++] ?? [] }),
        costUsd: 0.01,
        downgraded: false,
        warned: false,
      };
    }),
  };
  const config = {
    get: jest.fn((k: string) => opts.config?.[k] ?? (k === "WEB_URL" ? "http://localhost:3000" : undefined)),
    getOrThrow: jest.fn(),
  };
  const email = (opts.email ?? loggingEmail(opts.emailSent ?? true)) as { send: jest.Mock };
  const notifications = { pushToUser: jest.fn().mockResolvedValue(1), notify: jest.fn(), pushToCompany: jest.fn() };
  const listings = logListingMails(makeListingsService());
  const discovery = new SupplierDiscoveryService(prisma as never, ai as never, prisma as never);
  discovery.mxCheck = async (e) => opts.mx?.(e) ?? true;
  const connections = new CompanyConnectionsService(
    prisma as never,
    prisma as never,
    { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never,
    email as never,
    config as never,
    notifications as never,
    new AuditService(prisma as never),
  );
  const runs = new DiscoveryRunsService(
    prisma as never,
    prisma as never,
    ai as never,
    discovery,
    connections,
    config as never,
    email as never,
    notifications as never,
    listings.service,
  );
  const dispatcher = new ExternalInviteDispatcher(prisma as never, email as never, config as never, undefined);
  return { ai, runs, email, notifications, listings, connections, discovery, dispatcher };
}

/**
 * Talep servisinin e-postaları da gerçek EmailService gibi EmailLog yazar:
 * "bu talep için e-posta almış adrese ikincisi gitmez" kuralı oradan okur.
 * Gerçek servisin ÇIKIŞ KAPISI da taklit edilir: adres bu türün kapsamlarından
 * (`email_opt_outs`; kendi + üst + `all`) çıkmışsa e-posta gitmez, satır FAILED
 * yazılır (`EmailService.isOptedOut` ile aynı kapsamlar).
 */
function logListingMails<T extends ReturnType<typeof makeListingsService>>(listings: T): T {
  listings.email.send.mockImplementation(async (a: SendArg) => {
    const optedOut =
      (await prisma.emailOptOut.count({
        where: { email: a.to.email.trim().toLowerCase(), scope: { in: [...gatingPrefKeysForType(a.context.type), "all"] } },
      })) > 0;
    await prisma.emailLog.create({
      data: {
        template: a.templateData.template,
        toEmail: a.to.email,
        subject: a.subject ?? "s",
        provider: "test",
        status: optedOut ? "FAILED" : "SENT",
        ...(optedOut ? { errorMessage: "suppressed: opted out" } : {}),
        contextType: a.context.type,
        contextId: a.context.id,
      },
    });
    return { emailLogId: "t", sent: !optedOut };
  });
  return listings;
}

/**
 * YARIŞ İSTEMCİSİ (ikinci gözden geçirme A-5; kök CLAUDE.md "Yarış testi ayrı
 * istemci ister"). Paylaşılan test istemcisi `connection_limit=1`: etkileşimli
 * transaction'ları havuz zaten seri koşturur — eşzamanlılık testi satır kilidi
 * SÖKÜLSE de geçer. Burada çok bağlantılı ayrı bir istemci açılır ve bir
 * bariyer kurulur: transaction içinde `model.method` okumasını yapan her çağrı,
 * diğer `parties - 1` çağrı da aynı okumayı yapana dek (en çok `waitMs`) bekler.
 * Kilitsiz kodda hepsi "satır yok" görüp yazar; `SELECT … FOR UPDATE` varken
 * ikinci transaction kilitte bekler, bariyer zaman aşımıyla açılır ve yalnız
 * biri yazar. İş bitince `close()` (bağlantılar TRUNCATE ile yarışmasın).
 */
function racyClient(model: string, method: string, parties: number, waitMs = 400) {
  const base = TEST_DB_URL.replace(/[?&]connection_limit=\d+/, "");
  const multi = new PrismaClient({
    datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}connection_limit=${parties + 3}` } },
  });
  let arrived = 0;
  const waitOthers = async () => {
    arrived += 1;
    const until = Date.now() + waitMs;
    while (arrived < parties && Date.now() < until) await new Promise((res) => setTimeout(res, 10));
  };
  type Fn = (...args: unknown[]) => Promise<unknown>;
  const client = new Proxy(multi, {
    get(target, prop, recv) {
      if (prop !== "$transaction") return Reflect.get(target, prop, recv);
      return (arg: unknown, opts?: unknown) => {
        const run = target.$transaction.bind(target) as unknown as Fn;
        if (typeof arg !== "function") return run(arg, opts);
        return run(
          (tx: Record<string, Record<string, Fn>>) =>
            (arg as Fn)(
              new Proxy(tx, {
                get(t, k) {
                  if (k !== model) return Reflect.get(t, k);
                  return new Proxy(t[model]!, {
                    get(m, mk) {
                      if (mk !== method) return Reflect.get(m, mk);
                      return async (...args: unknown[]) => {
                        const out = await m[method]!(...args);
                        await waitOthers();
                        return out;
                      };
                    },
                  });
                },
              }),
            ),
          opts,
        );
      };
    },
  });
  return { client: client as unknown as typeof prisma, arrivals: () => arrived, close: () => multi.$disconnect() };
}

async function buyer(name = "Alıcı Makina AŞ", over: Parameters<typeof makeCompanyWithUser>[1] = {}) {
  return makeCompanyWithUser(prisma, { tier: "GOLD", name, country: "TR", ...over });
}

async function openRequest(
  owner: Awaited<ReturnType<typeof buyer>>,
  extra: Partial<Prisma.ListingUncheckedCreateInput> = {},
) {
  const l = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    aiDiscovery: true,
    inviteShowName: true,
    categoryIds: ["31161600"],
    publishedAt: new Date(),
    // Açılış duyurusu YAPILMIŞ talep (turu tek başına sınayan testler): tur
    // bitince salınacak bekletilmiş duyuru yok. Duyurunun turu beklediği asıl
    // yayın yolu "AI-4" bloğunda `openNotifiedAt: null` ile sınanır.
    openNotifiedAt: new Date(),
    closesAt: new Date(Date.now() + 10 * DAY),
    ...extra,
  });
  await makeItem(prisma, l.id, { name: "M6 cıvata", quantity: new Prisma.Decimal(100), unit: "adet" });
  return l;
}

/** Talebin GÖNDERİLMİŞ e-postaları (çıkış kapısına takılan sayılmaz): adres → bağlam tipleri (sıralı). */
async function mailsOf(listingId: string) {
  const rows = await prisma.emailLog.findMany({
    where: { contextId: listingId, status: { not: "FAILED" } },
    select: { toEmail: true, contextType: true },
  });
  const out: Record<string, string[]> = {};
  for (const r of rows) out[r.toEmail] = [...(out[r.toEmail] ?? []), r.contextType ?? ""].sort();
  return out;
}

/** Doğrulanmış, adresi kanıtlanmış üye — talebin kategorisinde satıyor. */
async function memberSeller(name: string, over: Parameters<typeof makeCompanyWithUser>[1] = {}) {
  const s = await makeCompanyWithUser(prisma, { tier: "SILVER", name, country: "TR", ...over });
  await proveAccounts(prisma, s.company.id);
  await prisma.company.update({
    where: { id: s.company.id },
    data: { sellerCategoryIds: ["31000000"], sellerSubCategoryIds: ["31161600"] },
  });
  return s;
}

const TR_WEB = { name: "Cıvata AŞ", email: "satis@civata.com.tr", country: "TR", reason: "r", items: [1] };
const IT_WEB = { name: "Viti Srl", email: "info@viti.it", country: "IT", reason: "r", items: [1] };

async function runPublish(r: ReturnType<typeof rig>, listingId: string) {
  const runId = (await r.runs.enqueue(listingId, "PUBLISH"))!;
  await r.runs.process(runId);
  return runId;
}

async function settle(check: () => Promise<boolean> | boolean, ms = 10_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((res) => setTimeout(res, 25));
  }
}

/** Kuyruktaki davetleri hemen gönderilebilir yap (mesai penceresini test dışı bırakır). */
async function makeDue() {
  await prisma.externalListingInvite.updateMany({ data: { sendAfter: new Date(Date.now() - MIN) } });
}

type View = Awaited<ReturnType<DiscoveryRunsService["forListing"]>>;
const outcomes = (view: View) =>
  Object.fromEntries(
    view.runs.flatMap((run) => run.candidates.map((c) => [c.name, c.inviteReason ? `${c.invite}:${c.inviteReason}` : c.invite])),
  );

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("yayın turu bulduğunu KENDİSİ davet eder", () => {
  it("onay yok: üye doğrudan talebe, diğerleri e-posta kuyruğuna (AI_AUTO) — talebi yayınlayan kişi adına; sonuç mesajı bir kez", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]] });
    const owner = await buyer();
    const member = await memberSeller("Bağlantı Ltd");
    const l = await openRequest(owner);

    const runId = await runPublish(r, l.id);

    // Rothern üyesi: doğrudan talep daveti (AI kaynaklı), davet eden = talebi açan.
    expect(
      await prisma.listingInvitation.findMany({
        where: { listingId: l.id },
        select: { invitedCompanyId: true, origin: true, invitedById: true },
      }),
    ).toEqual([{ invitedCompanyId: member.company.id, origin: "AI", invitedById: owner.user.id }]);
    // Kayıtsız firmalar: e-posta kuyruğu, kaynak AI_AUTO; bağlantı jetonu aynı kişi adına.
    const queued = await prisma.externalListingInvite.findMany({
      where: { listingId: l.id },
      orderBy: { email: "asc" },
      select: { email: true, source: true, state: true, inviterCompanyId: true, country: true, referralInvite: { select: { invitedById: true } } },
    });
    expect(queued).toEqual([
      { email: "info@viti.it", source: "AI_AUTO", state: "QUEUED", inviterCompanyId: owner.company.id, country: "IT", referralInvite: { invitedById: owner.user.id } },
      { email: "satis@civata.com.tr", source: "AI_AUTO", state: "QUEUED", inviterCompanyId: owner.company.id, country: "TR", referralInvite: { invitedById: owner.user.id } },
    ]);
    // Davet e-postası turda GÖNDERİLMEZ — dağıtıcı alıcının mesai saatinde gönderir.
    expect(await prisma.emailLog.count({ where: { contextType: "tender_external_invite" } })).toBe(0);

    const run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId }, include: { candidates: true } });
    expect(run.state).toBe("DONE");
    expect(run.notifiedAt).not.toBeNull();
    expect(run.candidates.map((c) => c.status).sort()).toEqual(["INVITED", "INVITED", "INVITED"]);

    // Ekran yalnız durum okur.
    const view = await r.runs.forListing(owner.auth, l.id);
    expect(outcomes(view)).toEqual({ "Bağlantı Ltd": "INVITED", "Cıvata AŞ": "QUEUED", "Viti Srl": "QUEUED" });
    const viti = view.runs[0]!.candidates.find((c) => c.name === "Viti Srl")!;
    expect(new Date(viti.sendAfter!).getTime()).toBeGreaterThan(Date.now() - MIN);

    // Sonuç mesajı: talebi yayınlayana bildirim + e-posta. İKİ sayı ayrı (AI-6):
    // talebe davet edilen üye ve sıraya alınan davet e-postası.
    expect(r.notifications.pushToUser).toHaveBeenCalledTimes(1);
    expect(r.notifications.pushToUser).toHaveBeenCalledWith(
      owner.user.id,
      expect.objectContaining({
        type: "ai_supplier_suggestions",
        titleKey: "api.notifications.discovery.invitedTitle",
        bodyKey: "api.notifications.discovery.invitedBodyBoth",
        params: expect.objectContaining({ members: 1, emails: 2 }),
        ctaPath: `/company/ilan/${l.id}?ai-davet=1`,
        portal: "satinalma",
      }),
    );
    const result = r.email.send.mock.calls.map((c) => c[0] as SendArg).filter((a) => a.context.type === "ai_supplier_suggestions");
    expect(result).toHaveLength(1);
    expect(result[0]!.to.email).toBe(owner.user.email);
    expect(result[0]!.subject).toBe("Talebinize 1 Rothern üyesi davet edildi, 2 davet e-postası sırada");
    const paragraphs = (result[0]!.templateData.data as { paragraphs: string[] }).paragraphs.join(" | ");
    expect(paragraphs).toContain("1 Rothern üyesi talebe davet edildi");
    expect(paragraphs).toContain("2 firmaya davet e-postası sıraya alındı");
    expect(JSON.stringify(result[0]!.templateData.data)).not.toMatch(/tek tıkla|seçili|istemediklerinizi|3 tedarikçi/);

    // İz kaydı: davetler talebi yayınlayan kişi adına, otomatik olduğu belli.
    await settle(async () => (await prisma.auditLog.count({ where: { entityId: l.id } })) >= 2);
    const audit = await prisma.auditLog.findMany({
      where: { entityId: l.id, action: { in: ["company.listing.ai_member_invited", "connection.external_tender_invite"] } },
      select: { action: true, actorId: true, metadata: true },
      orderBy: { action: "asc" },
    });
    expect(audit).toEqual([
      { action: "company.listing.ai_member_invited", actorId: owner.user.id, metadata: { invited: 1, auto: true } },
      { action: "connection.external_tender_invite", actorId: owner.user.id, metadata: { queued: 2, skipped: 0, source: "AI_AUTO" } },
    ]);

    // Dakikalık iş aynı turu yeniden işlemez; mesaj yinelenmez.
    await r.runs.tick(new Date(Date.now() + 30 * MIN));
    expect(await r.runs.process(runId)).toBe(false);
    expect(r.notifications.pushToUser).toHaveBeenCalledTimes(1);
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id } })).toBe(2);
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id } })).toBe(1);
  });

  it("hiçbir şey bulunmadıysa ya da kimse davet edilemediyse sonuç mesajı GİTMEZ", async () => {
    // Bulunan tek aday önceden onay isteyen ülkede → davet yok → mesaj yok.
    const r = rig({ batches: [[{ name: "Schrauben GmbH", email: "einkauf@schrauben.de", country: "DE", reason: "r" }]] });
    const owner = await buyer();
    const l = await openRequest(owner, { targetCountries: ["DE", "TR"] });
    const runId = await runPublish(r, l.id);
    const run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.state).toBe("DONE");
    expect(run.notifiedAt).toBeNull();
    expect(r.notifications.pushToUser).not.toHaveBeenCalled();
    expect(r.email.send).not.toHaveBeenCalled();

    // Hiç aday yok.
    const r2 = rig({ batches: [[], []] });
    const l2 = await openRequest(owner);
    await runPublish(r2, l2.id);
    await r2.runs.tick(new Date(Date.now() + 30 * MIN));
    expect(r2.notifications.pushToUser).not.toHaveBeenCalled();
    expect(r2.email.send).not.toHaveBeenCalled();
  });

  it("eski akıştan kalan (onay bekleyen) bitmiş turun adayları kendiliğinden davet EDİLMEZ, bildirilmez", async () => {
    const r = rig();
    const owner = await buyer();
    const member = await memberSeller("Eski Üye Ltd");
    const l = await openRequest(owner);
    await prisma.supplierDiscoveryRun.create({
      data: {
        listingId: l.id,
        companyId: owner.company.id,
        trigger: "PUBLISH",
        state: "DONE",
        finishedAt: new Date(Date.now() - 20 * MIN),
        candidates: {
          create: [
            { name: "Eski Üye Ltd", status: "MEMBER", memberCompanyId: member.company.id, source: "PLATFORM" },
            { name: "Viti Srl", status: "SUGGESTED", email: "info@viti.it", scope: "ABROAD", source: "WEB" },
          ],
        },
      },
    });
    await r.runs.tick(new Date());
    expect(await prisma.listingInvitation.count()).toBe(0);
    expect(await prisma.externalListingInvite.count()).toBe(0);
    expect(r.notifications.pushToUser).not.toHaveBeenCalled();
    // Ekranda "davet edilmedi" (onaylanacak bir şey yok).
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({ "Eski Üye Ltd": "NOT_SENT", "Viti Srl": "NOT_SENT" });

    // Alıcının onaylamadığı eski aramanın İKİNCİ TURU da açılmaz (o tur artık
    // bulduğunu kendisi davet ederdi): süre yarılandı, teklif yok — yine de yok.
    await prisma.listing.update({
      where: { id: l.id },
      data: { publishedAt: new Date(Date.now() - 6 * DAY), closesAt: new Date(Date.now() + 4 * DAY) },
    });
    expect((await r.runs.tick(new Date())).secondRounds).toBe(0);
    expect(await prisma.supplierDiscoveryRun.count({ where: { listingId: l.id } })).toBe(1);
    expect(r.ai.callAiSystem).not.toHaveBeenCalled();
  });
});

describe("aday iki kez davet edilmez; tur çökmeden sonra güvenle sürer", () => {
  it("davet aşaması yarıda kaldı (beklenmeyen hata): tur RUNNING kalır, dakikalık iş KALDIĞI YERDEN sürdürür — arama yeniden koşmaz, davet edilmiş üyeye ikinci davet gitmez", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]] });
    const owner = await buyer();
    const member = await memberSeller("Bağlantı Ltd");
    const l = await openRequest(owner);
    const external = jest.spyOn(r.connections, "inviteExternalForListing");
    external.mockRejectedValueOnce(new Error("connection reset"));
    const members = jest.spyOn(r.listings.service, "inviteDiscoveredMembers");

    const runId = await runPublish(r, l.id);
    let run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId }, include: { candidates: true } });
    expect(run.state).toBe("RUNNING");
    // Harcama davetten ÖNCE yazıldı (tur ölse de günlük tavana girer).
    expect(Number(run.costUsd)).toBeCloseTo(0.12);
    expect(run.candidates.map((c) => c.status).sort()).toEqual(["INVITED", "SUGGESTED", "SUGGESTED"]);
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id } })).toBe(1);
    expect(await prisma.externalListingInvite.count()).toBe(0);
    expect(r.notifications.pushToUser).not.toHaveBeenCalled();
    expect(r.ai.callAiSystem).toHaveBeenCalledTimes(4);

    // Kira dolmadan dokunulmaz.
    await r.runs.tick(new Date(Date.now() + 5 * MIN));
    expect(await prisma.externalListingInvite.count()).toBe(0);

    // Kira doldu → kaldığı yerden.
    const out = await r.runs.tick(new Date(Date.now() + 16 * MIN));
    expect(out.notified).toBe(1);
    run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId }, include: { candidates: true } });
    expect(run.state).toBe("DONE");
    expect(run.candidates.map((c) => c.status)).toEqual(["INVITED", "INVITED", "INVITED"]);
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id, invitedCompanyId: member.company.id } })).toBe(1);
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id } })).toBe(2);
    // Arama yeniden koşmadı; üye daveti ikinci kez çağrılmadı.
    expect(r.ai.callAiSystem).toHaveBeenCalledTimes(4);
    expect(members).toHaveBeenCalledTimes(1);
    expect(r.notifications.pushToUser).toHaveBeenCalledTimes(1);
    expect(r.notifications.pushToUser).toHaveBeenCalledWith(
      owner.user.id,
      expect.objectContaining({ params: expect.objectContaining({ members: 1, emails: 2 }) }),
    );

    // Üçüncü tur bir şey yapmaz.
    await r.runs.tick(new Date(Date.now() + 40 * MIN));
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id } })).toBe(2);
    expect(r.notifications.pushToUser).toHaveBeenCalledTimes(1);
  });

  it("AI-5: davet yazıldı ama durumu yazılamadan süreç öldü — sürdürülen tur aynı adayı yeniden DAVET ETMEZ, ama kendi davet ettiğini DAVET EDİLDİ sayar: alıcıya sonuç mesajı gider, liste 'zaten davetliydi' demez", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]] });
    const owner = await buyer();
    const member = await memberSeller("Bağlantı Ltd");
    const l = await openRequest(owner);
    // İki davet metodu da işini YAPAR (satırlar yazılır), sonra bağlantı kopar:
    // aday durumları yazılamadan tur yarıda kalır.
    const realMembers = r.listings.service.inviteDiscoveredMembers.bind(r.listings.service);
    const members = jest.spyOn(r.listings.service, "inviteDiscoveredMembers").mockImplementationOnce(async (...args) => {
      await realMembers(...args);
      throw new Error("connection reset");
    });
    const runId = await runPublish(r, l.id);
    let run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId }, include: { candidates: true } });
    expect(run.state).toBe("RUNNING");
    expect(run.candidates.map((c) => c.status).sort()).toEqual(["MEMBER", "SUGGESTED", "SUGGESTED"]);
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id } })).toBe(1);

    // Sürdürme 1: üye "zaten davetli" döner (bu tur davet etti) → INVITED; bu
    // kez e-posta daveti satırları yazıp ölür.
    const realExternal = r.connections.inviteExternalForListing.bind(r.connections);
    jest.spyOn(r.connections, "inviteExternalForListing").mockImplementationOnce(async (...args) => {
      await realExternal(...args);
      throw new Error("connection reset");
    });
    await r.runs.tick(new Date(Date.now() + 16 * MIN));
    run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId }, include: { candidates: true } });
    expect(run.state).toBe("RUNNING");
    expect(run.candidates.map((c) => c.status).sort()).toEqual(["INVITED", "SUGGESTED", "SUGGESTED"]);
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id, state: "QUEUED" } })).toBe(2);
    expect(r.notifications.pushToUser).not.toHaveBeenCalled();

    // Sürdürme 2: adresler "zaten davetli" döner (bu tur kuyruğa aldı) → INVITED.
    const out = await r.runs.tick(new Date(Date.now() + 32 * MIN));
    expect(out.notified).toBe(1);
    run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId }, include: { candidates: true } });
    expect(run.state).toBe("DONE");
    expect(run.notifiedAt).not.toBeNull();
    expect(run.candidates.map((c) => c.status)).toEqual(["INVITED", "INVITED", "INVITED"]);
    // Hiçbir davet yinelenmedi.
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id, invitedCompanyId: member.company.id } })).toBe(1);
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id } })).toBe(2);
    expect(members).toHaveBeenCalledTimes(2);
    await settle(async () => (await prisma.emailLog.count({ where: { contextType: "listing_invitation_ai" } })) >= 1);
    expect(await prisma.emailLog.count({ where: { contextType: "listing_invitation_ai" } })).toBe(1);
    expect(r.ai.callAiSystem).toHaveBeenCalledTimes(4);
    // Alıcıya ne söylendi: 1 üye + 2 e-posta; liste kendi davetini gösterir.
    expect(r.notifications.pushToUser).toHaveBeenCalledTimes(1);
    expect(r.notifications.pushToUser).toHaveBeenCalledWith(
      owner.user.id,
      expect.objectContaining({ params: expect.objectContaining({ members: 1, emails: 2 }) }),
    );
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({
      "Bağlantı Ltd": "INVITED",
      "Cıvata AŞ": "QUEUED",
      "Viti Srl": "QUEUED",
    });
  });

  it("AI-5: tur BAŞLAMADAN önce davetli olan (alıcının kendi daveti) 'zaten davetliydi' kalır ve sonuç mesajına sayılmaz", async () => {
    const r = rig();
    const owner = await buyer();
    const member = await memberSeller("Bağlantı Ltd");
    const l = await openRequest(owner);
    const ref = await prisma.companyReferralInvite.create({
      data: { inviterCompanyId: owner.company.id, email: "info@viti.it", invitedById: owner.user.id },
    });
    await prisma.listingInvitation.create({
      data: { listingId: l.id, invitedCompanyId: member.company.id, invitedById: owner.user.id, notifiedAt: new Date() },
    });
    await prisma.externalListingInvite.create({
      data: { listingId: l.id, inviterCompanyId: owner.company.id, referralInviteId: ref.id, email: "info@viti.it", locale: "en", source: "MANUAL" },
    });
    const stuck = await prisma.supplierDiscoveryRun.create({
      data: {
        listingId: l.id,
        companyId: owner.company.id,
        trigger: "PUBLISH",
        state: "RUNNING",
        startedAt: new Date(Date.now() - 20 * MIN),
        candidates: {
          create: [
            { name: "Bağlantı Ltd", status: "MEMBER", memberCompanyId: member.company.id, source: "PLATFORM" },
            { name: "Viti Srl", status: "SUGGESTED", email: "info@viti.it", country: "IT", scope: "ABROAD", source: "WEB" },
          ],
        },
      },
    });
    await r.runs.tick(new Date());
    const run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: stuck.id }, include: { candidates: true } });
    expect(run.state).toBe("DONE");
    expect(run.notifiedAt).toBeNull();
    expect(run.candidates.map((c) => c.status)).toEqual(["ALREADY_INVITED", "ALREADY_INVITED"]);
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id } })).toBe(1);
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id } })).toBe(1);
    await new Promise((res) => setTimeout(res, 150));
    expect(r.listings.email.send).not.toHaveBeenCalled();
    expect(r.notifications.pushToUser).not.toHaveBeenCalled();
    expect(r.ai.callAiSystem).not.toHaveBeenCalled();
  });

  it("adayı olmayan takılı tur ve sürdürme penceresini (6 saat) aşan tur FAILED olur; davet gitmez", async () => {
    const r = rig();
    const owner = await buyer();
    const l = await openRequest(owner);
    const noCandidates = await prisma.supplierDiscoveryRun.create({
      data: { listingId: l.id, companyId: owner.company.id, trigger: "PUBLISH", state: "RUNNING", startedAt: new Date(Date.now() - 20 * MIN) },
    });
    const tooOld = await prisma.supplierDiscoveryRun.create({
      data: {
        listingId: l.id,
        companyId: owner.company.id,
        trigger: "SECOND_ROUND",
        state: "RUNNING",
        createdAt: new Date(Date.now() - 7 * 3_600_000),
        startedAt: new Date(Date.now() - 20 * MIN),
        candidates: { create: [{ name: "Viti Srl", status: "SUGGESTED", email: "info@viti.it", source: "WEB" }] },
      },
    });
    await r.runs.tick(new Date());
    const rows = await prisma.supplierDiscoveryRun.findMany({ where: { id: { in: [noCandidates.id, tooOld.id] } }, select: { state: true, error: true } });
    expect(rows).toEqual([
      { state: "FAILED", error: "stuck" },
      { state: "FAILED", error: "stuck" },
    ]);
    expect(await prisma.externalListingInvite.count()).toBe(0);
  });

  it("ikinci tur yalnız YENİ bulunanı davet eder; talep başına en fazla iki otomatik tur", async () => {
    const r = rig({
      batches: [[], [IT_WEB], [], [IT_WEB, { name: "Neue Srl", email: "info@neue.it", country: "IT", reason: "r" }]],
    });
    const owner = await buyer();
    const l = await openRequest(owner, {
      publishedAt: new Date(Date.now() - 6 * DAY),
      closesAt: new Date(Date.now() + 4 * DAY),
    });
    await runPublish(r, l.id);
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id } })).toBe(1);

    const tick = await r.runs.tick(new Date());
    expect(tick.secondRounds).toBe(1);
    await r.runs.tick(new Date());
    const all = await prisma.supplierDiscoveryRun.findMany({ orderBy: { createdAt: "asc" }, include: { candidates: true } });
    expect(all.map((x) => [x.trigger, x.state])).toEqual([
      ["PUBLISH", "DONE"],
      ["SECOND_ROUND", "DONE"],
    ]);
    expect(all[1]!.candidates.map((c) => [c.email, c.status])).toEqual([["info@neue.it", "INVITED"]]);
    expect((await prisma.externalListingInvite.findMany({ where: { listingId: l.id }, orderBy: { email: "asc" }, select: { email: true } })).map((x) => x.email)).toEqual([
      "info@neue.it",
      "info@viti.it",
    ]);
    // İki tur da kendi sonucunu bildirir (her biri bir kez).
    expect(r.notifications.pushToUser).toHaveBeenCalledTimes(2);
    // Üçüncü otomatik tur AÇILMAZ.
    for (let i = 0; i < 3; i++) await r.runs.tick(new Date(Date.now() + (i + 1) * 60 * MIN));
    expect(await prisma.supplierDiscoveryRun.count({ where: { listingId: l.id } })).toBe(2);
  });
});

describe("frenler aynen işler", () => {
  it("FİRMA GÜNLÜK TAVANI (60, üye + e-posta ORTAK): sığan davet edilir, kalan DAILY_LIMIT — kuyruğa girmez", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]] });
    const owner = await buyer();
    await memberSeller("Bağlantı Ltd");
    const other = await openRequest(owner, { aiDiscovery: false });
    const ref = await prisma.companyReferralInvite.create({
      data: { inviterCompanyId: owner.company.id, email: "ref@cap.com", invitedById: owner.user.id },
    });
    await prisma.externalListingInvite.createMany({
      data: Array.from({ length: 59 }, (_, i) => ({
        listingId: other.id,
        inviterCompanyId: owner.company.id,
        referralInviteId: ref.id,
        email: `t${i}@cap.com`,
        locale: "tr",
      })),
    });
    const l = await openRequest(owner);
    await runPublish(r, l.id);

    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({
      "Bağlantı Ltd": "INVITED",
      "Cıvata AŞ": "NOT_SENT:DAILY_LIMIT",
      "Viti Srl": "NOT_SENT:DAILY_LIMIT",
    });
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id } })).toBe(0);
    // Kuyruğa girmeyen adres "sıraya alındı" sayılmaz: mesaj yalnız üyeyi söyler.
    expect(r.notifications.pushToUser).toHaveBeenCalledWith(
      owner.user.id,
      expect.objectContaining({
        bodyKey: "api.notifications.discovery.invitedBodyMembers",
        params: expect.objectContaining({ members: 1, emails: 0 }),
      }),
    );
  });

  it("PLATFORM SOĞUK DAVET TAVANI: tavan kadar e-posta gider, kalanı kuyrukta bekler; durdurma anahtarı (0) hiç göndermez", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]], config: { COLD_INVITE_BASE_DAILY: "1" } });
    const owner = await buyer();
    const l = await openRequest(owner);
    await runPublish(r, l.id);
    await makeDue();
    const report = await r.dispatcher.dispatch();
    expect(report.cap.cap).toBe(1);
    expect(report.sent).toBe(1);
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id, state: "QUEUED" } })).toBe(1);
    const states = Object.values(outcomes(await r.runs.forListing(owner.auth, l.id))).sort();
    expect(states).toEqual(["INVITED", "QUEUED"]);

    const stop = rig({ batches: [[TR_WEB], []], config: { COLD_INVITE_MAX_DAILY: "0" } });
    const l2 = await openRequest(owner);
    await runPublish(stop, l2.id);
    await makeDue();
    expect((await stop.dispatcher.dispatch()).sent).toBe(0);
    expect(await prisma.externalListingInvite.count({ where: { listingId: l2.id, state: "QUEUED" } })).toBe(1);
  });

  it("PLATFORM FRENİ: son 7 günde şikâyet varsa tavan yarıya iner (AI_AUTO davetleri de)", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]], config: { COLD_INVITE_BASE_DAILY: "2" } });
    const owner = await buyer();
    const threeDaysAgo = new Date(Date.now() - 3 * DAY);
    await prisma.emailLog.createMany({
      data: ["x@sikayet.com", "y@sikayet.com"].map((toEmail) => ({
        template: "tender_external_invite",
        toEmail,
        subject: "s",
        provider: "test",
        status: "SENT" as const,
        contextType: "tender_external_invite",
        contextId: "eski",
        queuedAt: threeDaysAgo,
        complainedAt: threeDaysAgo,
      })),
    });
    const l = await openRequest(owner);
    await runPublish(r, l.id);
    await makeDue();
    const report = await r.dispatcher.dispatch();
    expect(report.cap).toEqual({ cap: 1, braked: "complaints" });
    expect(report.sent).toBe(1);
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id, state: "QUEUED" } })).toBe(1);
  });

  it("ADRES BAŞINA 7 GÜN: bu hafta davet almış adrese AI daveti ERTELENİR (kuyrukta kalır)", async () => {
    const r = rig({ batches: [[TR_WEB], []] });
    const owner = await buyer();
    await prisma.emailLog.create({
      data: {
        template: "tender_external_invite",
        toEmail: TR_WEB.email,
        subject: "s",
        provider: "test",
        status: "SENT",
        contextType: "tender_external_invite",
        contextId: "baska-alici",
        queuedAt: new Date(Date.now() - 2 * DAY),
      },
    });
    const l = await openRequest(owner);
    await runPublish(r, l.id);
    await makeDue();
    const report = await r.dispatcher.dispatch();
    expect(report.sent).toBe(0);
    expect(report.deferred).toBe(1);
    const row = await prisma.externalListingInvite.findFirstOrThrow({ where: { listingId: l.id } });
    expect(row.state).toBe("QUEUED");
    expect(row.sendAfter.getTime()).toBeGreaterThan(Date.now() + 4 * DAY);
    expect(r.email.send.mock.calls.filter((c) => (c[0] as SendArg).context.type === "tender_external_invite")).toHaveLength(0);
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({ "Cıvata AŞ": "QUEUED" });
  });

  it("ÖZET: iki alıcının turu aynı adresi bulduysa adrese TEK e-posta (iki kart) gider", async () => {
    const a = await buyer("Alıcı A AŞ");
    const b = await buyer("Alıcı B AŞ");
    const la = await openRequest(a);
    const lb = await openRequest(b);
    const ra = rig({ batches: [[TR_WEB], []] });
    await runPublish(ra, la.id);
    const rb = rig({ batches: [[TR_WEB], []] });
    await runPublish(rb, lb.id);
    await makeDue();
    const report = await rb.dispatcher.dispatch();
    expect(report.sent).toBe(1);
    const sent = rb.email.send.mock.calls.map((c) => c[0] as SendArg).filter((x) => x.context.type === "tender_external_invite");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.templateData.template).toBe("tender_invite_digest");
    expect((sent[0]!.templateData.data.invites as Array<{ inviterName: string }>).map((i) => i.inviterName).sort()).toEqual([
      "Alıcı A AŞ",
      "Alıcı B AŞ",
    ]);
    expect(await prisma.externalListingInvite.count({ where: { state: "SENT" } })).toBe(2);
  });

  it("ÖNCEDEN ONAY İSTEYEN ÜLKE (DE, CA): AI'ın bulduğu adrese davet GİTMEZ (etiket, e-posta ya da site uzantısı)", async () => {
    const r = rig({
      batches: [
        [
          { name: "Schrauben GmbH", email: "einkauf@schrauben.de", country: "DE", reason: "r" },
          { name: "Etiketsiz GmbH", email: "info@etiketsiz.de", reason: "r" },
          { name: "Bolts Inc", email: "sales@bolts.ca", country: "CA", reason: "r" },
          TR_WEB,
        ],
      ],
    });
    const owner = await buyer();
    const l = await openRequest(owner, { targetCountries: ["DE", "CA", "TR"] });
    await runPublish(r, l.id);
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({
      "Schrauben GmbH": "NOT_SENT:CONSENT_REQUIRED",
      "Etiketsiz GmbH": "NOT_SENT:CONSENT_REQUIRED",
      "Bolts Inc": "NOT_SENT:CONSENT_REQUIRED",
      "Cıvata AŞ": "QUEUED",
    });
    expect((await prisma.externalListingInvite.findMany({ select: { email: true } })).map((x) => x.email)).toEqual([TR_WEB.email]);
  });

  it("MX, ÇIKIŞ ve KAYDA KAPALI ÜLKE: posta almayan alan adı, davet istemeyen adres ve ABD/İran adresi aday bile olmaz", async () => {
    const r = rig({
      batches: [
        [
          { name: "MX Yok AŞ", email: "info@mxyok.com.tr", country: "TR", reason: "r" },
          { name: "İstemiyor AŞ", email: "info@istemiyor.com.tr", country: "TR", reason: "r" },
          { name: "Pipes Inc", email: "sales@pipes.us", country: "US", reason: "r" },
          { name: "Etiketi Yanlış", email: "info@firma.ir", country: "TR", reason: "r" },
          TR_WEB,
        ],
        [],
      ],
      mx: (e) => e !== "info@mxyok.com.tr",
    });
    const owner = await buyer();
    await prisma.referralOptOut.create({ data: { email: "info@istemiyor.com.tr" } });
    const l = await openRequest(owner);
    await runPublish(r, l.id);
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({ "Cıvata AŞ": "QUEUED" });
    expect((await prisma.externalListingInvite.findMany({ select: { email: true } })).map((x) => x.email)).toEqual([TR_WEB.email]);
  });

  it("kuyruğa girdikten SONRA çıkan ya da suppress edilen adrese e-posta gitmez; ekran nedenini söyler", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]] });
    const owner = await buyer();
    const l = await openRequest(owner);
    await runPublish(r, l.id);
    await prisma.referralOptOut.create({ data: { email: TR_WEB.email } });
    // Sağlayıcı kapısı (suppression) göndermedi → sent:false.
    r.email.send.mockResolvedValue({ emailLogId: "t", sent: false, skipReason: "suppressed" });
    await makeDue();
    const report = await r.dispatcher.dispatch();
    expect(report.sent).toBe(0);
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({
      "Cıvata AŞ": "NOT_SENT:OPTED_OUT",
      "Viti Srl": "NOT_SENT:SUPPRESSED",
    });
  });

  it("STAGING ALICI İZİN LİSTESİ: listede olmayan AI adresine e-posta sağlayıcıya GİTMEZ; ekran 'bu ortamda gönderilmedi' nedenini taşır", async () => {
    const config = {
      get: jest.fn((k: string) =>
        k === "EMAIL_ALLOWLIST" ? "satis@civata.com.tr" : k === "JWT_SECRET" ? "integration-secret" : k === "WEB_URL" ? "http://localhost:3000" : undefined,
      ),
      getOrThrow: jest.fn(),
    };
    const real = new EmailService(config as never, prisma as never);
    const providerSend = jest.fn().mockResolvedValue({ providerMessageId: "pm1" });
    (real as unknown as { client: unknown }).client = { send: providerSend };
    (real as unknown as { providerName: string }).providerName = "resend";
    const r = rig({ batches: [[TR_WEB], [IT_WEB]], email: real });
    const owner = await buyer();
    const l = await openRequest(owner);
    await runPublish(r, l.id);
    await makeDue();
    await r.dispatcher.dispatch();

    const provided = providerSend.mock.calls.map((c) => (c[0] as { to: string | { email: string } }).to);
    expect(JSON.stringify(provided)).toContain("satis@civata.com.tr");
    expect(JSON.stringify(provided)).not.toContain("info@viti.it");
    expect(
      await prisma.externalListingInvite.findMany({ where: { listingId: l.id }, orderBy: { email: "asc" }, select: { email: true, state: true, cancelReason: true } }),
    ).toEqual([
      { email: "info@viti.it", state: "CANCELLED", cancelReason: "ALLOWLIST" },
      { email: "satis@civata.com.tr", state: "SENT", cancelReason: null },
    ]);
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({ "Cıvata AŞ": "INVITED", "Viti Srl": "NOT_SENT:ALLOWLIST" });
  });

  it("ENGELLİ / ASKIDAKİ FİRMA ve YALNIZ DOĞRULANMIŞ ÜYE: engellediğim, askıdaki ve doğrulanmamış üye davet edilmez; web'de adresi çıkan engelli üye NOT_ELIGIBLE", async () => {
    const owner = await buyer();
    const good = await memberSeller("Uygun Ltd");
    const blocked = await memberSeller("Engelli Ltd");
    await prisma.companyBlock.create({ data: { blockerCompanyId: owner.company.id, blockedCompanyId: blocked.company.id } });
    const suspended = await memberSeller("Askıda Ltd");
    await prisma.company.update({ where: { id: suspended.company.id }, data: { isBlocked: true } });
    const unverified = await memberSeller("Belgesiz Ltd", { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" });
    // Web'de adresi bulunan, alıcının engellediği üye (keşif dizini onu zaten dışlar).
    const r = rig({
      batches: [
        [
          { name: "Engelli Ltd", email: blocked.user.email, country: "TR", reason: "r" },
          { name: "Askıda Ltd", email: suspended.user.email, country: "TR", reason: "r" },
          { name: "Belgesiz Ltd", email: unverified.user.email, country: "TR", reason: "r" },
        ],
        [],
      ],
    });
    (r.listings.blocks.blockedCompanyIds as jest.Mock).mockResolvedValue([blocked.company.id]);
    const l = await openRequest(owner);
    await runPublish(r, l.id);

    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({
      "Uygun Ltd": "INVITED",
      "Engelli Ltd": "NOT_SENT:NOT_ELIGIBLE",
    });
    expect((await prisma.listingInvitation.findMany({ where: { listingId: l.id }, select: { invitedCompanyId: true } })).map((x) => x.invitedCompanyId)).toEqual([
      good.company.id,
    ]);
    // Kayıtlı üyenin adresine e-posta daveti de gitmez.
    expect(await prisma.externalListingInvite.count()).toBe(0);
  });

  it("TALEBİN GÖRÜNÜRLÜK ÜLKESİ: yalnız Türkiye'ye açık talepte yabancı üye ve yabancı web firması davet edilmez", async () => {
    const r = rig({ batches: [[TR_WEB, IT_WEB]] });
    const owner = await buyer();
    const local = await memberSeller("Yerli Ltd");
    await memberSeller("Auslands GmbH", { country: "AT" });
    const l = await openRequest(owner, { targetCountries: ["TR"] });
    await runPublish(r, l.id);
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({ "Yerli Ltd": "INVITED", "Cıvata AŞ": "QUEUED" });
    expect((await prisma.listingInvitation.findMany({ select: { invitedCompanyId: true } })).map((x) => x.invitedCompanyId)).toEqual([local.company.id]);
    // Tek geçiş (yalnız o ülke): araştırma + ayrıştırma.
    expect(r.ai.callAiSystem).toHaveBeenCalledTimes(2);
  });

  it("AI PLATFORM BÜTÇESİ: tavan doluyken (ya da 0) model ÇAĞRILMAZ; model istemeyen platform üyesi yine davet edilir", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]], config: { AI_DISCOVERY_DAILY_USD: "0" } });
    const owner = await buyer();
    const member = await memberSeller("Bağlantı Ltd");
    const l = await openRequest(owner);
    const runId = await runPublish(r, l.id);
    expect(r.ai.callAiSystem).not.toHaveBeenCalled();
    const run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId } });
    expect([run.state, run.error]).toEqual(["DONE", "platform_daily_budget"]);
    expect(await prisma.externalListingInvite.count()).toBe(0);
    expect((await prisma.listingInvitation.findMany({ select: { invitedCompanyId: true } })).map((x) => x.invitedCompanyId)).toEqual([member.company.id]);
  });

  it("YAYINLAYAN ARTIK DAVET EDEMİYORSA kimse davet edilmez: askıdaki firma, pasif kullanıcı, doğrulaması düşen firma, alınan yönetim izni", async () => {
    const cases: Array<[string, (o: Awaited<ReturnType<typeof buyer>>) => Promise<unknown>]> = [
      ["askıdaki firma", (o) => prisma.company.update({ where: { id: o.company.id }, data: { isBlocked: true } })],
      ["pasif kullanıcı", (o) => prisma.companyUser.update({ where: { id: o.user.id }, data: { isActive: false } })],
      ["doğrulaması düşen firma", (o) => prisma.company.update({ where: { id: o.company.id }, data: { companyVerificationStatus: "UNVERIFIED", tier: "STANDART" } })],
      ["yönetim izni alınmış", (o) => prisma.companyUser.update({ where: { id: o.user.id }, data: { roles: ["SATISCI"], permissions: ["sell:view"] } })],
    ];
    for (const [label, breakIt] of cases) {
      await truncateAll();
      const r = rig({ batches: [[TR_WEB], []] });
      const owner = await buyer();
      // Kurucu olmayan bir kullanıcı açsın (kurucunun örtük izinleri araya girmesin).
      const creator = await prisma.companyUser.create({
        data: { companyId: owner.company.id, email: `acan-${Date.now()}@firma.com`, firstName: "Açan", lastName: "Kişi", roles: ["SATIN_ALMACI"], permissions: ["buy:view", "buy:listing:manage"], isActive: true },
      });
      await memberSeller("Bağlantı Ltd");
      const l = await openRequest({ ...owner, user: creator } as never);
      const runId = (await r.runs.enqueue(l.id, "PUBLISH"))!;
      await breakIt({ ...owner, user: creator } as never);
      await r.runs.process(runId);

      const cands = await prisma.supplierDiscoveryCandidate.findMany({ where: { runId }, select: { status: true } });
      expect([label, cands.map((c) => c.status).sort()]).toEqual([label, ["NOT_ALLOWED", "NOT_ALLOWED"]]);
      expect([label, await prisma.listingInvitation.count()]).toEqual([label, 0]);
      expect([label, await prisma.externalListingInvite.count()]).toEqual([label, 0]);
      expect([label, (await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId } })).state]).toEqual([label, "DONE"]);
      expect(r.notifications.pushToUser).not.toHaveBeenCalled();
    }
  });

  it("ÖZEL TALEPTE otomatik arama YOK: tur yazılmaz; yazılmış tur özele çevrildiyse koşmaz, kimse davet edilmez", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]] });
    const owner = await buyer();
    await memberSeller("Bağlantı Ltd");
    // Yayın duyurusu özel talebe tur yazmaz (kutu API'den açık gelse de).
    const priv = await openRequest(owner, { visibility: "PRIVATE" });
    await r.listings.service.announceListingOpen(priv.id, "invitation");
    expect(await prisma.supplierDiscoveryRun.count({ where: { listingId: priv.id } })).toBe(0);
    // Telafi ve ikinci tur taraması da yazmaz.
    await prisma.listing.update({ where: { id: priv.id }, data: { openNotifiedAt: new Date(Date.now() - DAY) } });
    expect((await r.runs.tick(new Date())).caughtUp).toBe(0);
    expect((await r.runs.forListing(owner.auth, priv.id)).aiDiscovery).toBe(false);

    // Tur yazıldıktan sonra talep özele çevrildi.
    const l = await openRequest(owner);
    const runId = (await r.runs.enqueue(l.id, "PUBLISH"))!;
    await prisma.listing.update({ where: { id: l.id }, data: { visibility: "PRIVATE" } });
    await r.runs.process(runId);
    const run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId } });
    expect([run.state, run.error]).toEqual(["FAILED", "private_listing"]);
    expect(r.ai.callAiSystem).not.toHaveBeenCalled();
    expect(await prisma.listingInvitation.count()).toBe(0);
    expect(await prisma.externalListingInvite.count()).toBe(0);
  });
});

describe("davetin içeriği: hangi firma davet etti + kalemler; beyaz liste dışına çıkmaz", () => {
  async function publishWithSecrets(showName: boolean) {
    const r = rig({ batches: [[TR_WEB], []] });
    const owner = await buyer("ABC İnşaat");
    const member = await memberSeller("Bağlantı Ltd");
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
    const l = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      aiDiscovery: true,
      inviteShowName: showName,
      title: "Cıvata alımı",
      categoryIds: ["31161600"],
      deliveryAddressId: address.id,
      publishedAt: new Date(),
      closesAt: new Date(Date.now() + 10 * DAY),
    });
    await makeItem(prisma, l.id, {
      name: "M6 cıvata",
      quantity: new Prisma.Decimal(1200),
      unit: "adet",
      unitCode: "PCE",
      targetPrice: new Prisma.Decimal(99),
      brand: "GİZLİ MARKA",
      specification: "DIN 933 GİZLİ ŞARTNAME",
    } as never);
    // GERÇEK yayın sırası (AI-4): önce açılış duyurusu, sonra dakikalık tur.
    // Eskiden bu test turu doğrudan çağırıyordu; asıl yolda üyeye önce anonim
    // kategori duyurusu gidiyor, firma adını taşıyan davet düşüyordu.
    expect((await r.listings.service.announceListingOpen(l.id, "invitation")).status).toBe("held");
    await r.runs.tick();
    await makeDue();
    await r.dispatcher.dispatch();
    await settle(async () => (await prisma.emailLog.count({ where: { toEmail: member.user.email } })) >= 1);
    await new Promise((res) => setTimeout(res, 150));
    const external = r.email.send.mock.calls.map((c) => c[0] as SendArg).find((a) => a.context.type === "tender_external_invite")!;
    const memberMails = r.listings.email.send.mock.calls.map((c) => c[0] as SendArg).filter((a) => a.to.email === member.user.email);
    // Üyeye bu talep için TEK e-posta: davet (anonim kategori duyurusu değil).
    expect(memberMails.map((a) => a.context.type)).toEqual(["listing_invitation_ai"]);
    return { external, toMember: memberMails[0]! };
  }

  it("firma adı açık: kayıtsız firmaya 'ABC İnşaat' adıyla, kalem adı + miktar + birimle gider; üye e-postası da firmayı ve kalemleri yazar", async () => {
    const { external, toMember } = await publishWithSecrets(true);

    expect(external.templateData.template).toBe("tender_external_invite");
    expect(external.fromName).toBe("ABC İnşaat (Rothern üzerinden)");
    expect(external.templateData.data).toMatchObject({
      inviterName: "ABC İnşaat",
      tenderTitle: "Cıvata alımı",
      items: [{ name: "M6 cıvata", quantity: 1200, unitCode: "PCE", unit: "adet" }],
      itemCount: 1,
      deliveryPlace: expect.stringMatching(/^İzmir, /),
    });
    const payload = JSON.stringify(external.templateData.data);
    for (const secret of ["GİZLİ MARKA", "GİZLİ ŞARTNAME", "targetPrice", "10001", "Çiğli", "35620"]) expect(payload).not.toContain(secret);

    expect(toMember.context.type).toBe("listing_invitation_ai");
    expect(toMember.subject).toBe("ABC İnşaat sizi bir alım talebine davet etti");
    const rows = (toMember.templateData.data as { infoRows: Array<{ label: string; value: string; items?: string[] }> }).infoRows;
    expect(rows[0]).toEqual({ label: "Davet eden firma", value: "ABC İnşaat" });
    expect(rows.find((x) => x.items)?.items).toEqual(["M6 cıvata — 1.200 adet"]);
    const memberPayload = JSON.stringify(toMember.templateData.data);
    for (const secret of ["GİZLİ MARKA", "GİZLİ ŞARTNAME", "10001", "Çiğli", "35620"]) expect(memberPayload).not.toContain(secret);
  });

  it("firma adı kapalı: iki e-postada da ad YOK ('Bir alıcı firma', gönderen Rothern); kalemler yine gider", async () => {
    const { external, toMember } = await publishWithSecrets(false);

    expect(external.fromName).toBeUndefined();
    expect(external.templateData.data).toMatchObject({
      inviterName: "Bir alıcı firma",
      items: [{ name: "M6 cıvata", quantity: 1200, unitCode: "PCE", unit: "adet" }],
    });
    expect(JSON.stringify(external.templateData.data)).not.toContain("ABC İnşaat");

    expect(toMember.subject).toBe("Sattıklarınıza uygun bir alım talebine davet edildiniz");
    const memberPayload = JSON.stringify(toMember.templateData.data);
    expect(memberPayload).not.toContain("ABC İnşaat");
    expect(memberPayload).not.toContain("Davet eden firma");
    expect(memberPayload).toContain("M6 cıvata");
  });
});

/* ------------------------------------------------------------------------ *
 * GÖZDEN GEÇİRME 2026-10-09 (AI-1 … AI-6) — bağımsız incelemenin doğruladığı
 * kusurlar. Her blok düzeltme olmadan kırmızıdır.
 * ------------------------------------------------------------------------ */

/** Arka plandaki (fire-and-forget) bildirimler yazılsın. */
const quiet = (ms = 250) => new Promise((res) => setTimeout(res, ms));

/** Düzenleme formunun gövdesi (hızlı talep kartı → `mapToInput`). */
const editBody = (over: Record<string, unknown> = {}) =>
  ({
    type: "ALIM",
    format: "RFQ",
    visibility: "CONNECTIONS",
    title: "Cıvata alımı (düzeltildi)",
    closesAt: new Date(Date.now() + 10 * DAY).toISOString(),
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY"],
    categoryIds: ["31161600"],
    items: [{ name: "M6 cıvata", quantity: 100, unit: "adet" }],
    ...over,
  }) as never;

/** Talep kategorisi katalogda olmalı (düzenleme kapısı `level ≥ 3 ∧ inDiscovery`). */
async function seedCategory() {
  await prisma.category.create({
    data: {
      id: "31161600",
      code: "31161600",
      nameTr: "Cıvatalar",
      keywords: "",
      searchText: "civatalar",
      level: 3,
      parentId: null,
      isActive: true,
      sortOrder: 0,
      inDiscovery: true,
    },
  });
}

describe("AI-1: özele çevrilen ya da kutusu kapatılan talebin kuyruktaki OTOMATİK davetleri gitmez", () => {
  it("talep özele çevrildi + kutu kapatıldı: turun kuyruğa aldığı (AI_AUTO) davetler iptal olur, e-posta GİTMEZ; alıcının elle yazdığı adres gider", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]] });
    const owner = await buyer();
    const l = await openRequest(owner);
    await runPublish(r, l.id);
    // Alıcının kendi yazdığı adres — özel talebe bilinçli davet (dokunulmaz).
    await r.connections.inviteExternalForListing(owner.auth, l.id, ["tanidik@firma.com.tr"], "MANUAL");
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id, state: "QUEUED" } })).toBe(3);

    // Cumartesi: alıcı "yalnız seçtiğim firmalar" dedi ve kutuyu kapattı.
    await prisma.listing.update({ where: { id: l.id }, data: { visibility: "PRIVATE", aiDiscovery: false } });
    await makeDue();
    const report = await r.dispatcher.dispatch();

    expect(report.sent).toBe(1);
    expect(report.cancelled).toBe(2);
    const sent = r.email.send.mock.calls.map((c) => c[0] as SendArg).filter((a) => a.context.type === "tender_external_invite");
    expect(sent.map((a) => a.to.email)).toEqual(["tanidik@firma.com.tr"]);
    expect(
      await prisma.externalListingInvite.findMany({
        where: { listingId: l.id },
        orderBy: { email: "asc" },
        select: { email: true, source: true, state: true, cancelReason: true },
      }),
    ).toEqual([
      { email: "info@viti.it", source: "AI_AUTO", state: "CANCELLED", cancelReason: "AUTO_INVITE_OFF" },
      { email: "satis@civata.com.tr", source: "AI_AUTO", state: "CANCELLED", cancelReason: "AUTO_INVITE_OFF" },
      { email: "tanidik@firma.com.tr", source: "MANUAL", state: "SENT", cancelReason: null },
    ]);
    // Durum listesi nedenini söyler.
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({
      "Cıvata AŞ": "NOT_SENT:AUTO_INVITE_OFF",
      "Viti Srl": "NOT_SENT:AUTO_INVITE_OFF",
    });
    // Sonraki turlar da göndermez.
    await makeDue();
    expect((await r.dispatcher.dispatch()).sent).toBe(0);

    // Düşen adresi alıcı KENDİSİ davet ederse "zaten davetli" denmez (e-posta
    // hiç gitmedi): satır onun daveti olarak yeniden kuyruğa girer ve gider.
    // Otomatik tur aynı satırı canlandıramaz.
    const auto = await r.connections.inviteExternalForListing(owner.auth, l.id, [{ email: "info@viti.it", country: "IT" }], "AI_AUTO");
    expect(auto.results.map((x) => x.status)).toEqual(["ALREADY_INVITED"]);
    const manual = await r.connections.inviteExternalForListing(owner.auth, l.id, ["satis@civata.com.tr"], "MANUAL");
    expect(manual.results.map((x) => x.status)).toEqual(["QUEUED"]);
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id } })).toBe(3);
    await makeDue();
    expect((await r.dispatcher.dispatch()).sent).toBe(1);
    expect(
      await prisma.externalListingInvite.findMany({
        where: { listingId: l.id, email: { not: "tanidik@firma.com.tr" } },
        orderBy: { email: "asc" },
        select: { email: true, source: true, state: true, cancelReason: true },
      }),
    ).toEqual([
      { email: "info@viti.it", source: "AI_AUTO", state: "CANCELLED", cancelReason: "AUTO_INVITE_OFF" },
      { email: "satis@civata.com.tr", source: "MANUAL", state: "SENT", cancelReason: null },
    ]);
  });

  it("yalnız kutu kapatıldı (talep hâlâ herkese açık): kuyruktaki otomatik davetler yine gitmez", async () => {
    const r = rig({ batches: [[TR_WEB], []] });
    const owner = await buyer();
    const l = await openRequest(owner);
    await runPublish(r, l.id);
    await prisma.listing.update({ where: { id: l.id }, data: { aiDiscovery: false } });
    await makeDue();
    const report = await r.dispatcher.dispatch();
    expect([report.sent, report.cancelled]).toEqual([0, 1]);
    expect(r.email.send.mock.calls.filter((c) => (c[0] as SendArg).context.type === "tender_external_invite")).toHaveLength(0);
  });

  it("e-postası gitmiş otomatik davetin HATIRLATMASI da özele çevrilen talepte gitmez", async () => {
    const r = rig();
    const owner = await buyer();
    const l = await openRequest(owner, { closesAt: new Date(Date.now() + 30 * 3_600_000) });
    const ref = await prisma.companyReferralInvite.create({
      data: { inviterCompanyId: owner.company.id, email: "info@viti.it", invitedById: owner.user.id },
    });
    await prisma.externalListingInvite.create({
      data: {
        listingId: l.id,
        inviterCompanyId: owner.company.id,
        referralInviteId: ref.id,
        email: "info@viti.it",
        locale: "en",
        country: "IT",
        source: "AI_AUTO",
        state: "SENT",
        sentAt: new Date(Date.now() - 2 * DAY),
      },
    });
    await prisma.listing.update({ where: { id: l.id }, data: { visibility: "PRIVATE", aiDiscovery: false } });
    expect((await r.dispatcher.dispatch()).reminders).toBe(0);
    expect(r.email.send).not.toHaveBeenCalled();
    // Denetim: kural olmasa hatırlatma giderdi (talep herkese açık + kutu açıkken gider).
    await prisma.listing.update({ where: { id: l.id }, data: { visibility: "PUBLIC", aiDiscovery: true } });
    expect((await r.dispatcher.dispatch()).reminders).toBe(1);
  });
});

describe("AI-2: tur, kuyruğa yazıldığı andaki değil İŞLENDİĞİ andaki talebi okur", () => {
  it("kutu tur kuyruktayken kapatıldı: arama koşmaz (model bütçesi harcanmaz), kimse davet edilmez, alıcıya mesaj gitmez", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]] });
    const owner = await buyer();
    await memberSeller("Bağlantı Ltd");
    const l = await openRequest(owner);
    const runId = (await r.runs.enqueue(l.id, "PUBLISH"))!;
    await prisma.listing.update({ where: { id: l.id }, data: { aiDiscovery: false } });

    await r.runs.tick();

    const run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId }, include: { candidates: true } });
    expect([run.state, run.error]).toEqual(["FAILED", "discovery_off"]);
    expect(run.candidates).toHaveLength(0);
    expect(r.ai.callAiSystem).not.toHaveBeenCalled();
    expect(await prisma.listingInvitation.count()).toBe(0);
    expect(await prisma.externalListingInvite.count()).toBe(0);
    expect(r.notifications.pushToUser).not.toHaveBeenCalled();
    expect(r.email.send).not.toHaveBeenCalled();
  });

  it("alıcı kutuyu DÜZENLEME ekranından kapattı (gerçek güncelleme ucu): bekleyen tur kimseyi davet etmez", async () => {
    await seedCategory();
    const r = rig({ batches: [[TR_WEB], [IT_WEB]] });
    const owner = await buyer();
    await memberSeller("Bağlantı Ltd");
    const l = await openRequest(owner);
    const runId = (await r.runs.enqueue(l.id, "PUBLISH"))!;

    await r.listings.service.updateListing(owner.auth, l.id, editBody({ visibility: "PUBLIC", aiDiscovery: false }));
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).aiDiscovery).toBe(false);
    expect((await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId } })).state).toBe("PENDING");

    await r.runs.tick();
    expect((await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId } })).error).toBe("discovery_off");
    expect(await prisma.listingInvitation.count()).toBe(0);
    expect(await prisma.externalListingInvite.count()).toBe(0);
    expect(r.ai.callAiSystem).not.toHaveBeenCalled();
  });

  it("talep tur kuyruktayken 'yalnız Türkiye'ye daraltıldı: yurt dışı geçişi koşmaz, İtalyan firma kuyruğa girmez", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]] });
    const owner = await buyer();
    const l = await openRequest(owner);
    const runId = (await r.runs.enqueue(l.id, "PUBLISH"))!;
    expect((await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId } })).targetCountries).toEqual([]);
    await prisma.listing.update({ where: { id: l.id }, data: { targetCountries: ["TR"] } });

    await r.runs.tick();

    expect((await prisma.externalListingInvite.findMany({ select: { email: true } })).map((x) => x.email)).toEqual([TR_WEB.email]);
    // Tek geçiş (yalnız Türkiye): araştırma + ayrıştırma.
    expect(r.ai.callAiSystem).toHaveBeenCalledTimes(2);
  });

  it("davet aşaması (sürdürülen tur dahil) güncel talebe bakar: kutu kapandıysa kimse davet edilmez; arama sürerken daraltılan ülkenin dışındaki adres davet edilmez", async () => {
    const r = rig();
    const owner = await buyer();
    const member = await memberSeller("Bağlantı Ltd");
    const stuckRun = (listingId: string) =>
      prisma.supplierDiscoveryRun.create({
        data: {
          listingId,
          companyId: owner.company.id,
          trigger: "PUBLISH",
          state: "RUNNING",
          startedAt: new Date(Date.now() - 20 * MIN),
          candidates: {
            create: [
              { name: "Bağlantı Ltd", status: "MEMBER", memberCompanyId: member.company.id, source: "PLATFORM" },
              { name: "Cıvata AŞ", status: "SUGGESTED", email: TR_WEB.email, country: "TR", scope: "LOCAL", source: "WEB" },
              { name: "Viti Srl", status: "SUGGESTED", email: IT_WEB.email, country: "IT", scope: "ABROAD", source: "WEB" },
            ],
          },
        },
      });
    // (a) Arama bitti, davet aşaması yarıda kaldı; o arada kutu kapatıldı.
    const off = await openRequest(owner, { aiDiscovery: false });
    const offRun = await stuckRun(off.id);
    // (b) Arama sürerken talep yalnız Türkiye'ye daraltıldı.
    const narrowed = await openRequest(owner, { targetCountries: ["TR"] });
    const narrowedRun = await stuckRun(narrowed.id);

    await r.runs.tick();

    const statuses = async (runId: string) =>
      Object.fromEntries(
        (await prisma.supplierDiscoveryCandidate.findMany({ where: { runId }, select: { name: true, status: true } })).map((c) => [c.name, c.status]),
      );
    expect(await statuses(offRun.id)).toEqual({ "Bağlantı Ltd": "NOT_ALLOWED", "Cıvata AŞ": "NOT_ALLOWED", "Viti Srl": "NOT_ALLOWED" });
    expect(await prisma.listingInvitation.count({ where: { listingId: off.id } })).toBe(0);
    expect(await prisma.externalListingInvite.count({ where: { listingId: off.id } })).toBe(0);

    expect(await statuses(narrowedRun.id)).toEqual({ "Bağlantı Ltd": "INVITED", "Cıvata AŞ": "INVITED", "Viti Srl": "NOT_ELIGIBLE" });
    expect((await prisma.externalListingInvite.findMany({ where: { listingId: narrowed.id }, select: { email: true } })).map((x) => x.email)).toEqual([
      TR_WEB.email,
    ]);
    expect(outcomes(await r.runs.forListing(owner.auth, narrowed.id))["Viti Srl"]).toBe("NOT_SENT:NOT_ELIGIBLE");
  });
});

describe("AI-3: düzenleme formu, bilemeyeceği AI davetini silmez", () => {
  async function setup() {
    await seedCategory();
    const r = rig({ batches: [[], []] });
    const owner = await buyer("ABC İnşaat");
    const member = await memberSeller("Bağlantı Ltd");
    const l = await openRequest(owner, { visibility: "CONNECTIONS", title: "Cıvata alımı" });
    return { r, owner, member, l };
  }

  it("alıcı yazım hatası için formu açtı, o sırada tur bir üyeyi davet etti: kayıt daveti SİLMEZ — tedarikçinin bağlantısı talebi açmaya devam eder", async () => {
    const { r, owner, member, l } = await setup();
    // Form açıldı: davetli listesi boş, sunucu okuma anını verdi.
    const form = (await r.listings.service.getOne(owner.auth, l.id)) as { invitations: unknown[]; invitationsAsOf: string };
    expect(form.invitations).toEqual([]);
    expect(Number.isFinite(Date.parse(form.invitationsAsOf))).toBe(true);
    await new Promise((res) => setTimeout(res, 15));

    // İki dakika sonra tur üyeyi davet etti ("ABC İnşaat sizi davet etti" e-postası gitti).
    await runPublish(r, l.id);
    await settle(async () => (await prisma.emailLog.count({ where: { contextType: "listing_invitation_ai" } })) >= 1);
    expect(await mailsOf(l.id)).toMatchObject({ [member.user.email]: ["listing_invitation_ai"] });

    // Alıcı başlığı düzeltip kaydetti: gövdede (formun bildiği) davetli yok.
    await r.listings.service.updateListing(owner.auth, l.id, editBody({ invitationsAsOf: form.invitationsAsOf }));

    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).title).toBe("Cıvata alımı (düzeltildi)");
    expect(
      await prisma.listingInvitation.findMany({ where: { listingId: l.id }, select: { invitedCompanyId: true, origin: true } }),
    ).toEqual([{ invitedCompanyId: member.company.id, origin: "AI" }]);
    await expect(r.listings.service.getOne(member.auth, l.id)).resolves.toBeTruthy();
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({ "Bağlantı Ltd": "INVITED" });
  });

  it("formun GÖSTERDİĞİ AI davetlisini çıkarmak yine siler (MU-20); okuma anı göndermeyen eski istemci eskisi gibi davranır", async () => {
    const { r, owner, member, l } = await setup();
    // Form davetlileri Rothern ID ile geri gönderir.
    await prisma.company.update({ where: { id: member.company.id }, data: { rothernId: "AAAA-1111" } });
    await runPublish(r, l.id);
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id } })).toBe(1);
    await new Promise((res) => setTimeout(res, 15));
    // Form turdan SONRA açıldı: AI davetlisini listesinde gösteriyor.
    const form = (await r.listings.service.getOne(owner.auth, l.id)) as {
      invitations: Array<{ rothernId: string }>;
      invitationsAsOf: string;
    };
    expect(form.invitations).toHaveLength(1);

    // Formda kalırsa kalır (satır yeniden yazılmaz).
    await r.listings.service.updateListing(
      owner.auth,
      l.id,
      editBody({ invitations: [form.invitations[0]!.rothernId], invitationsAsOf: form.invitationsAsOf }),
    );
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id, invitedCompanyId: member.company.id } })).toBe(1);

    // Alıcı onu çıkardı → silinir.
    await r.listings.service.updateListing(owner.auth, l.id, editBody({ invitationsAsOf: form.invitationsAsOf }));
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id } })).toBe(0);

    // Eski istemci (alan yok): davranış değişmedi — gövdede olmayan davet silinir.
    await prisma.listingInvitation.create({
      data: { listingId: l.id, invitedCompanyId: member.company.id, invitedById: owner.user.id, origin: "AI" },
    });
    await r.listings.service.updateListing(owner.auth, l.id, editBody());
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id } })).toBe(0);
  });

  it("form açıkken eklenen ELLE davet (AI kaynaklı değil) kuraldan yararlanmaz: gövdede yoksa silinir", async () => {
    const { r, owner, member, l } = await setup();
    const form = (await r.listings.service.getOne(owner.auth, l.id)) as { invitationsAsOf: string };
    await new Promise((res) => setTimeout(res, 15));
    await prisma.listingInvitation.create({ data: { listingId: l.id, invitedCompanyId: member.company.id, invitedById: owner.user.id } });
    await r.listings.service.updateListing(owner.auth, l.id, editBody({ invitationsAsOf: form.invitationsAsOf }));
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id } })).toBe(0);
  });
});

describe("AI-4: herkese açık talepte anonim kategori duyurusu otomatik daveti BEKLER", () => {
  /** Alıcı + turun davet edeceği üye + kategorisi uyan ama turun davet ETMEYECEĞİ (doğrulanmamış) firma. */
  async function scene(opts: Parameters<typeof rig>[0] = { batches: [[TR_WEB], []] }) {
    const r = rig(opts);
    const owner = await buyer("ABC İnşaat");
    const member = await memberSeller("Bağlantı Ltd");
    const unverified = await memberSeller("Belgesiz Ltd", { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" });
    const l = await openRequest(owner, { openNotifiedAt: null });
    const cron = new ListingScheduler(prisma as never, r.listings.service);
    const stamp = async () => (await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).openNotifiedAt;
    const announce = () => r.listings.service.announceListingOpen(l.id, "invitation");
    const subjectTo = (email: string) =>
      r.listings.email.send.mock.calls.map((c) => c[0] as SendArg).filter((a) => a.to.email === email).map((a) => a.subject);
    return { r, owner, member, unverified, l, cron, stamp, announce, subjectTo };
  }

  it("yayın → tur: turun davet ettiği üye firma adını taşıyan TEK e-postayı alır, anonim duyuruya girmez; duyuru tur bitince TAM BİR KEZ gider", async () => {
    const { r, owner, member, unverified, l, cron, stamp, announce, subjectTo } = await scene();

    // Yayın: anonim duyuru bekletilir; tur kuyruğa girdi, damga basılmadı.
    expect((await announce()).status).toBe("held");
    await quiet();
    expect(await mailsOf(l.id)).toEqual({});
    expect(await stamp()).toBeNull();
    expect(await prisma.supplierDiscoveryRun.findMany({ where: { listingId: l.id }, select: { trigger: true, state: true } })).toEqual([
      { trigger: "PUBLISH", state: "PENDING" },
    ]);
    // Beklerken gelen çağrılar (düzenleme, dakikalık iş) hiçbir şey göndermez, ikinci tur yazmaz.
    expect((await announce()).status).toBe("held");
    await cron.announceOpened();
    await quiet();
    expect(await mailsOf(l.id)).toEqual({});
    expect(await prisma.supplierDiscoveryRun.count({ where: { listingId: l.id } })).toBe(1);

    // Dakikalık tur: üyeyi davet eder, biter → duyuru salınır.
    await r.runs.tick();
    await settle(async () => Object.keys(await mailsOf(l.id)).length >= 3);
    await quiet();

    expect(await mailsOf(l.id)).toEqual({
      // Davet edilen üye: firma adını taşıyan davet — anonim duyuru YOK.
      [member.user.email]: ["listing_invitation_ai"],
      // Kategorisi uyan, turun davet etmediği firma: anonim duyuru, bir kez
      // (ayrıca "sizi arayan bir alıcı var" çağrısı gitmez).
      [unverified.user.email]: ["listing_category_match"],
      [owner.user.email]: ["ai_supplier_suggestions"],
    });
    expect(subjectTo(member.user.email)).toEqual(["ABC İnşaat sizi bir alım talebine davet etti"]);
    expect(subjectTo(unverified.user.email).join(" ")).not.toContain("ABC İnşaat");
    expect(await stamp()).not.toBeNull();
    expect(r.notifications.pushToUser).toHaveBeenCalledWith(
      owner.user.id,
      expect.objectContaining({ params: expect.objectContaining({ members: 1, emails: 1 }) }),
    );

    // Sonraki çağrılar ve dakikalık işler yinelemez.
    expect((await announce()).status).toBe("skipped");
    await cron.announceOpened();
    await r.runs.tick(new Date(Date.now() + 30 * MIN));
    await quiet();
    expect(Object.values(await mailsOf(l.id)).flat().sort()).toEqual(["ai_supplier_suggestions", "listing_category_match", "listing_invitation_ai"]);
  });

  it("10 DAKİKA SINIRI: tur bu sürede davet aşamasını bitirmediyse duyuru beklemeden gider (bugünkü gibi); geç gelen tur aynı üyeye ikinci e-posta atmaz", async () => {
    const { r, member, unverified, l, cron, stamp, announce } = await scene();
    expect((await announce()).status).toBe("held");
    // 9. dakika: hâlâ bekliyor.
    await prisma.supplierDiscoveryRun.updateMany({ where: { listingId: l.id }, data: { createdAt: new Date(Date.now() - 9 * MIN) } });
    await cron.announceOpened();
    await quiet();
    expect(await stamp()).toBeNull();
    expect(await mailsOf(l.id)).toEqual({});

    // 11. dakika: kuyruk dolu, tur başlamadı → dakikalık iş duyuruyu salar.
    await prisma.supplierDiscoveryRun.updateMany({ where: { listingId: l.id }, data: { createdAt: new Date(Date.now() - 11 * MIN) } });
    await cron.announceOpened();
    await settle(async () => Object.keys(await mailsOf(l.id)).length >= 2);
    await quiet();
    expect(await stamp()).not.toBeNull();
    expect(await mailsOf(l.id)).toEqual({
      [member.user.email]: ["listing_category_match"],
      [unverified.user.email]: ["listing_category_match"],
    });

    // Tur sonradan koştu: üye davetli olur, ama bu talep için ikinci e-posta almaz.
    await r.runs.tick();
    await quiet();
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id, invitedCompanyId: member.company.id, origin: "AI" } })).toBe(1);
    const mails = await mailsOf(l.id);
    expect(mails[member.user.email]).toEqual(["listing_category_match"]);
    expect(mails[unverified.user.email]).toEqual(["listing_category_match"]);
  });

  it("tur DÜŞERSE ya da kutu kapatılırsa duyuru bugünkü gibi gider — kimse e-postasız kalmaz", async () => {
    // (a) Kutu, tur işlenmeden kapatıldı → tur `discovery_off` ile düşer ve duyuruyu salar.
    const a = await scene();
    expect((await a.announce()).status).toBe("held");
    await prisma.listing.update({ where: { id: a.l.id }, data: { aiDiscovery: false } });
    await a.r.runs.tick();
    await settle(async () => Object.keys(await mailsOf(a.l.id)).length >= 2);
    await quiet();
    expect(await mailsOf(a.l.id)).toEqual({
      [a.member.user.email]: ["listing_category_match"],
      [a.unverified.user.email]: ["listing_category_match"],
    });
    expect(await prisma.listingInvitation.count({ where: { listingId: a.l.id } })).toBe(0);

    // (b) Alıcı kutuyu DÜZENLEME ekranından kapattı → kayıt anında salınır (tur beklenmez).
    await truncateAll();
    await seedCategory();
    const b = await scene();
    expect((await b.announce()).status).toBe("held");
    await b.r.listings.service.updateListing(b.owner.auth, b.l.id, editBody({ visibility: "PUBLIC", aiDiscovery: false }));
    await settle(async () => Object.keys(await mailsOf(b.l.id)).length >= 2);
    await quiet();
    expect(await b.stamp()).not.toBeNull();
    expect(await mailsOf(b.l.id)).toEqual({
      [b.member.user.email]: ["listing_category_match"],
      [b.unverified.user.email]: ["listing_category_match"],
    });
    expect((await prisma.supplierDiscoveryRun.findFirstOrThrow({ where: { listingId: b.l.id } })).state).toBe("PENDING");
  });

  it("ÇÖKMEYE DAYANIKLI: bekleme bellekte değil — tur bitip süreç öldüyse (çağrı kayboldu) dakikalık iş duyuruyu salar; yine tam bir kez", async () => {
    const first = await scene();
    expect((await first.announce()).status).toBe("held");
    // Tur davet aşamasını bitirdi ve DONE oldu; kapanış çağrısından önce süreç öldü.
    const runId = (await prisma.supplierDiscoveryRun.findFirstOrThrow({ where: { listingId: first.l.id } })).id;
    await prisma.listingInvitation.create({
      data: { listingId: first.l.id, invitedCompanyId: first.member.company.id, invitedById: first.owner.user.id, origin: "AI", notifiedAt: new Date() },
    });
    await prisma.supplierDiscoveryRun.update({ where: { id: runId }, data: { state: "DONE", startedAt: new Date(), finishedAt: new Date() } });

    // Yeni süreç (hiçbir bellek durumu yok): dakikalık iş damgasız talebi bulur.
    const reborn = rig();
    const cron = new ListingScheduler(prisma as never, reborn.listings.service);
    await cron.announceOpened();
    await settle(async () => Object.keys(await mailsOf(first.l.id)).length >= 1);
    await quiet();
    expect(await first.stamp()).not.toBeNull();
    // Davetli üye duyuruya girmez; kategorisi uyan diğer firma duyuruyu alır.
    expect(await mailsOf(first.l.id)).toEqual({ [first.unverified.user.email]: ["listing_category_match"] });

    // İki süreç aynı anda / üst üste: ikinci kez gitmez.
    await Promise.all([cron.announceOpened(), new ListingScheduler(prisma as never, first.r.listings.service).announceOpened()]);
    await quiet();
    expect(await mailsOf(first.l.id)).toEqual({ [first.unverified.user.email]: ["listing_category_match"] });
  });

  it("A-2: AI davet e-postasını KAPATMIŞ üye e-postasız kalmaz — turun davet ettiği üye davet e-postası kapalıysa anonim kategori duyurusunu alır (tek e-posta); e-postası açık üye yalnız firma adlı daveti alır", async () => {
    const { r, owner, member, unverified, l, announce, subjectTo } = await scene();
    // Doğrulanmış, kategorisi uyan iki üye daha: biri yalnız AI davet
    // e-postalarını, diğeri bütün davet e-postalarını kapatmış. Kategori
    // e-postaları ikisinde de AÇIK (varsayılan).
    const aiOff = await memberSeller("Sessiz Ltd");
    await prisma.companyUser.update({ where: { id: aiOff.user.id }, data: { notificationPrefs: { aiInvitation: false } } });
    const invitesOff = await memberSeller("Davetsiz Ltd");
    await prisma.companyUser.update({ where: { id: invitesOff.user.id }, data: { notificationPrefs: { invitation: false } } });
    // Kategori e-postalarını DA kapatmış üye: hiçbir e-posta almaz (tercihi bu).
    const allOff = await memberSeller("Kapalı Ltd");
    await prisma.companyUser.update({
      where: { id: allOff.user.id },
      data: { notificationPrefs: { aiInvitation: false, categoryMatch: false } },
    });
    // E-postaları FATURA ADRESİNE giden iki üye: o alıcıda tercih yoktur, yalnız
    // çıkış kaydı (e-postadaki "çıkış" bağlantısı `email_opt_outs` yazar). Biri
    // AI davet e-postalarından çıkmış, diğeri çıkmamış.
    const billingOut = await memberSeller("Faturalı Ltd");
    await prisma.company.update({ where: { id: billingOut.company.id }, data: { billingEmail: "muhasebe@faturali.com" } });
    await prisma.emailOptOut.create({ data: { email: "muhasebe@faturali.com", scope: "aiInvitation" } });
    const billingIn = await memberSeller("Ödemeli Ltd");
    await prisma.company.update({ where: { id: billingIn.company.id }, data: { billingEmail: "muhasebe@odemeli.com" } });

    expect((await announce()).status).toBe("held");
    await r.runs.tick();
    await settle(async () => Object.keys(await mailsOf(l.id)).length >= 7);
    await quiet();

    // Tur altısını da talebe davet etti.
    expect(
      (await prisma.listingInvitation.findMany({ where: { listingId: l.id, origin: "AI" }, select: { invitedCompanyId: true } }))
        .map((i) => i.invitedCompanyId)
        .sort(),
    ).toEqual(
      [member, aiOff, invitesOff, allOff, billingOut, billingIn].map((x) => x.company.id).sort(),
    );

    expect(await mailsOf(l.id)).toEqual({
      // Davet e-postası açık: firma adını taşıyan TEK e-posta (duyuru yok).
      [member.user.email]: ["listing_invitation_ai"],
      // Davet e-postası kapalı: duyuru bekletilmeseydi alacağı anonim kategori
      // e-postası — eskiden bu iki üye talep için HİÇ e-posta almıyordu.
      [aiOff.user.email]: ["listing_category_match"],
      [invitesOff.user.email]: ["listing_category_match"],
      // Fatura adresi AI davetlerinden çıkmış: davet e-postası çıkış kapısında
      // düşer, duyuruyu alır.
      "muhasebe@faturali.com": ["listing_category_match"],
      // Fatura adresi çıkmamış: yalnız firma adlı davet.
      "muhasebe@odemeli.com": ["listing_invitation_ai"],
      // Turun davet etmediği firma: değişmedi.
      [unverified.user.email]: ["listing_category_match"],
      [owner.user.email]: ["ai_supplier_suggestions"],
    });
    // Davetli talebi görür ve teklif verir → AÇIK metin (kilitli / "doğrulanın" değil), anonim.
    expect(subjectTo(aiOff.user.email)).toEqual(["Size uygun yeni bir alım talebi yayınlandı"]);
    expect(subjectTo(invitesOff.user.email).join(" ")).not.toContain("ABC İnşaat");
    const toAiOff = r.listings.email.send.mock.calls.map((c) => c[0] as SendArg).find((a) => a.to.email === aiOff.user.email)!;
    expect((toAiOff.templateData.data as { ctaUrl: string }).ctaUrl).toContain(`/company/ilan/${l.id}`);

    // Zil: AI davetlisinin bildirimi DAVETTİR — ayrıca kategori bildirimi yazılmaz.
    const bell = async (companyId: string) =>
      (await prisma.notification.findMany({ where: { companyId, listingId: l.id }, select: { type: true } })).map((n) => n.type).sort();
    expect(await bell(aiOff.company.id)).toEqual(["listing_invitation"]);
    expect(await bell(member.company.id)).toEqual(["listing_invitation"]);
    expect(await bell(allOff.company.id)).toEqual(["listing_invitation"]);

    // Yinelenmez.
    await new ListingScheduler(prisma as never, r.listings.service).announceOpened();
    await r.runs.tick(new Date(Date.now() + 30 * MIN));
    await quiet();
    expect(Object.values(await mailsOf(l.id)).flat()).toHaveLength(7);
  });

  it("yayın anındaki işler beklemez ve BİR KEZ yapılır: bağlantılar hemen davetli + bildirimli; eşzamanlı çağrılar tek tur yazar (satır kilidi, çok bağlantılı istemciyle); alıcının beklerken çıkardığı bağlantı salıvermede geri eklenmez", async () => {
    const { r, owner, l } = await scene();
    const friend = await makeCompanyWithUser(prisma, { tier: "SILVER", name: "Tanıdık Ltd", country: "TR" });
    await proveAccounts(prisma, friend.company.id);
    await connect(prisma, owner.company.id, friend.company.id, owner.user.id);

    // Yayın + düzenleme + dakikalık iş aynı anda — AYRI bağlantılarda (A-5).
    // Tek bağlantılı paylaşılan istemcide bu üç çağrı zaten sırayla koşardı ve
    // test `enqueueDiscoveryRun`daki `FOR UPDATE` olmadan da geçerdi; kilitsiz
    // sürüm burada üç tur satırı yazar (denendi).
    const race = racyClient("supplierDiscoveryRun", "findMany", 3);
    try {
      const pooled = logListingMails(makeListingsService(race.client));
      const announce = () => pooled.service.announceListingOpen(l.id, "invitation");
      const results = await Promise.all([announce(), announce(), announce()]);
      expect(results.map((x) => x.status)).toEqual(["held", "held", "held"]);
      // Üç çağrı da tur okumasına ulaştı (bariyer gerçekten sınandı).
      expect(race.arrivals()).toBe(3);
      await settle(async () => (await prisma.emailLog.count({ where: { toEmail: friend.user.email } })) >= 1);
      await quiet();
    } finally {
      await race.close();
    }
    expect(
      await prisma.supplierDiscoveryRun.findMany({ where: { listingId: l.id }, select: { trigger: true, state: true } }),
    ).toEqual([{ trigger: "PUBLISH", state: "PENDING" }]);
    // "İlk adım" bir kez: bağlantı başına tek davet satırı, tek bildirim.
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id, invitedCompanyId: friend.company.id } })).toBe(1);
    // Bağlantı davetini duyuruyu beklemeden aldı — bir kez.
    expect((await mailsOf(l.id))[friend.user.email]).toEqual(["listing_invitation"]);

    // Alıcı beklerken o bağlantıyı davetlilerden çıkardı.
    await prisma.listingInvitation.deleteMany({ where: { listingId: l.id, invitedCompanyId: friend.company.id } });
    await r.runs.tick();
    await quiet();
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).openNotifiedAt).not.toBeNull();
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id, invitedCompanyId: friend.company.id } })).toBe(0);
    expect((await mailsOf(l.id))[friend.user.email]).toEqual(["listing_invitation"]);
  });

  it("A-5: tur kuyruğu (`enqueue` — yayın turu telafisi, ikinci tur) da talep satırını kilitler: eşzamanlı çağrılar tek tur yazar", async () => {
    const { l } = await scene();
    const race = racyClient("supplierDiscoveryRun", "findFirst", 3);
    try {
      const runs = new DiscoveryRunsService(
        prisma as never,
        race.client as never,
        {} as never,
        {} as never,
        {} as never,
        { get: jest.fn() } as never,
      );
      const ids = await Promise.all([runs.enqueue(l.id, "PUBLISH"), runs.enqueue(l.id, "PUBLISH"), runs.enqueue(l.id, "PUBLISH")]);
      expect(race.arrivals()).toBe(3);
      // Üçü de AYNI turu döner.
      expect(new Set(ids).size).toBe(1);
    } finally {
      await race.close();
    }
    expect(await prisma.supplierDiscoveryRun.count({ where: { listingId: l.id } })).toBe(1);
  });

  it("ESKİSİ GİBİ: kutusu kapalı, bağlantılara açık ve açılış tarihi verilmiş (embargolu) talepte duyuru açılış anında tek adımda gider", async () => {
    const r = rig({ batches: [[], []] });
    const owner = await buyer("ABC İnşaat");
    const member = await memberSeller("Bağlantı Ltd");
    const open = (extra: Parameters<typeof openRequest>[1]) => openRequest(owner, { openNotifiedAt: null, ...extra });

    // Kutusu kapalı herkese açık talep: duyuru hemen.
    const noAi = await open({ aiDiscovery: false });
    expect((await r.listings.service.announceListingOpen(noAi.id, "invitation")).status).toBe("announced");
    await settle(async () => Object.keys(await mailsOf(noAi.id)).length >= 1);
    expect(await mailsOf(noAi.id)).toEqual({ [member.user.email]: ["listing_category_match"] });
    expect(await prisma.supplierDiscoveryRun.count({ where: { listingId: noAi.id } })).toBe(0);

    // Bağlantılara açık talep: kategori duyurusu yok, bekleme de yok; tur yazılır.
    const conn = await open({ visibility: "CONNECTIONS" });
    expect((await r.listings.service.announceListingOpen(conn.id, "invitation")).status).toBe("announced");
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: conn.id } })).openNotifiedAt).not.toBeNull();
    expect(await prisma.supplierDiscoveryRun.count({ where: { listingId: conn.id, state: "PENDING" } })).toBe(1);

    // Embargolu talep: açılıştan önce hiçbir şey; açılış anında (dakikalık iş) duyuru HEMEN, tur sonra.
    const embargoed = await open({ bidsOpenAt: new Date(Date.now() + 60 * MIN) });
    expect((await r.listings.service.announceListingOpen(embargoed.id, "invitation")).status).toBe("skipped");
    expect(await mailsOf(embargoed.id)).toEqual({});
    await prisma.listing.update({ where: { id: embargoed.id }, data: { bidsOpenAt: new Date(Date.now() - MIN) } });
    await new ListingScheduler(prisma as never, r.listings.service).announceOpened();
    await settle(async () => Object.keys(await mailsOf(embargoed.id)).length >= 1);
    expect(await mailsOf(embargoed.id)).toEqual({ [member.user.email]: ["listing_category_match"] });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: embargoed.id } })).openNotifiedAt).not.toBeNull();
    expect(await prisma.supplierDiscoveryRun.count({ where: { listingId: embargoed.id, state: "PENDING" } })).toBe(1);
  });
});

describe("AI-6: sonuç mesajı iki sayıyı ayrı söyler; talep kapanmadan e-posta gidemeyecek adresi saymaz", () => {
  /** Adres iki gün önce başka bir alıcıdan davet e-postası aldı (7 günlük fren sürüyor). */
  const invitedTwoDaysAgo = (email: string) =>
    prisma.emailLog.create({
      data: {
        template: "tender_external_invite",
        toEmail: email,
        subject: "s",
        provider: "test",
        status: "SENT",
        contextType: "tender_external_invite",
        contextId: "baska-alici",
        queuedAt: new Date(Date.now() - 2 * DAY),
      },
    });

  it("bulunan tek adresin freni talebin kapanışından sonra bitiyor: 'davet edildi' DENMEZ (mesaj gitmez); dağıtıcı satırı düşürür", async () => {
    const r = rig({ batches: [[TR_WEB], []] });
    const owner = await buyer();
    await invitedTwoDaysAgo(TR_WEB.email);
    const l = await openRequest(owner, { closesAt: new Date(Date.now() + 3 * DAY) });

    const runId = await runPublish(r, l.id);

    // Satır kuyrukta, ama e-posta talep kapanmadan gidemez.
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id, state: "QUEUED" } })).toBe(1);
    expect((await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId } })).notifiedAt).toBeNull();
    expect(r.notifications.pushToUser).not.toHaveBeenCalled();
    expect(r.email.send).not.toHaveBeenCalled();

    // Mesaj ile dağıtıcı AYNI kuralı okur: satır FREQUENCY ile düşer.
    await makeDue();
    const report = await r.dispatcher.dispatch();
    expect([report.sent, report.cancelled]).toEqual([0, 1]);
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({ "Cıvata AŞ": "NOT_SENT:FREQUENCY" });
  });

  it("üye + gidebilecek adres + gidemeyecek adres: mesaj '1 üye, 1 davet e-postası' der", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]] });
    const owner = await buyer();
    await memberSeller("Bağlantı Ltd");
    await invitedTwoDaysAgo(IT_WEB.email);
    const l = await openRequest(owner, { closesAt: new Date(Date.now() + 3 * DAY) });

    await runPublish(r, l.id);

    expect(r.notifications.pushToUser).toHaveBeenCalledTimes(1);
    expect(r.notifications.pushToUser).toHaveBeenCalledWith(
      owner.user.id,
      expect.objectContaining({
        bodyKey: "api.notifications.discovery.invitedBodyBoth",
        params: expect.objectContaining({ members: 1, emails: 1 }),
      }),
    );
    const mail = r.email.send.mock.calls.map((c) => c[0] as SendArg).find((a) => a.context.type === "ai_supplier_suggestions")!;
    expect(mail.subject).toBe("Talebinize 1 Rothern üyesi davet edildi, 1 davet e-postası sırada");
  });

  it("yalnız e-posta kuyruğu: mesaj üyeden söz etmez; fren kapanıştan ÖNCE bitiyorsa adres sayılır", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]] });
    const owner = await buyer();
    await invitedTwoDaysAgo(IT_WEB.email);
    // Kapanışa 20 gün var: 5 gün sonra biten fren e-postayı engellemez.
    const l = await openRequest(owner, { closesAt: new Date(Date.now() + 20 * DAY) });

    await runPublish(r, l.id);

    expect(r.notifications.pushToUser).toHaveBeenCalledWith(
      owner.user.id,
      expect.objectContaining({
        bodyKey: "api.notifications.discovery.invitedBodyEmails",
        params: expect.objectContaining({ members: 0, emails: 2 }),
      }),
    );
    const mail = r.email.send.mock.calls.map((c) => c[0] as SendArg).find((a) => a.context.type === "ai_supplier_suggestions")!;
    expect(mail.subject).toBe("Talebiniz için 2 davet e-postası sıraya alındı");
    const body = (mail.templateData.data as { paragraphs: string[] }).paragraphs.join(" | ");
    expect(body).toContain("2 firmaya davet e-postası sıraya alındı");
    expect(body).not.toMatch(/Rothern üyesi talebe davet edildi/);
  });
});

/* ------------------------------------------------------------------------ *
 * İKİNCİ GÖZDEN GEÇİRME 2026-10-09 (A-3, A-4) — bağımsız ikinci incelemenin
 * doğruladığı kusurlar (A-1 `referral-signup.spec`te, A-2 ve A-5 yukarıdaki
 * "AI-4" bloğunda). Her test düzeltme olmadan kırmızıdır.
 * ------------------------------------------------------------------------ */

describe("A-3: kutuyu kapatıp yeniden açmak (ya da talebi özele çevirip geri almak) geri alınabilir", () => {
  /**
   * Önümüzdeki cumartesi 12:00 UTC (İstanbul 15:00, Roma 14:00 — hafta sonu).
   * Geri alınan satır alıcının ülkesindeki İLK MESAİ penceresine planlanır;
   * test hangi saatte koşarsa koşsun o pencere "şimdi" olmasın (satır aynı
   * dakikada gönderilmesin) diye dağıtıcıya bu an verilir.
   */
  const weekendNoon = () => {
    const d = new Date();
    d.setUTCHours(12, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7));
    return d;
  };
  /**
   * Talebin turları: aramadan düşen (FAILED) önce, sonra yazılış sırasıyla.
   * Yalnız `createdAt` sırasına güvenilmez: birkaç yüz ms arayla yazılan iki
   * satırın sırası, saati geri adım atan makinede (WSL) ters dönebilir.
   */
  const runsOf = async (listingId: string) => {
    const rows = await prisma.supplierDiscoveryRun.findMany({
      where: { listingId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { trigger: true, state: true, error: true },
    });
    const failedFirst = (x: { state: string }) => (x.state === "FAILED" ? 0 : 1);
    return [...rows].sort((p, q) => failedFirst(p) - failedFirst(q)).map((x) => [x.trigger, x.state, x.error]);
  };

  it("alıcı düzenleme formunu kutu KAPALI kaydetti, fark edip yeniden açtı (gerçek güncelleme ucu): aramadan düşen turun yerine YENİ tur yazılır, koşar ve davet eder", async () => {
    await seedCategory();
    const r = rig({ batches: [[TR_WEB], []] });
    const owner = await buyer("ABC İnşaat");
    const member = await memberSeller("Bağlantı Ltd");
    const l = await openRequest(owner, { openNotifiedAt: null });

    // Yayın: tur kuyrukta.
    expect((await r.listings.service.announceListingOpen(l.id, "invitation")).status).toBe("held");
    // Tur beklerken alıcı formu kutu kapalı kaydetti → tur aramadan düşer.
    await r.listings.service.updateListing(owner.auth, l.id, editBody({ visibility: "PUBLIC", aiDiscovery: false }));
    await quiet();
    await r.runs.tick();
    expect(await runsOf(l.id)).toEqual([["PUBLISH", "FAILED", "discovery_off"]]);
    expect(r.ai.callAiSystem).not.toHaveBeenCalled();

    // Fark etti: kutuyu yeniden işaretleyip kaydetti.
    await r.listings.service.updateListing(owner.auth, l.id, editBody({ visibility: "PUBLIC", aiDiscovery: true }));
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).aiDiscovery).toBe(true);
    // Eskiden: düşen satır "yayın turu zaten var" sayılıyor, yeni tur HİÇ yazılmıyordu.
    expect(await runsOf(l.id)).toEqual([
      ["PUBLISH", "FAILED", "discovery_off"],
      ["PUBLISH", "PENDING", null],
    ]);

    await r.runs.tick(new Date(Date.now() + 3 * MIN));
    expect(await runsOf(l.id)).toEqual([
      ["PUBLISH", "FAILED", "discovery_off"],
      ["PUBLISH", "DONE", null],
    ]);
    expect(r.ai.callAiSystem).toHaveBeenCalled();
    expect(
      await prisma.listingInvitation.findMany({ where: { listingId: l.id }, select: { invitedCompanyId: true, origin: true } }),
    ).toEqual([{ invitedCompanyId: member.company.id, origin: "AI" }]);
    expect((await prisma.externalListingInvite.findMany({ where: { listingId: l.id }, select: { email: true, state: true } }))).toEqual([
      { email: TR_WEB.email, state: "QUEUED" },
    ]);
    expect(r.notifications.pushToUser).toHaveBeenCalledTimes(1);
    expect(r.notifications.pushToUser).toHaveBeenCalledWith(
      owner.user.id,
      expect.objectContaining({ params: expect.objectContaining({ members: 1, emails: 1 }) }),
    );

    // Koşmuş tur SAYILIR: yeni kayıt ve sonraki dakikalar yenisini yazmaz.
    // (Form davetli listesini turdan önce okumuştu → turun daveti silinmez, AI-3.)
    await r.listings.service.updateListing(
      owner.auth,
      l.id,
      editBody({ visibility: "PUBLIC", aiDiscovery: true, invitationsAsOf: new Date(Date.now() - 60 * MIN).toISOString() }),
    );
    for (const min of [6, 20, 60]) await r.runs.tick(new Date(Date.now() + min * MIN));
    expect(await prisma.supplierDiscoveryRun.count({ where: { listingId: l.id } })).toBe(2);
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id } })).toBe(1);
    expect(r.notifications.pushToUser).toHaveBeenCalledTimes(1);
  });

  it("düzenleme kaydı turu yazamadıysa dakikalık iş (yayın turu telafisi) yazar: aramadan düşen tur — kutu kapalıydı ya da talep özeldi — 'tur var' sayılmaz; başka nedenle düşen tur sayılır", async () => {
    const r = rig({ batches: [[], []] });
    const owner = await buyer();
    const announced = { openNotifiedAt: new Date(Date.now() - 5 * MIN) };
    const failedRun = (listingId: string, error: string) =>
      prisma.supplierDiscoveryRun.create({
        data: { listingId, companyId: owner.company.id, trigger: "PUBLISH", state: "FAILED", error, finishedAt: new Date() },
      });
    const wasOff = await openRequest(owner, announced);
    await failedRun(wasOff.id, "discovery_off");
    const wasPrivate = await openRequest(owner, announced);
    await failedRun(wasPrivate.id, "private_listing");
    // DENETİM: gerçekten denenmiş ve düşmüş tur (ör. takılıp kalan) yeniden kuyruğa girmez.
    const reallyFailed = await openRequest(owner, announced);
    await failedRun(reallyFailed.id, "stuck");
    // DENETİM: kutu hâlâ kapalıysa hiçbir şey yazılmaz.
    const stillOff = await openRequest(owner, { ...announced, aiDiscovery: false });
    await failedRun(stillOff.id, "discovery_off");

    const out = await r.runs.tick();

    expect(out.caughtUp).toBe(2);
    expect((await runsOf(wasOff.id)).map((x) => x.slice(0, 2))).toEqual([
      ["PUBLISH", "FAILED"],
      ["PUBLISH", "DONE"],
    ]);
    expect((await runsOf(wasPrivate.id)).map((x) => x.slice(0, 2))).toEqual([
      ["PUBLISH", "FAILED"],
      ["PUBLISH", "DONE"],
    ]);
    expect(await runsOf(reallyFailed.id)).toEqual([["PUBLISH", "FAILED", "stuck"]]);
    expect(await runsOf(stillOff.id)).toEqual([["PUBLISH", "FAILED", "discovery_off"]]);
  });

  it("aramadan düşen tur talebin iki turluk hakkından YEMEZ: yeniden açılan talep süre yarılanınca ikinci turunu yine alır", async () => {
    const r = rig({ batches: [[], []] });
    const owner = await buyer();
    const l = await openRequest(owner, {
      publishedAt: new Date(Date.now() - 6 * DAY),
      closesAt: new Date(Date.now() + 4 * DAY),
    });
    await prisma.supplierDiscoveryRun.createMany({
      data: [
        { listingId: l.id, companyId: owner.company.id, trigger: "PUBLISH", state: "FAILED", error: "discovery_off", finishedAt: new Date(Date.now() - 5 * DAY), createdAt: new Date(Date.now() - 6 * DAY) },
        { listingId: l.id, companyId: owner.company.id, trigger: "PUBLISH", state: "DONE", finishedAt: new Date(Date.now() - 5 * DAY), createdAt: new Date(Date.now() - 5 * DAY) },
      ],
    });

    const out = await r.runs.tick();

    // Eskiden iki PUBLISH satırı "en fazla iki otomatik tur"u doldururdu.
    expect(out.secondRounds).toBe(1);
    expect((await runsOf(l.id)).map((x) => x[0])).toEqual(["PUBLISH", "PUBLISH", "SECOND_ROUND"]);
    // Tavan yine iki SAYILAN tur: üçüncüsü açılmaz.
    for (const min of [60, 120, 180]) await r.runs.tick(new Date(Date.now() + min * MIN));
    expect(await prisma.supplierDiscoveryRun.count({ where: { listingId: l.id } })).toBe(3);
  });

  it("kuyruktaki otomatik davet: kutu bir dağıtıcı dakikası kapalı kaldı, sonra açıldı → düşen satırlar YENİDEN kuyruğa girer ve gider (sonuç mesajı 'sıraya alındı' demişti)", async () => {
    const r = rig({ batches: [[TR_WEB], [IT_WEB]] });
    const owner = await buyer();
    const l = await openRequest(owner);
    await runPublish(r, l.id);
    const rowsOf = async () =>
      (
        await prisma.externalListingInvite.findMany({
          where: { listingId: l.id },
          orderBy: { email: "asc" },
          select: { email: true, source: true, state: true, cancelReason: true },
        })
      ).map((x) => `${x.email} ${x.source} ${x.state} ${x.cancelReason ?? "-"}`);
    expect(await rowsOf()).toEqual([`${IT_WEB.email} AI_AUTO QUEUED -`, `${TR_WEB.email} AI_AUTO QUEUED -`]);

    // Kutu kapandı; dağıtıcı dakikası koştu.
    await prisma.listing.update({ where: { id: l.id }, data: { aiDiscovery: false } });
    let report = await r.dispatcher.dispatch();
    expect([report.cancelled, report.resumed, report.sent]).toEqual([2, 0, 0]);
    expect(await rowsOf()).toEqual([
      `${IT_WEB.email} AI_AUTO CANCELLED AUTO_INVITE_OFF`,
      `${TR_WEB.email} AI_AUTO CANCELLED AUTO_INVITE_OFF`,
    ]);
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({
      "Cıvata AŞ": "NOT_SENT:AUTO_INVITE_OFF",
      "Viti Srl": "NOT_SENT:AUTO_INVITE_OFF",
    });
    // Sırası çoktan geçmiş olsun: geri alınan satır eski saatiyle değil, alıcının
    // ülkesindeki ilk mesai penceresiyle planlanır (AI davetinin saat kuralı).
    await makeDue();

    // Kutu yeniden açıldı (hafta sonu bir dağıtıcı dakikası).
    await prisma.listing.update({ where: { id: l.id }, data: { aiDiscovery: true } });
    const saturday = weekendNoon();
    report = await r.dispatcher.dispatch(saturday);
    expect([report.cancelled, report.resumed, report.sent]).toEqual([0, 2, 0]);
    expect(await rowsOf()).toEqual([`${IT_WEB.email} AI_AUTO QUEUED -`, `${TR_WEB.email} AI_AUTO QUEUED -`]);
    for (const row of await prisma.externalListingInvite.findMany({ where: { listingId: l.id }, select: { sendAfter: true } })) {
      // Pazartesi sabahı (yerel) — cumartesiden sonra, en geç iki buçuk gün içinde.
      expect(row.sendAfter.getTime()).toBeGreaterThan(saturday.getTime());
      expect(row.sendAfter.getTime()).toBeLessThan(saturday.getTime() + 2.5 * DAY);
    }
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({ "Cıvata AŞ": "QUEUED", "Viti Srl": "QUEUED" });

    // Sırası gelince gider — her adrese bir kez.
    await makeDue();
    report = await r.dispatcher.dispatch();
    expect([report.sent, report.resumed]).toEqual([2, 0]);
    await makeDue();
    expect((await r.dispatcher.dispatch()).sent).toBe(0);
    const sent = r.email.send.mock.calls.map((c) => c[0] as SendArg).filter((a) => a.context.type === "tender_external_invite");
    expect(sent.map((a) => a.to.email).sort()).toEqual([IT_WEB.email, TR_WEB.email].sort());
  });

  it("geri alma yalnız talep YENİDEN açıkken ve yalnız bu nedenle düşen otomatik satırda: özel kalan / kapanan talep, başka nedenle düşen satır ve alıcının bağlantısını iptal ettiği adres geri gelmez", async () => {
    const r = rig();
    const owner = await buyer();
    const row = async (
      email: string,
      listing: Partial<Prisma.ListingUncheckedCreateInput>,
      over: Partial<Prisma.ExternalListingInviteUncheckedCreateInput> = {},
      referralStatus: "PENDING" | "CANCELLED" = "PENDING",
    ) => {
      const l = await openRequest(owner, listing);
      const ref = await prisma.companyReferralInvite.create({
        data: { inviterCompanyId: owner.company.id, email, invitedById: owner.user.id, status: referralStatus },
      });
      await prisma.externalListingInvite.create({
        data: {
          listingId: l.id,
          inviterCompanyId: owner.company.id,
          referralInviteId: ref.id,
          email,
          locale: "tr",
          country: "TR",
          source: "AI_AUTO",
          state: "CANCELLED",
          cancelReason: "AUTO_INVITE_OFF",
          ...over,
        },
      });
    };
    await row("geri@firma.com.tr", {}); // talep yeniden herkese açık + kutu açık
    await row("baglanti@firma.com.tr", { visibility: "CONNECTIONS" }); // bağlantılara açık talepte de tur koşar
    await row("ozel@firma.com.tr", { visibility: "PRIVATE" });
    await row("kapali@firma.com.tr", { aiDiscovery: false });
    await row("bitti@firma.com.tr", { status: "CLOSED_NO_AWARD" });
    await row("fren@firma.com.tr", {}, { cancelReason: "FREQUENCY" });
    await row("iptal@firma.com.tr", {}, {}, "CANCELLED");

    const saturday = weekendNoon();
    const report = await r.dispatcher.dispatch(saturday);

    expect([report.resumed, report.sent]).toEqual([2, 0]);
    expect(
      (
        await prisma.externalListingInvite.findMany({ where: { state: "QUEUED" }, orderBy: { email: "asc" }, select: { email: true, cancelReason: true } })
      ).map((x) => `${x.email} ${x.cancelReason ?? "-"}`),
    ).toEqual(["baglanti@firma.com.tr -", "geri@firma.com.tr -"]);
    expect(await prisma.externalListingInvite.count({ where: { state: "CANCELLED" } })).toBe(5);
    // İkinci dakika aynı satırlara yeniden dokunmaz.
    expect((await r.dispatcher.dispatch(saturday)).resumed).toBe(0);
  });
});

describe("A-4: sürdürülen tur, alıcının PENCEREDEN yaptığı daveti kendi daveti saymaz", () => {
  it("tur takılıyken alıcı 'AI ile tedarikçi bul' penceresinden bir üyeyi davet etti: sürdürülen tur o adayı 'zaten davetliydi' yazar, sonuç mesajında saymaz", async () => {
    const r = rig();
    const owner = await buyer();
    const member = await memberSeller("Bağlantı Ltd");
    const l = await openRequest(owner);
    // Adaylar yazıldı, süreç davet aşamasından önce öldü.
    const stuck = await prisma.supplierDiscoveryRun.create({
      data: {
        listingId: l.id,
        companyId: owner.company.id,
        trigger: "PUBLISH",
        state: "RUNNING",
        createdAt: new Date(Date.now() - 20 * MIN),
        startedAt: new Date(Date.now() - 20 * MIN),
        candidates: { create: [{ name: "Bağlantı Ltd", status: "MEMBER", memberCompanyId: member.company.id, source: "PLATFORM" }] },
      },
    });
    // 15 dakikalık sürdürmeden önce alıcı pencereyi açıp üyeyi KENDİSİ davet etti (gerçek uç).
    const manual = await r.runs.inviteMembers(owner.auth, l.id, [member.company.id]);
    expect(manual.results).toEqual([{ companyId: member.company.id, status: "INVITED" }]);
    const invitation = await prisma.listingInvitation.findFirstOrThrow({ where: { listingId: l.id } });
    // Pencere daveti de `origin: "AI"` taşır ve tur satırından SONRA yazıldı — eski ölçüte uyuyordu.
    expect(invitation.origin).toBe("AI");
    expect(invitation.createdAt.getTime()).toBeGreaterThan(stuck.createdAt.getTime());
    expect((invitation.aiReason ?? {}) as Record<string, unknown>).not.toHaveProperty("auto");
    await settle(async () => (await prisma.emailLog.count({ where: { contextType: "listing_invitation_ai" } })) >= 1);

    const out = await r.runs.tick(new Date());

    const run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: stuck.id }, include: { candidates: true } });
    expect(run.state).toBe("DONE");
    expect(run.candidates.map((c) => c.status)).toEqual(["ALREADY_INVITED"]);
    // Otomatik arama kimseyi davet etmedi → "1 Rothern üyesini davet etti" mesajı GİTMEZ.
    expect(out.notified).toBe(0);
    expect(run.notifiedAt).toBeNull();
    expect(r.notifications.pushToUser).not.toHaveBeenCalled();
    expect(r.email.send.mock.calls.filter((c) => (c[0] as SendArg).context.type === "ai_supplier_suggestions")).toHaveLength(0);
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({ "Bağlantı Ltd": "ALREADY_INVITED" });
    expect(await prisma.listingInvitation.count({ where: { listingId: l.id } })).toBe(1);
  });

  it("turun KENDİ davet satırı işaretlidir (`aiReason.auto`), e-posta gerekçesi aynen okunur; pencere daveti işaret taşımaz", async () => {
    const r = rig({ batches: [[], []] });
    const owner = await buyer("ABC İnşaat");
    const byRun = await memberSeller("Tur Ltd");
    const l = await openRequest(owner);

    await runPublish(r, l.id);
    const byWindow = await memberSeller("Pencere Ltd");
    await r.runs.inviteMembers(owner.auth, l.id, [byWindow.company.id]);
    await settle(async () => (await prisma.emailLog.count({ where: { contextType: "listing_invitation_ai" } })) >= 2);

    const rows = Object.fromEntries(
      (await prisma.listingInvitation.findMany({ where: { listingId: l.id }, select: { invitedCompanyId: true, origin: true, aiReason: true } })).map(
        (i) => [i.invitedCompanyId, i],
      ),
    );
    expect(rows[byRun.company.id]).toMatchObject({ origin: "AI", aiReason: { category: true, auto: true } });
    expect(rows[byWindow.company.id]).toMatchObject({ origin: "AI", aiReason: { category: true } });
    expect(rows[byWindow.company.id]!.aiReason).not.toHaveProperty("auto");
    // İki davet e-postası da aynı (kategori gerekçeli) gövdeyle gitti.
    const bodies = r.listings.email.send.mock.calls
      .map((c) => c[0] as SendArg)
      .filter((a) => a.context.type === "listing_invitation_ai")
      .map((a) => (a.templateData.data as { paragraphs: string[] }).paragraphs.join(" "));
    expect(bodies).toHaveLength(2);
    expect(new Set(bodies).size).toBe(1);
  });
});

/* ------------------------------------------------------------------------ *
 * CANLI DOĞRULAMA 2026-10-10, AUTO-COUNT-1 — bir talebin dört yüzeyi (bildirim,
 * e-posta, durum bandı, "E-postayla davet edilenler" bölümü) sıradaki davetler
 * için AYNI sayıyı söyler. Bildirim ve e-posta dağıtıcının kuralıyla sayıyordu
 * (`queuedInviteForecast`), iki ekran kuyruk satırını tek başına okuyordu:
 * mesajda "6 firmaya davet e-postası sıraya alındı", ekranda "9 davet sırada"
 * ve üç satırda tutulmayacak bir "planlanan gönderim" saati.
 * ------------------------------------------------------------------------ */
describe("AUTO-COUNT-1: bildirim, e-posta, durum bandı ve e-posta davet bölümü aynı kuralı okur", () => {
  /** Adres başka bir alıcının talebinden davet e-postası aldı (`ago` önce). */
  const letterFromAnotherBuyer = (email: string, ago: number) =>
    prisma.emailLog.create({
      data: {
        template: "tender_external_invite",
        toEmail: email,
        subject: "s",
        provider: "test",
        status: "SENT",
        contextType: "tender_external_invite",
        contextId: "baska-alici",
        queuedAt: new Date(Date.now() - ago),
      },
    });
  const section = () => new ListingEmailInvitesService(prisma as never, prisma as never);
  const tally = (states: string[]) => {
    const out: Record<string, number> = {};
    for (const s of states) out[s] = (out[s] ?? 0) + 1;
    return out;
  };
  const bandTally = (view: View) =>
    tally(view.runs.flatMap((run) => run.candidates.map((c) => (c.inviteReason ? `${c.invite}:${c.inviteReason}` : c.invite))));

  it("dokuz adresin üçü aynı gün başka talepten davet aldı, talep 7 günde kapanıyor: mesaj 6 der, bant ve bölüm de 6 sırada + 3 gönderilmedi (neden: sıklık, saat yok); dağıtıcı aynı üçünü düşürür", async () => {
    const found = Array.from({ length: 9 }, (_, i) => ({
      name: `Kablo ${i + 1} AŞ`,
      email: `satis@kablo${i + 1}.com.tr`,
      country: "TR",
      reason: "r",
      items: [1],
    }));
    const held = found.slice(0, 3);
    const r = rig({ batches: [found, []] });
    const owner = await buyer();
    await memberSeller("Üye Bir Ltd");
    await memberSeller("Üye İki Ltd");
    // Öğleden sonra başka talebin mektubu gitti: 7 günlük fren, talebin kapanışından 5 saat önce biter —
    // sonraki mesai penceresi kapanışa 12 saatten yakın (ya da kapanıştan sonra).
    for (const c of held) await letterFromAnotherBuyer(c.email, 5 * 60 * MIN);
    const l = await openRequest(owner, { closesAt: new Date(Date.now() + 7 * DAY) });

    await runPublish(r, l.id);

    // Dokuzu da kuyruğa girdi.
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id, state: "QUEUED" } })).toBe(9);

    // 1) Bildirim.
    expect(r.notifications.pushToUser).toHaveBeenCalledWith(
      owner.user.id,
      expect.objectContaining({
        bodyKey: "api.notifications.discovery.invitedBodyBoth",
        params: expect.objectContaining({ members: 2, emails: 6 }),
      }),
    );
    // 2) E-posta.
    const mail = r.email.send.mock.calls.map((c) => c[0] as SendArg).find((a) => a.context.type === "ai_supplier_suggestions")!;
    expect(mail.subject).toBe("Talebinize 2 Rothern üyesi davet edildi, 6 davet e-postası sırada");
    expect((mail.templateData.data as { paragraphs: string[] }).paragraphs.join(" | ")).toContain("6 firmaya davet e-postası sıraya alındı");

    // 3) Durum bandı (`inviteCounts` bu alanları sayar): 2 davet edildi · 6 davet sırada · 3 gönderilmedi.
    const band = await r.runs.forListing(owner.auth, l.id);
    expect(bandTally(band)).toEqual({ INVITED: 2, QUEUED: 6, "NOT_SENT:FREQUENCY": 3 });
    const bandRows = band.runs.flatMap((run) => run.candidates);
    const heldNames = new Set(held.map((c) => c.name));
    expect(bandRows.filter((c) => c.invite === "NOT_SENT").map((c) => c.name).sort()).toEqual([...heldNames].sort());
    // Gidemeyecek satır planlanan saat taşımaz; gidecek satır taşır.
    expect(bandRows.filter((c) => c.invite === "NOT_SENT").map((c) => c.sendAfter)).toEqual([null, null, null]);
    expect(bandRows.filter((c) => c.invite === "QUEUED").every((c) => !!c.sendAfter)).toBe(true);

    // 4) Kalıcı "E-postayla davet edilenler" bölümü.
    const { items } = await section().forListing(owner.auth, l.id);
    expect(tally(items.map((i) => (i.reason ? `${i.invite}:${i.reason}` : i.invite)))).toEqual({ QUEUED: 6, "NOT_SENT:FREQUENCY": 3 });
    expect(items.filter((i) => i.invite === "NOT_SENT").map((i) => [i.email, i.sendAfter]).sort()).toEqual(
      held.map((c) => [c.email, null]).sort(),
    );
    // Bant ve bölüm aynı adres için aynı saati söyler.
    const bandTime = Object.fromEntries(bandRows.filter((c) => c.email).map((c) => [c.email, c.sendAfter]));
    for (const i of items) expect(i.sendAfter).toBe(bandTime[i.email]);

    // Sırası gelince dağıtıcı ekranın dediğini yapar: altısı gider, üçü FREQUENCY ile düşer.
    await makeDue();
    const report = await r.dispatcher.dispatch();
    expect([report.sent, report.cancelled, report.deferred]).toEqual([6, 3, 0]);
    expect(
      (await prisma.externalListingInvite.findMany({ where: { listingId: l.id, state: "CANCELLED" }, select: { email: true, cancelReason: true } }))
        .map((x) => [x.email, x.cancelReason])
        .sort(),
    ).toEqual(held.map((c) => [c.email, "FREQUENCY"]).sort());
    expect(bandTally(await r.runs.forListing(owner.auth, l.id))).toEqual({ INVITED: 8, "NOT_SENT:FREQUENCY": 3 });
  });

  it("frendeki adres talep kapanmadan gidebiliyorsa sayılır ve iki ekran da GERÇEK saati söyler (frenin bittiği mesai penceresi); dağıtıcı satırı tam o ana erteler", async () => {
    const r = rig({ batches: [[TR_WEB], []] });
    const owner = await buyer();
    const letter = await letterFromAnotherBuyer(TR_WEB.email, 2 * DAY);
    const l = await openRequest(owner, { closesAt: new Date(Date.now() + 20 * DAY) });

    await runPublish(r, l.id);

    expect(r.notifications.pushToUser).toHaveBeenCalledWith(
      owner.user.id,
      expect.objectContaining({ params: expect.objectContaining({ members: 0, emails: 1 }) }),
    );
    const stored = await prisma.externalListingInvite.findFirstOrThrow({ where: { listingId: l.id, email: TR_WEB.email } });
    const afterHold = nextBusinessWindow(new Date(letter.queuedAt.getTime() + 7 * DAY), timeZoneForCountry("TR"));
    // Kuyruğa yazılan saat ilk mesai penceresi; adres o gün hâlâ frende.
    expect(stored.sendAfter.getTime()).toBeLessThan(afterHold.getTime());

    const bandRow = async () =>
      (await r.runs.forListing(owner.auth, l.id)).runs[0]!.candidates.find((c) => c.email === TR_WEB.email)!;
    const sectionRow = async () => (await section().forListing(owner.auth, l.id)).items.find((i) => i.email === TR_WEB.email)!;
    expect(await bandRow()).toMatchObject({ invite: "QUEUED", inviteReason: null, sendAfter: afterHold.toISOString() });
    expect(await sectionRow()).toMatchObject({ invite: "QUEUED", reason: null, sendAfter: afterHold.toISOString() });

    // Sırası gelince dağıtıcı satırı ekranın söylediği ana erteler; ekran aynı saati göstermeye devam eder.
    await prisma.externalListingInvite.update({ where: { id: stored.id }, data: { sendAfter: new Date(Date.now() - MIN) } });
    const report = await r.dispatcher.dispatch();
    expect([report.sent, report.deferred, report.cancelled]).toEqual([0, 1, 0]);
    expect((await prisma.externalListingInvite.findUniqueOrThrow({ where: { id: stored.id } })).sendAfter).toEqual(afterHold);
    expect((await bandRow()).sendAfter).toBe(afterHold.toISOString());
    expect((await sectionRow()).sendAfter).toBe(afterHold.toISOString());
  });

  /**
   * AUTO-COUNT-1 gözden geçirmesi (F1): aynı belirti, başka tetikleyici. Adrese
   * henüz HİÇBİR mektup gitmedi — başka bir alıcının talebi aynı adresi sıraya
   * almış ve mektubu birkaç dakika ÖNCE çıkacak (her kuyruk satırı kendi 0-45
   * dakikalık payını alır). Dağıtıcı onu gönderir, bu satırı 7 gün tutar; geçmiş
   * boş olduğu için dört yüzey de "sırada" diyordu.
   */
  it("adres BAŞKA bir talebin kuyruğunda birkaç dakika önde: sonuç mesajının sayısı, bant ve bölüm aynı şeyi söyler (sayılmaz / gönderilmedi: sıklık); dağıtıcı öndekini gönderir, bunu düşürür", async () => {
    const earlier = await buyer("Önceki Alıcı AŞ");
    const le = await openRequest(earlier, { closesAt: new Date(Date.now() + 7 * DAY) });
    await runPublish(rig({ batches: [[TR_WEB], []] }), le.id);
    const owner = await buyer();
    const l = await openRequest(owner, { closesAt: new Date(Date.now() + 7 * DAY) });
    const r = rig({ batches: [[TR_WEB, IT_WEB], []] });
    const runId = await runPublish(r, l.id);
    // Planlanan dakikalar: önceki talebin mektubu, on iki dakika sonra bu talebinkiler.
    const ahead = new Date(Date.now() + 10 * MIN);
    const behind = new Date(ahead.getTime() + 12 * MIN);
    await prisma.externalListingInvite.updateMany({ where: { listingId: le.id }, data: { sendAfter: ahead } });
    await prisma.externalListingInvite.updateMany({ where: { listingId: l.id }, data: { sendAfter: behind } });

    // 1-2) Bildirim ve e-postanın sayısı (`invitedCounts`): İtalyan adres sayılır, öndeki mektubun tutacağı adres sayılmaz.
    const counts = await (
      r.runs as unknown as {
        invitedCounts(run: string, listing: { id: string; closesAt: Date | null }, now: Date): Promise<{ members: number; emails: number }>;
      }
    ).invitedCounts(runId, { id: l.id, closesAt: l.closesAt }, new Date());
    expect(counts).toEqual({ members: 0, emails: 1 });
    // 3) Durum bandı ve 4) kalıcı bölüm aynı satırı aynı nedenle "gönderilmedi" okur.
    expect(outcomes(await r.runs.forListing(owner.auth, l.id))).toEqual({ "Cıvata AŞ": "NOT_SENT:FREQUENCY", "Viti Srl": "QUEUED" });
    const { items } = await section().forListing(owner.auth, l.id);
    expect(Object.fromEntries(items.map((i) => [i.email, [i.invite, i.reason, i.sendAfter]]))).toEqual({
      [TR_WEB.email]: ["NOT_SENT", "FREQUENCY", null],
      [IT_WEB.email]: ["QUEUED", null, behind.toISOString()],
    });
    // Öndeki mektubun kendi talebi etkilenmez: arkadaki satır onu tutmaz.
    expect(outcomes(await r.runs.forListing(earlier.auth, le.id))).toEqual({ "Cıvata AŞ": "QUEUED" });

    // Dağıtıcı: önce öndeki mektup gider; sıra bu talebe gelince adres frendedir.
    expect((await r.dispatcher.dispatch(ahead)).sent).toBe(1);
    const report = await r.dispatcher.dispatch(new Date(behind.getTime() + MIN));
    expect([report.sent, report.cancelled]).toEqual([1, 1]);
    expect(
      await prisma.externalListingInvite.findMany({ where: { listingId: l.id }, select: { email: true, state: true, cancelReason: true }, orderBy: { email: "asc" } }),
    ).toEqual([
      { email: IT_WEB.email, state: "SENT", cancelReason: null },
      { email: TR_WEB.email, state: "CANCELLED", cancelReason: "FREQUENCY" },
    ]);
  });
});
