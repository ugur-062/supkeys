/**
 * YAYIN SONRASI AI TEDARİKÇİ KEŞFİ — tur yaşam döngüsü (2026-09-27, Faz 1).
 *
 * Kullanıcı: "talep açıldıktan sonra bile şirketler bulundu, tek tıkla davet
 * gönder diyelim; uluslararası ise yurt dışı dahil; aday seçme şansı olsun ama
 * otomatik seçili olsun; davetli olanlara bir daha gitmesin".
 *
 * Sözleşme:
 *  - Talep açılınca `aiDiscovery` açıksa tur kuyruğa girer (announceListingOpen).
 *  - Tur PLATFORMUN bütçesiyle koşar (`callAiSystem`); günlük USD tavanı aşılırsa koşmaz.
 *  - Adaylar işaretlenir ve kaydedilir; alıcı seçtiklerini tek tıkla davet eder
 *    (kuyruk, AI_AUTO) — aynı adres ikinci kez önerilmez/davet edilmez.
 *  - Alıcı ekranda işlem yapmadıysa 10 dk sonra talebi açan kişiye bildirim + e-posta (bir kez).
 *  - Süre yarılandı, teklif < 3 → ikinci tur (önceki adaylar hariç).
 */
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { DiscoveryRunsService } from "../../src/modules/ai/supplier-discovery/discovery-runs.service";
import { SupplierDiscoveryService } from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService as makeListingsService } from "./make-service";

const DAY = 24 * 3_600_000;

/** Geçiş başına aday listesi (sırayla); araştırma çağrısı metin döner. */
function fakeAi(batches: Array<Array<Record<string, unknown>>>) {
  let parse = 0;
  return {
    isEnabled: true,
    callAiSystem: jest.fn(async (o: { responseSchema?: object }) => {
      if (!o.responseSchema) return { text: "research", costUsd: 0.05, downgraded: false, warned: false };
      const companies = batches[parse++] ?? [];
      return { text: JSON.stringify({ companies }), costUsd: 0.01, downgraded: false, warned: false };
    }),
  };
}

function makeRuns(opts: { ai: ReturnType<typeof fakeAi>; config?: Record<string, string> }) {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const notifications = { pushToUser: jest.fn().mockResolvedValue(1), notify: jest.fn(), pushToCompany: jest.fn() };
  const config = {
    get: jest.fn((k: string) => opts.config?.[k] ?? (k === "WEB_URL" ? "http://localhost:3000" : undefined)),
  };
  const discovery = new SupplierDiscoveryService(prisma as never, opts.ai as never, prisma as never);
  discovery.mxCheck = async () => true;
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
    opts.ai as never,
    discovery,
    connections,
    config as never,
    email as never,
    notifications as never,
  );
  return { runs, email, notifications };
}

