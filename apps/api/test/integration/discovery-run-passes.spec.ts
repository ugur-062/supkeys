/**
 * YAYIN SONRASI TUR — ARAMA GEÇİŞLERİ (round 5, 2026-10-09; D1 + D6).
 *
 * Canlıda ölçülen: araştırma çağrısı 45-75 sn sürüyor, genel 60 sn sınırı
 * çağrıların %15'ini kesiyordu; kesilen TEK geçiş yanıt vermiş geçişi de
 * götürüyor, tur web'den hiçbir aday yazmıyordu.
 *
 * Sözleşme:
 *  - araştırma çağrısı KENDİ süresiyle gider (arka plan: 120 sn);
 *  - düşen geçiş BİR kez yeniden denenir;
 *  - yeniden denemede de düşen geçiş turu DÜŞÜRMEZ: yanıt veren geçişin (ya da
 *    platform üyelerinin) adayları davet edilir, tur DONE + hata notu;
 *  - hiçbir aday çıkmadıysa tur FAILED (eski kural);
 *  - ödenmiş bütün çağrılar tura (günlük platform tavanına) yazılır;
 *  - D6: bu talebe davet edilmiş adresin alan adındaki BAŞKA adres "zaten
 *    davetli" sayılır — tur aynı firmaya ikinci daveti kuyruğa almaz.
 *
 * Round 5 gözden geçirme:
 *  - R5-04: daveti ULAŞMAMIŞ (FAILED / gitmeden düşmüş) firmanın başka adresi
 *    ikinci turda yeniden önerilir ve davet edilir;
 *  - R5-05: tek yanıtta aynı firmanın iki adresi tek davettir;
 *  - R5-08: dakikalık iş, aramaları duyuru beklemesine sığmayacaksa ikinci turu
 *    sonraki dakikaya bırakır.
 *
 * Tur yaşam döngüsünün geri kalanı `discovery-runs.spec.ts`, davet frenleri
 * `ai-auto-invite.spec.ts`.
 */
import { foldSearchText } from "@rothern/shared";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { DiscoveryRunsService } from "../../src/modules/ai/supplier-discovery/discovery-runs.service";
import {
  BACKGROUND_SEARCH_TIMING,
  SupplierDiscoveryService,
} from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";
import { AiProviderTimeoutError } from "../../src/modules/ai/providers/ai-provider.interface";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing, proveAccounts } from "./factories";
import { makeService as makeListingsService } from "./make-service";

const DAY = 24 * 3_600_000;

type Scope = "LOCAL" | "ABROAD";
type Candidate = Record<string, unknown>;

/**
 * Geçiş bilen sahte AI: araştırma 0,05 USD, dönüştürme 0,01 USD. Geçişler
 * paralel koşar — hangi geçiş olduğu istemden okunur (yurt dışı istemi
 * "DIŞINDA" der; dönüştürme istemi araştırma metnini taşır).
 */
function passAi(opts: {
  local: Candidate[];
  abroad: Candidate[];
  /** n: o geçişin kaçıncı araştırma çağrısı (1'den). Hata dönerse çağrı düşer. */
  failResearch?: (scope: Scope, n: number) => Error | null;
}) {
  const nth: Record<Scope, number> = { LOCAL: 0, ABROAD: 0 };
  return {
    isEnabled: true,
    callAiSystem: jest.fn(async (o: { responseSchema?: object; prompt: string; timeoutMs?: number; deadlineAt?: number }) => {
      if (!o.responseSchema) {
        const scope: Scope = o.prompt.includes("DIŞINDA") ? "ABROAD" : "LOCAL";
        const err = opts.failResearch?.(scope, ++nth[scope]);
        if (err) throw err;
        return { text: `${scope} research`, costUsd: 0.05, downgraded: false, warned: false };
      }
      const companies = o.prompt.includes("ABROAD research") ? opts.abroad : opts.local;
      return { text: JSON.stringify({ companies }), costUsd: 0.01, downgraded: false, warned: false };
    }),
  };
}