async function openListing(ownerCompanyId: string, ownerUserId: string, extra: Record<string, unknown> = {}) {
  const l = await makeListing(prisma, {
    companyId: ownerCompanyId,
    createdById: ownerUserId,
    type: "ALIM",
    status: "OPEN",
    aiDiscovery: true,
    publishedAt: new Date(),
    closesAt: new Date(Date.now() + 10 * DAY),
    ...extra,
  });
  await makeItem(prisma, l.id, { name: "M6 cıvata" });
  return l;
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("DiscoveryRunsService", () => {
  it("talep açılınca aiDiscovery açıksa tur KUYRUĞA girer; kapalıysa girmez", async () => {
    const { service } = makeListingsService();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const on = await makeListing(prisma, { companyId: owner.company.id, createdById: owner.user.id, status: "OPEN", aiDiscovery: true });
    const off = await makeListing(prisma, { companyId: owner.company.id, createdById: owner.user.id, status: "OPEN" });
    await service.announceListingOpen(on.id, "invitation");
    await service.announceListingOpen(off.id, "invitation");
    const runs = await prisma.supplierDiscoveryRun.findMany({ select: { listingId: true, trigger: true, state: true } });
    expect(runs).toEqual([{ listingId: on.id, trigger: "PUBLISH", state: "PENDING" }]);
  });

  it("yayındaki talepte SONRADAN açılan otomatik arama tur üretir (duyuru çoktan yapılmış); ikinci düzenleme çift tur yazmaz (S090)", async () => {
    const { service } = makeListingsService();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD", country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      aiDiscovery: false,
      publishedAt: new Date(),
      openNotifiedAt: new Date(Date.now() - DAY),
      closesAt: new Date(Date.now() + 7 * DAY),
    });
    const dto = {
      type: "ALIM",
      format: "RFQ",
      visibility: "PUBLIC",
      title: "Cıvata alımı",
      closesAt: new Date(Date.now() + 7 * DAY).toISOString(),
      items: [{ name: "M6 cıvata", quantity: 100, unit: "adet" }],
      aiDiscovery: true,
    };
    await service.updateListing(owner.auth, listing.id, dto as never);
    const runs = await prisma.supplierDiscoveryRun.findMany({ where: { listingId: listing.id }, select: { trigger: true, state: true } });
    expect(runs).toEqual([{ trigger: "PUBLISH", state: "PENDING" }]);
    await service.updateListing(owner.auth, listing.id, dto as never);
    expect(await prisma.supplierDiscoveryRun.count({ where: { listingId: listing.id } })).toBe(1);
  });

  it("duyurusu yapılmış talepte açılış ileri alınıp otomatik arama açıldıysa tur embargo bitince dakikalık işte yazılır (S090)", async () => {
    const { runs } = makeRuns({ ai: fakeAi([]) });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const bidsOpenAt = new Date(Date.now() + 60 * 60_000);
    const l = await openListing(owner.company.id, owner.user.id, {
      openNotifiedAt: new Date(Date.now() - DAY),
      bidsOpenAt,
    });
    // Duyurusu yapılmamış talep: turu duyuru yazar, telafi dokunmaz.
    const fresh = await openListing(owner.company.id, owner.user.id);
    // Embargo sürerken tur yazılmaz.
    expect((await runs.tick(new Date())).caughtUp).toBe(0);
    expect(await prisma.supplierDiscoveryRun.count()).toBe(0);
    // Embargo bitti (claim çoktan alınmış): telafi turu yazar, bir kez.
    await prisma.listing.update({ where: { id: l.id }, data: { bidsOpenAt: new Date(Date.now() - 60_000) } });
    await prisma.listing.update({ where: { id: fresh.id }, data: { aiDiscovery: true } });
    expect((await runs.tick(new Date())).caughtUp).toBe(1);
    const all = await prisma.supplierDiscoveryRun.findMany({ select: { listingId: true, trigger: true } });
    expect(all).toEqual([{ listingId: l.id, trigger: "PUBLISH" }]);
    expect((await runs.tick(new Date())).caughtUp).toBe(0);
    expect(await prisma.supplierDiscoveryRun.count({ where: { listingId: l.id } })).toBe(1);
  });

  it("forListing: embargolu talepte `startsAt` döner (ekran 'aranıyor' demez), açık talepte null (S090)", async () => {
    const { runs } = makeRuns({ ai: fakeAi([]) });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const bidsOpenAt = new Date(Date.now() + 2 * DAY);
    const embargoed = await openListing(owner.company.id, owner.user.id, { bidsOpenAt });
    const open = await openListing(owner.company.id, owner.user.id);
    expect((await runs.forListing(owner.auth, embargoed.id)).startsAt).toBe(bidsOpenAt.toISOString());
    expect((await runs.forListing(owner.auth, open.id)).startsAt).toBeNull();
  });

  it("tur platform bütçesiyle koşar: yurt içi + yurt dışı, adaylar kaydedilir, maliyet tura yazılır", async () => {
    const ai = fakeAi([
      [{ name: "Cıvata AŞ", email: "satis@civata.com.tr", country: "TR", reason: "r", items: [1] }],
      [{ name: "Viti Srl", email: "info@viti.it", country: "IT", reason: "r", items: [1] }],
    ]);
    const { runs } = makeRuns({ ai });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await openListing(owner.company.id, owner.user.id);
    const runId = await runs.enqueue(l.id, "PUBLISH");
    await runs.process(runId!);

    const run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId! }, include: { candidates: true } });
    expect(run.state).toBe("DONE");
    expect(Number(run.costUsd)).toBeCloseTo(0.12);
    expect(run.candidates.map((c) => [c.name, c.scope, c.status, c.matchedItems])).toEqual([
      ["Cıvata AŞ", "LOCAL", "SUGGESTED", [1]],
      ["Viti Srl", "ABROAD", "SUGGESTED", [1]],
    ]);
    expect(ai.callAiSystem).toHaveBeenCalledTimes(4);
  });

  it("geçiş ortasında düşen turun ödenmiş çağrıları da tavana yazılır (B5-14)", async () => {
    const ai = fakeAi([]);
    ai.callAiSystem.mockImplementation(async (o: { responseSchema?: object }) => {
      if (!o.responseSchema) return { text: "research", costUsd: 0.05, downgraded: false, warned: false };
      return { text: "not json", costUsd: 0.01, downgraded: false, warned: false };
    });
    const { runs } = makeRuns({ ai });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await openListing(owner.company.id, owner.user.id);
    const runId = await runs.enqueue(l.id, "PUBLISH");
    await runs.process(runId!);
    const run = await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId! } });
    expect(run.state).toBe("FAILED");
    expect(run.finishedAt).not.toBeNull();
    expect(Number(run.costUsd)).toBeGreaterThanOrEqual(0.06);
  });

  it("AI_DISCOVERY_DAILY_USD=0 durdurma anahtarı: web araması koşmaz (Bölüm 15)", async () => {
    const ai = fakeAi([]);
    const { runs } = makeRuns({ ai, config: { AI_DISCOVERY_DAILY_USD: "0" } });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await openListing(owner.company.id, owner.user.id);
    const runId = await runs.enqueue(l.id, "PUBLISH");
    await runs.process(runId!);
    expect((await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId! } })).error).toBe("platform_daily_budget");
    expect(ai.callAiSystem).not.toHaveBeenCalled();
  });

  it("günlük platform tavanı dolduysa tur KOŞMAZ (FAILED platform_daily_budget)", async () => {
    const ai = fakeAi([]);
    const { runs } = makeRuns({ ai, config: { AI_DISCOVERY_DAILY_USD: "1" } });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await openListing(owner.company.id, owner.user.id);
    await prisma.supplierDiscoveryRun.create({
      data: { companyId: owner.company.id, trigger: "PUBLISH", state: "DONE", costUsd: 1.5, finishedAt: new Date() },
    });
    const runId = await runs.enqueue(l.id, "PUBLISH");
    await runs.process(runId!);
    expect((await prisma.supplierDiscoveryRun.findUniqueOrThrow({ where: { id: runId! } })).error).toBe("platform_daily_budget");
    expect(ai.callAiSystem).not.toHaveBeenCalled();
  });

  it("tek tık davet: seçilenler kuyruğa (AI_AUTO) girer, aday INVITED olur; ikinci kez davet edilmez", async () => {
    const ai = fakeAi([[{ name: "Viti Srl", email: "info@viti.it", country: "IT", reason: "r" }], []]);
    const { runs } = makeRuns({ ai });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await openListing(owner.company.id, owner.user.id);
    await runs.process((await runs.enqueue(l.id, "PUBLISH"))!);
    const view = await runs.forListing(owner.auth, l.id);
    const cand = view.runs[0]!.candidates[0]!;
    expect(cand.status).toBe("SUGGESTED");

    const { results } = await runs.invite(owner.auth, l.id, [cand.id]);
    expect(results[0]!.status).toBe("QUEUED");
    const queued = await prisma.externalListingInvite.findFirstOrThrow({ where: { email: "info@viti.it" } });
    expect(queued.source).toBe("AI_AUTO");
    expect((await runs.forListing(owner.auth, l.id)).runs[0]!.candidates[0]!.status).toBe("INVITED");
    // Aynı aday yeniden gönderilemez (SUGGESTED değil).
    expect((await runs.invite(owner.auth, l.id, [cand.id])).results).toEqual([]);
  });

  it("başka firma sonuçları göremez", async () => {
    const { runs } = makeRuns({ ai: fakeAi([]) });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const other = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await openListing(owner.company.id, owner.user.id);
    await expect(runs.forListing(other.auth, l.id)).rejects.toMatchObject({ status: 404 });
  });

  it("10 dk sonra talebi açana bildirim + e-posta (bir kez); bant kapatıldıysa gitmez", async () => {
    const ai = fakeAi([[{ name: "Viti Srl", email: "info@viti.it", country: "IT", reason: "r" }], []]);
    const { runs, email, notifications } = makeRuns({ ai });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await openListing(owner.company.id, owner.user.id);
    await runs.process((await runs.enqueue(l.id, "PUBLISH"))!);

    await runs.tick(new Date(Date.now() + 2 * 60_000));
    expect(notifications.pushToUser).not.toHaveBeenCalled();
    await runs.tick(new Date(Date.now() + 11 * 60_000));
    expect(notifications.pushToUser).toHaveBeenCalledWith(
      owner.user.id,
      expect.objectContaining({ type: "ai_supplier_suggestions", ctaPath: `/company/ilan/${l.id}?ai-davet=1`, portal: "satinalma" }),
    );
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ context: { type: "ai_supplier_suggestions", id: l.id } }),
    );
    await runs.tick(new Date(Date.now() + 20 * 60_000));
    expect(notifications.pushToUser).toHaveBeenCalledTimes(1);

    // Kapatılan bant: yeni tur bildirilmez.
    const l2 = await openListing(owner.company.id, owner.user.id);
    const ai2 = fakeAi([[{ name: "Tubi Srl", email: "info@tubi.it", country: "IT", reason: "r" }], []]);
    const r2 = makeRuns({ ai: ai2 });
    await r2.runs.process((await r2.runs.enqueue(l2.id, "PUBLISH"))!);
    await r2.runs.dismiss(owner.auth, l2.id);
    await r2.runs.tick(new Date(Date.now() + 11 * 60_000));
    expect(r2.notifications.pushToUser).not.toHaveBeenCalled();
  });

  it("pencereden/formdan zaten davet edilmiş adaylar bildirimde sayılmaz; hepsi davetliyse bildirim + e-posta gitmez (GA3)", async () => {
    const { runs, email, notifications } = makeRuns({ ai: fakeAi([]) });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD", country: "TR" });
    const m1 = await makeCompanyWithUser(prisma, { tier: "SILVER", country: "TR" });
    const m2 = await makeCompanyWithUser(prisma, { tier: "SILVER", country: "TR" });
    const ref = await prisma.companyReferralInvite.create({
      data: { inviterCompanyId: owner.company.id, email: "ref@x.com", invitedById: owner.user.id },
    });
    const seed = async (withExternal: boolean) => {
      const l = await openListing(owner.company.id, owner.user.id);
      await prisma.supplierDiscoveryRun.create({
        data: {
          listingId: l.id,
          companyId: owner.company.id,
          trigger: "PUBLISH",
          state: "DONE",
          finishedAt: new Date(Date.now() - 11 * 60_000),
          candidates: {
            create: [
              { name: "Üye 1", status: "MEMBER", memberCompanyId: m1.company.id, scope: "LOCAL", source: "PLATFORM" },
              { name: "Üye 2", status: "MEMBER", memberCompanyId: m2.company.id, scope: "LOCAL", source: "PLATFORM" },
              { name: "Viti Srl", status: "SUGGESTED", email: "info@viti.it", scope: "ABROAD", source: "WEB" },
            ],
          },
        },
      });
      // Pencere yolu (`inviteMembers`) aday satırını güncellemez; davet yalnız
      // listing_invitations / external_listing_invites tablosunda.
      await prisma.listingInvitation.createMany({
        data: [m1.company.id, m2.company.id].map((id) => ({ listingId: l.id, invitedCompanyId: id, invitedById: owner.user.id })),
      });
      if (withExternal) {
        await prisma.externalListingInvite.create({
          data: {
            listingId: l.id,
            inviterCompanyId: owner.company.id,
            referralInviteId: ref.id,
            email: "info@viti.it",
            locale: "it",
          },
        });
      }
      return l;
    };

    // Üçü de davetli → bildirim yok, tur yine de bildirildi sayılır (tekrar denenmez).
    const all = await seed(true);
    await runs.tick(new Date());
    expect(notifications.pushToUser).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
    expect((await prisma.supplierDiscoveryRun.findFirstOrThrow({ where: { listingId: all.id } })).notifiedAt).not.toBeNull();

    // Yalnız dış aday kaldı → sayı 1, yurt dışı 1.
    const partial = await seed(false);
    await runs.tick(new Date());
    expect(notifications.pushToUser).toHaveBeenCalledTimes(1);
    expect(notifications.pushToUser).toHaveBeenCalledWith(
      owner.user.id,
      expect.objectContaining({ listingId: partial.id, params: expect.objectContaining({ n: 1, abroad: 1 }) }),
    );
  });

  it("süre yarılandı + teklif az → İKİNCİ TUR bir kez; önceki adaylar yeniden önerilmez", async () => {
    const ai = fakeAi([
      [{ name: "Viti Srl", email: "info@viti.it", country: "IT", reason: "r" }],
      [],
      [
        { name: "Viti Srl", email: "info@viti.it", country: "IT", reason: "r" },
        { name: "Neue Srl", email: "info@neue.it", country: "IT", reason: "r" },
      ],
      [],
    ]);
    const { runs } = makeRuns({ ai });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await openListing(owner.company.id, owner.user.id, {
      publishedAt: new Date(Date.now() - 6 * DAY),
      closesAt: new Date(Date.now() + 4 * DAY),
    });
    await runs.process((await runs.enqueue(l.id, "PUBLISH"))!);
    const r = await runs.tick(new Date());
    expect(r.secondRounds).toBe(1);
    const all = await prisma.supplierDiscoveryRun.findMany({ orderBy: { createdAt: "asc" }, include: { candidates: true } });
    expect(all.map((x) => x.trigger)).toEqual(["PUBLISH", "SECOND_ROUND"]);
    expect(all[1]!.candidates.map((c) => c.email)).toEqual(["info@neue.it"]);
    // Tekrar tetiklenmez.
    expect((await runs.tick(new Date())).secondRounds).toBe(0);
  });

  it("ikinci tur taraması uygun olmayanları SORGUDA eler ve deterministik sıralar — pencere işlenmiş taleplerle dolmaz (derin denetim X21)", async () => {
    const ai = fakeAi([[], []]);
    const { runs } = makeRuns({ ai });
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const past = { publishedAt: new Date(Date.now() - 6 * DAY) };
    // Kapanışı en yakın: ikinci turunu çoktan almış.
    const done = await openListing(owner.company.id, owner.user.id, { ...past, closesAt: new Date(Date.now() + 2 * DAY) });
    // Yayın turu yok (duyuru telafisi yazar) — ikinci tur adayı değil.
    const noPublish = await openListing(owner.company.id, owner.user.id, { ...past, closesAt: new Date(Date.now() + 3 * DAY) });
    const eligible = await openListing(owner.company.id, owner.user.id, { ...past, closesAt: new Date(Date.now() + 4 * DAY) });
    const base = { companyId: owner.company.id, state: "DONE" as const, finishedAt: new Date() };
    await prisma.supplierDiscoveryRun.createMany({
      data: [
        { ...base, listingId: done.id, trigger: "PUBLISH" },
        { ...base, listingId: done.id, trigger: "SECOND_ROUND" },
        { ...base, listingId: eligible.id, trigger: "PUBLISH" },
      ],
    });
    const spy = jest.spyOn(prisma.listing, "findMany");
    try {
      const r = await runs.tick(new Date());
      expect(r.secondRounds).toBe(1);
      const call = spy.mock.calls.findIndex((c) => (c[0] as { take?: number } | undefined)?.take === 200);
      expect(call).toBeGreaterThanOrEqual(0);
      expect((spy.mock.calls[call]![0] as { orderBy?: unknown }).orderBy).toEqual([{ closesAt: "asc" }, { id: "asc" }]);
      const rows = (await spy.mock.results[call]!.value) as Array<{ id: string }>;
      expect(rows.map((x) => x.id)).toEqual([eligible.id]);
      expect(rows.map((x) => x.id)).not.toContain(noPublish.id);
    } finally {
      spy.mockRestore();
    }
  });
});