function makeRuns(ai: ReturnType<typeof passAi>) {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const notifications = { pushToUser: jest.fn().mockResolvedValue(1), notify: jest.fn(), pushToCompany: jest.fn() };
  const config = { get: jest.fn((k: string) => (k === "WEB_URL" ? "http://localhost:3000" : undefined)) };
  const discovery = new SupplierDiscoveryService(prisma as never, ai as never, prisma as never);
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
    ai as never,
    discovery,
    connections,
    config as never,
    email as never,
    notifications as never,
    makeListingsService().service,
  );
  return { runs, connections, notifications };
}

async function openListing(ownerCompanyId: string, ownerUserId: string) {
  const l = await makeListing(prisma, {
    companyId: ownerCompanyId,
    createdById: ownerUserId,
    type: "ALIM",
    status: "OPEN",
    aiDiscovery: true,
    publishedAt: new Date(),
    closesAt: new Date(Date.now() + 10 * DAY),
  });
  await makeItem(prisma, l.id, { name: "M6 cıvata" });
  return l;
}

const LOCAL = [{ name: "Cıvata AŞ", email: "satis@civata.com.tr", country: "TR", reason: "r", items: [1] }];
const ABROAD = [{ name: "Viti Srl", email: "info@viti.it", country: "IT", reason: "r", items: [1] }];
const timeout = () => new AiProviderTimeoutError("Gemini request timed out (120000ms)");

async function runOf(runId: string) {
  return prisma.supplierDiscoveryRun.findUniqueOrThrow({
    where: { id: runId },
    include: { candidates: { orderBy: { createdAt: "asc" } } },
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("DiscoveryRunsService — arama geçişleri (round 5, D1)", () => {
  it("ilk denemede zaman aşımına uğrayan geçiş BİR kez yeniden denenir: tur eksiksiz biter, iki geçişin adayı da davet edilir; araştırma arka plan süresiyle (120 sn) çağrılır", async () => {
    const ai = passAi({
      local: LOCAL,
      abroad: ABROAD,
      failResearch: (scope, n) => (scope === "ABROAD" && n === 1 ? timeout() : null),
    });
    const { runs } = makeRuns(ai);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await openListing(owner.company.id, owner.user.id);
    const runId = (await runs.enqueue(l.id, "PUBLISH"))!;
    await runs.process(runId);

    const run = await runOf(runId);
    expect(run.state).toBe("DONE");
    expect(run.error).toBeNull();
    expect(run.candidates.map((c) => [c.name, c.scope, c.status]).sort()).toEqual([
      ["Cıvata AŞ", "LOCAL", "INVITED"],
      ["Viti Srl", "ABROAD", "INVITED"],
    ]);
    const research = ai.callAiSystem.mock.calls.map((c) => c[0]).filter((o) => !o.responseSchema);
    // 2 geçiş + yurt dışının yeniden denemesi.
    expect(research).toHaveLength(3);
    expect(BACKGROUND_SEARCH_TIMING.researchTimeoutMs).toBe(120_000);
    for (const o of research) expect(o.timeoutMs).toBe(BACKGROUND_SEARCH_TIMING.researchTimeoutMs);
    // Zaman aşımına uğrayan çağrı maliyet bildirmez (eskisi gibi); kalan 2 araştırma + 2 dönüştürme.
    expect(Number(run.costUsd)).toBeCloseTo(0.12);
  });

  it("yeniden denemede de düşen geçiş turu DÜŞÜRMEZ: yanıt veren geçişin adayı davet edilir, tur DONE + hata notu, alıcıya sonuç mesajı gider", async () => {
    const ai = passAi({
      local: LOCAL,
      abroad: ABROAD,
      failResearch: (scope) => (scope === "ABROAD" ? timeout() : null),
    });
    const { runs, notifications } = makeRuns(ai);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await openListing(owner.company.id, owner.user.id);
    const runId = (await runs.enqueue(l.id, "PUBLISH"))!;
    await runs.process(runId);

    const run = await runOf(runId);
    // Eskiden: tek geçişin hatası aramanın tamamını düşürür, tur FAILED olurdu.
    expect(run.state).toBe("DONE");
    expect(run.error).toBe("web_pass_failed ABROAD: Gemini request timed out (120000ms)");
    expect(run.candidates.map((c) => [c.name, c.status])).toEqual([["Cıvata AŞ", "INVITED"]]);
    expect(await prisma.externalListingInvite.count({ where: { listingId: l.id, source: "AI_AUTO" } })).toBe(1);
    // Yurt dışı iki kez denendi, üçüncü deneme yok.
    const research = ai.callAiSystem.mock.calls.map((c) => c[0]).filter((o) => !o.responseSchema);
    expect(research).toHaveLength(3);
    expect(Number(run.costUsd)).toBeCloseTo(0.06);
    expect(notifications.pushToUser).toHaveBeenCalledWith(
      owner.user.id,
      expect.objectContaining({ params: expect.objectContaining({ members: 0, emails: 1 }) }),
    );
  });

  it("yanıt veren geçiş aday bulamadıysa ve başka aday yoksa tur FAILED (hata notuyla); bütün geçişler düşerse de", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });

    const partial = passAi({ local: [], abroad: ABROAD, failResearch: (scope) => (scope === "ABROAD" ? timeout() : null) });
    const first = await openListing(owner.company.id, owner.user.id);
    const partialRuns = makeRuns(partial).runs;
    const firstRun = (await partialRuns.enqueue(first.id, "PUBLISH"))!;
    await partialRuns.process(firstRun);
    const a = await runOf(firstRun);
    expect([a.state, a.error]).toEqual(["FAILED", "web_pass_failed ABROAD: Gemini request timed out (120000ms)"]);
    expect(Number(a.costUsd)).toBeCloseTo(0.06);

    const down = passAi({ local: LOCAL, abroad: ABROAD, failResearch: () => new Error("provider down") });
    const second = await openListing(owner.company.id, owner.user.id);
    const downRuns = makeRuns(down).runs;
    const secondRun = (await downRuns.enqueue(second.id, "PUBLISH"))!;
    await downRuns.process(secondRun);
    const b = await runOf(secondRun);
    expect([b.state, b.error]).toEqual(["FAILED", "provider down"]);
    // Her geçiş bir kez yeniden denendi.
    expect(down.callAiSystem).toHaveBeenCalledTimes(4);
  });

  it("bütün geçişler düşer ama platform üyesi bulunduysa tur yine tamamlanır (üye davet edilir, hata notu kalır)", async () => {
    const ai = passAi({ local: LOCAL, abroad: ABROAD, failResearch: () => new Error("provider down") });
    const { runs } = makeRuns(ai);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const member = await makeCompanyWithUser(prisma, { name: "Üye Cıvata AŞ", tier: "SILVER" });
    await prisma.company.update({ where: { id: member.company.id }, data: { slug: "uye-civata", publicEnabled: true } });
    // Talebe davet edilebilen üye = e-postası kanıtlanmış hesabı olan firma (`proven-account.ts`).
    await proveAccounts(prisma, member.company.id);
    await prisma.companyItem.create({
      data: {
        companyId: member.company.id,
        createdById: member.user.id,
        name: "M6 Cıvata DIN 933",
        unit: "adet",
        slug: "m6-civata",
        isPublic: true,
        publishedAt: new Date(),
        searchText: foldSearchText("M6 Cıvata DIN 933"),
      },
    });
    const l = await openListing(owner.company.id, owner.user.id);
    const runId = (await runs.enqueue(l.id, "PUBLISH"))!;
    await runs.process(runId);

    const run = await runOf(runId);
    expect([run.state, run.error]).toEqual(["DONE", "provider down"]);
    expect(run.candidates.map((c) => [c.name, c.status, c.source])).toEqual([["Üye Cıvata AŞ", "INVITED", "PLATFORM"]]);
  });
});

describe("DiscoveryRunsService — aynı firmanın başka adresi (round 5, D6)", () => {
  it("bu talebe davetli adresin alan adındaki aday ALREADY_INVITED yazılır; tur ikinci daveti kuyruğa almaz", async () => {
    const ai = passAi({
      local: [],
      abroad: [
        { name: "Raccortubi S.p.A.", email: "export@raccortubi.com", country: "IT", website: "https://www.raccortubi.com", reason: "r" },
        // Adresi başka alan adında, sitesi davetli adresin alan adı.
        { name: "Viti Holding", email: "info@viti-holding.it", country: "IT", website: "viti.it", reason: "r" },
        { name: "Neue Srl", email: "info@neue.it", country: "IT", reason: "r" },
      ],
    });
    const { runs, connections } = makeRuns(ai);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await openListing(owner.company.id, owner.user.id);
    // Alıcı pencereden iki firmayı zaten davet etti.
    const before = await connections.inviteExternalForListing(
      owner.auth,
      l.id,
      [
        { email: "uk@raccortubi.com", country: "IT" },
        { email: "sales@viti.it", country: "IT" },
      ],
      "AI_FORM",
    );
    expect(before.results.map((r) => r.status)).toEqual(["QUEUED", "QUEUED"]);

    const runId = (await runs.enqueue(l.id, "PUBLISH"))!;
    await runs.process(runId);

    const run = await runOf(runId);
    expect(run.candidates.map((c) => [c.name, c.status]).sort()).toEqual([
      ["Neue Srl", "INVITED"],
      ["Raccortubi S.p.A.", "ALREADY_INVITED"],
      ["Viti Holding", "ALREADY_INVITED"],
    ]);
    const queued = await prisma.externalListingInvite.findMany({
      where: { listingId: l.id },
      select: { email: true, source: true },
      orderBy: { email: "asc" },
    });
    expect(queued).toEqual([
      { email: "info@neue.it", source: "AI_AUTO" },
      { email: "sales@viti.it", source: "AI_FORM" },
      { email: "uk@raccortubi.com", source: "AI_FORM" },
    ]);
  });
});

describe("DiscoveryRunsService — round 5 gözden geçirme", () => {
  /**
   * R5-05 — tek geçiş "Silkar Endaş" (satis@silkarendas.com, site endas.com) ve
   * "Silkar Endaş Ankara" (ankara@silkarendas.com, sitesiz) döndürdü: ikisi de
   * aday oldu, tur aynı firmaya iki davet kuyruğa aldı.
   */
  it("R5-05: tek yanıtta aynı firmanın iki adresi TEK adaydır — tur firmaya tek davet kuyruğa alır", async () => {
    const ai = passAi({
      local: [
        { name: "Silkar Endaş", email: "satis@silkarendas.com", website: "endas.com", country: "TR", reason: "r" },
        { name: "Silkar Endaş Ankara", email: "ankara@silkarendas.com", country: "TR", reason: "r" },
        { name: "Cıvata AŞ", email: "satis@civata.com.tr", country: "TR", reason: "r" },
      ],
      abroad: [],
    });
    const { runs } = makeRuns(ai);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await openListing(owner.company.id, owner.user.id);
    const runId = (await runs.enqueue(l.id, "PUBLISH"))!;
    await runs.process(runId);

    const run = await runOf(runId);
    expect(run.candidates.map((c) => [c.name, c.status]).sort()).toEqual([
      ["Cıvata AŞ", "INVITED"],
      ["Silkar Endaş", "INVITED"],
    ]);
    const queued = await prisma.externalListingInvite.findMany({
      where: { listingId: l.id },
      select: { email: true },
      orderBy: { email: "asc" },
    });
    expect(queued.map((q) => q.email)).toEqual(["satis@civata.com.tr", "satis@silkarendas.com"]);
  });

  /**
   * R5-04 — davet kuyruğu satırı davetin başına ne geldiğine bakılmadan firmayı
   * kilitliyordu: adresi geri çeviren (FAILED / SUPPRESSED) firmanın çalışan
   * başka adresi ikinci turda aramadan düşüyor, firmaya hiç ulaşılamıyordu.
   */
  it("R5-04: ikinci tur — daveti ULAŞMAMIŞ firmanın başka adresi yeniden önerilir ve davet edilir; ulaşmış / kuyruktaki firmanın başka adresi ve eski adresin kendisi önerilmez", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await openListing(owner.company.id, owner.user.id);
    const first = makeRuns(
      passAi({
        local: [{ name: "Firma A", email: "old-office@firma-a.com.tr", country: "TR", reason: "r" }],
        abroad: ABROAD,
      }),
    ).runs;
    const firstRun = (await first.enqueue(l.id, "PUBLISH"))!;
    await first.process(firstRun);
    expect((await runOf(firstRun)).candidates.map((c) => [c.email, c.status]).sort()).toEqual([
      ["info@viti.it", "INVITED"],
      ["old-office@firma-a.com.tr", "INVITED"],
    ]);
    // Dağıtıcı Firma A'nın adresine ulaşamadı (üç deneme); Viti'nin daveti kuyrukta.
    await prisma.externalListingInvite.updateMany({
      where: { listingId: l.id, email: "old-office@firma-a.com.tr" },
      data: { state: "FAILED", attempts: 3 },
    });

    const second = makeRuns(
      passAi({
        local: [
          { name: "Firma A", email: "old-office@firma-a.com.tr", country: "TR", reason: "r" },
          { name: "Firma A Satış", email: "sales@firma-a.com.tr", country: "TR", reason: "r" },
        ],
        abroad: [{ name: "Viti Export", email: "export@viti.it", country: "IT", reason: "r" }],
      }),
    ).runs;
    const secondRun = (await second.enqueue(l.id, "SECOND_ROUND"))!;
    await second.process(secondRun);

    const run = await runOf(secondRun);
    expect(run.candidates.map((c) => [c.email, c.status])).toEqual([["sales@firma-a.com.tr", "INVITED"]]);
    const rows = await prisma.externalListingInvite.findMany({
      where: { listingId: l.id },
      select: { email: true, state: true },
      orderBy: { email: "asc" },
    });
    expect(rows).toEqual([
      { email: "info@viti.it", state: "QUEUED" },
      { email: "old-office@firma-a.com.tr", state: "FAILED" },
      { email: "sales@firma-a.com.tr", state: "QUEUED" },
    ]);
  });

  /**
   * R5-08 — arama süreleri yalnız "takılı tur" eşiğiyle karşılaştırılmıştı.
   * Sağlayıcı yavaşken iş iki turu art arda işliyor, ikinci tur davet aşamasına
   * anonim duyurunun beklemesi (10 dk) bittikten sonra varıyordu.
   */
  it("R5-08: ilk turu uzun süren iş ikinci turu BAŞLATMAZ (sonraki dakikanın işi alır); olağan sürede iki tur aynı işte koşar", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const ai = passAi({ local: LOCAL, abroad: [] });
    const { runs } = makeRuns(ai);
    // Saat: her AI çağrısı işi `perCall` kadar ilerletir (gerçek bekleme yok).
    let elapsed = 0;
    let perCall = 60_000;
    runs.clock = () => elapsed;
    const answer = ai.callAiSystem.getMockImplementation()!;
    ai.callAiSystem.mockImplementation(async (o) => {
      elapsed += perCall;
      return answer(o);
    });
    const stateOf = async (id: string) => (await runOf(id)).state;

    const a = await openListing(owner.company.id, owner.user.id);
    const b = await openListing(owner.company.id, owner.user.id);
    const runA = (await runs.enqueue(a.id, "PUBLISH"))!;
    const runB = (await runs.enqueue(b.id, "PUBLISH"))!;
    // Sıra kesin olsun (WSL saati geri adım atabiliyor).
    await prisma.supplierDiscoveryRun.update({ where: { id: runA }, data: { createdAt: new Date(Date.now() - 60_000) } });

    // İlk tur 4 çağrı × 60 sn = 4 dk sürdü: ikinci turun en kötü araması (5 dk) 8 dk'lık bütçeye sığmaz.
    const slow = await runs.tick();
    expect(slow.processed).toBe(1);
    expect([await stateOf(runA), await stateOf(runB)]).toEqual(["DONE", "PENDING"]);

    // Sonraki dakikanın işi bekleyen turu İLK tur olarak alır.
    elapsed = 0;
    const next = await runs.tick();
    expect(next.processed).toBe(1);
    expect(await stateOf(runB)).toBe("DONE");

    // Olağan süre (tur ~1 dk): iki tur aynı işte.
    perCall = 15_000;
    elapsed = 0;
    const c = await openListing(owner.company.id, owner.user.id);
    const d = await openListing(owner.company.id, owner.user.id);
    const runC = (await runs.enqueue(c.id, "PUBLISH"))!;
    const runD = (await runs.enqueue(d.id, "PUBLISH"))!;
    const usual = await runs.tick();
    expect(usual.processed).toBe(2);
    expect([await stateOf(runC), await stateOf(runD)]).toEqual(["DONE", "DONE"]);
  });
});
