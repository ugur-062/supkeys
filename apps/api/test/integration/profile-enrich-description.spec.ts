/**
 * PROFİL TANITIMI ÖNERİSİ — gerçek DB + gerçek bütçe kapısı (sahip kararı
 * 2026-10-08: "web sitesinden AI ile profil doldurmayı kapat; yalnız profil
 * açıklamasını ürünlerden vb. dolduralım").
 *
 * Sözleşmeler:
 * - Olgular firmanın platformdaki KAYDINDAN gelir (firma + vitrindeki ürünler
 *   + kategori adları); web sitesi kayıtlı olsa da okunmaz, dış istek yoktur.
 * - Çağrı normal AI bütçe kapısından geçer (`ai_usage` satırı; bütçe doluysa
 *   sağlayıcıya istek GİTMEZ). Varsayılan config'te STANDART havuzuna sığar.
 * - Tam erişimi olmayan firma ömür boyu 6 BAŞARILI öneri alır; başarısız
 *   deneme hak yakmaz. Tam erişimli firma yalnız günlük sınırla (3) durur.
 * - Audit izleri: deneme → (başarı) → bitiş. Taslak firmaya YAZILMAZ.
 * - Canlı doğrulama 2026-10-09: ürünün platform kategorisi ve gizli katalog
 *   segmentlerinin adları modele gitmez (PD-02, PD-04); günlük pencere
 *   uygulama takvim günüdür (Europe/Istanbul, PD-07).
 */
import "reflect-metadata";
import { type CompanyRole, Prisma } from "@rothern/db";
import { runWithLocale } from "../../src/common/i18n/locale-context";
import { appDayKey, appDayStart } from "../../src/common/time/app-calendar";
import { AiBudgetExceededException, AiBudgetService } from "../../src/modules/ai/ai-budget.service";
import { loadAiConfig } from "../../src/modules/ai/ai.config";
import { AiService } from "../../src/modules/ai/ai.service";
import { ProfileEnrichService } from "../../src/modules/ai/profile-enrich/profile-enrich.service";
import {
  AiProviderError,
  BaseAiProvider,
  type AiCompletionRequest,
  type AiCompletionResult,
} from "../../src/modules/ai/providers/ai-provider.interface";
import { AuditService } from "../../src/modules/audit/audit.service";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { makeCompanyWithUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

/** GERÇEK varsayılan config (yalnız anahtar sahte): tavanlar ve fiyatlar prod ile aynı. */
const CFG = loadAiConfig({ get: (key: string) => (key === "GEMINI_API_KEY" ? "test-key" : undefined) });

const DRAFT = "Acme Vana olarak İzmir'de küresel ve kelebek vana üretiyoruz.";

class FakeProvider extends BaseAiProvider {
  readonly name = "fake";
  calls: AiCompletionRequest[] = [];
  failWith: Error | null = null;
  text = JSON.stringify({ aboutText: DRAFT });

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    this.calls.push(req);
    if (this.failWith) throw this.failWith;
    return {
      text: this.text,
      usage: { inputTokens: 900, outputTokens: 400, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  }
}

function makeService(provider: FakeProvider) {
  const budget = new AiBudgetService(prisma as never, CFG);
  const ai = new AiService(CFG, provider, budget, prisma as never, undefined);
  return new ProfileEnrichService(prisma as never, new AuditService(prisma as never), ai);
}

/** Firma + vitrin: 2 yayında ürün, 1 taslak (vitrinde DEĞİL), kategoriler, kayıtlı web sitesi. */
async function seedCompany(opts: { verified: boolean }) {
  const co = await makeCompanyWithUser(prisma, {
    name: "Acme Vana",
    tier: "STANDART",
    companyVerificationStatus: opts.verified ? "VERIFIED" : "UNVERIFIED",
  });
  await prisma.category.createMany({
    data: [
      { id: "40000000", code: "40000000", nameTr: "Dağıtım ve Şartlandırma", nameEn: "Distribution and Conditioning", level: 1 },
      { id: "40141607", code: "40141607", nameTr: "Küresel vanalar", nameEn: "Ball valves", level: 4 },
    ],
    skipDuplicates: true,
  });
  await prisma.company.update({
    where: { id: co.company.id },
    data: {
      city: "İzmir",
      industry: "Endüstriyel vana",
      services: ["Vana bakımı"],
      activities: ["MANUFACTURER"],
      sellerCategoryIds: ["40000000"],
      sellerSubCategoryIds: ["40140000", "40141600", "40141607"],
      // Kayıtlı ama OKUNMAZ: özellik web'e çıkmaz.
      website: "https://acme-vana.example",
      aboutText: null,
    },
  });
  const item = (name: string, isPublic: boolean) =>
    prisma.companyItem.create({
      data: {
        companyId: co.company.id,
        createdById: co.user.id,
        name,
        unit: "adet",
        categoryId: "40141607",
        keywords: ["paslanmaz", "pn16"],
        isPublic,
        publishedAt: isPublic ? new Date() : null,
        images: ["x.webp"],
      },
    });
  await item("DN50 küresel vana", true);
  await item("DN80 kelebek vana", true);
  await item("Taslak aktüatör", false);
  const auth = {
    userId: co.user.id,
    companyId: co.company.id,
    email: co.user.email,
    roles: co.auth.roles as CompanyRole[],
    isOwner: true,
    country: "TR",
    // Efektif kademe: ücretsiz dönemde doğrulanmış firma en üst kademede.
    tier: opts.verified ? "GOLD" : "STANDART",
    companyVerificationStatus: opts.verified ? "VERIFIED" : "UNVERIFIED",
  } as unknown as AuthenticatedCompanyUser;
  return { ...co, auth };
}

/**
 * Firmanın audit izleri — SIRASIZ. Milisaniyeler arayla yazılan satırların
 * `createdAt` sırasına güvenilmez (bu makinede WSL saati geri adım atıyor;
 * gözden geçirme REV-3: `actions[0]` ve birebir dizi beklentisi dört koşunun
 * ikisinde kırmızıydı). Akışın SIRASI birim testte, çağrı sırasıyla kilitli
 * (`profile-enrich-tier.spec`: deneme → AI çağrısı, başarı → bitiş); burada
 * hangi izlerin yazıldığı ve bitişin HANGİ denemeye bağlandığı (`entityId`) sınanır.
 */
const auditRows = (companyId: string) =>
  prisma.auditLog.findMany({
    where: { tenantId: companyId },
    select: { id: true, action: true, entityType: true, entityId: true },
  });

/** İzlerin action'ları, sıradan bağımsız (alfabetik). */
const actionsOf = (rows: { action: string }[]) => rows.map((r) => r.action).sort();

/** Bitiş kaydı denemeye `entityId` ile bağlı mı (audit append-only: deneme satırı güncellenmez). */
function expectSettledLinkedToAttempt(rows: Awaited<ReturnType<typeof auditRows>>) {
  const attempts = rows.filter((r) => r.action === "company.profile_enrich_attempt");
  const settled = rows.filter((r) => r.action === "company.profile_enrich_settled");
  expect(attempts).toHaveLength(1);
  expect(settled).toHaveLength(1);
  expect(settled[0]).toMatchObject({ entityType: "audit_log", entityId: attempts[0]!.id });
}

const countOf = (companyId: string, action: string) =>
  prisma.auditLog.count({ where: { tenantId: companyId, action } });

/** Geçmiş bir günün başarılı önerisi (bugünün günlük deneme sayacına girmez). */
async function seedPastSuccess(companyId: string, n: number) {
  await prisma.auditLog.createMany({
    data: Array.from({ length: n }, () => ({
      action: "company.profile_enriched",
      actorType: "company",
      tenantId: companyId,
      createdAt: new Date(Date.now() - 3 * 86_400_000),
    })),
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("profil tanıtımı önerisi — olgular platform kaydından, web yok", () => {
  it("vitrindeki ürünler + firma bilgileri isteme girer; tek çağrı, dış istek yok, taslak kaydedilmez", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("web erişimi olmamalı"));
    try {
      const co = await seedCompany({ verified: false });
      const provider = new FakeProvider();
      const draft = await makeService(provider).enrich(co.auth);

      expect(draft).toEqual({ aboutText: DRAFT, productCount: 2, remainingSuggestions: 5 });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(provider.calls).toHaveLength(1);
      const req = provider.calls[0]!;
      expect(req.webSearch).toBeUndefined();
      expect(req.prompt).toContain("DN50 küresel vana");
      expect(req.prompt).toContain("DN80 kelebek vana");
      expect(req.prompt).toContain("Küresel vanalar");
      expect(req.prompt).toContain("Endüstriyel vana");
      expect(req.prompt).toContain("Vana bakımı");
      expect(req.prompt).toContain("Üretici");
      expect(req.prompt).toContain("Türkiye (TR)");
      // Vitrinde olmayan ürün ve web sitesi adresi modele GİTMEZ.
      expect(req.prompt).not.toContain("Taslak aktüatör");
      expect(req.prompt).not.toContain("acme-vana.example");
      expect(req.system).toContain("UYDURMA YASAK");
      // Ürün satırı yalnız ad + etiket taşır; ürünün platform kategorisi gitmez (PD-02).
      const veri = JSON.parse(
        req.prompt.replace(/^<firma_verisi>\n/, "").replace(/\n<\/firma_verisi>$/, ""),
      ) as { showcaseProducts: Record<string, unknown>[] };
      expect(veri.showcaseProducts).toHaveLength(2);
      expect(veri.showcaseProducts).toEqual(
        expect.arrayContaining([
          { name: "DN50 küresel vana", keywords: ["paslanmaz", "pn16"] },
          { name: "DN80 kelebek vana", keywords: ["paslanmaz", "pn16"] },
        ]),
      );

      // Taslak yalnız DÖNER; firma kaydı değişmez (kullanıcı kutuda düzenleyip kaydeder).
      const saved = await prisma.company.findUniqueOrThrow({
        where: { id: co.company.id },
        select: { aboutText: true, services: true, foundedYear: true, linkedinUrl: true, logoUrl: true },
      });
      expect(saved).toEqual({
        aboutText: null,
        services: ["Vana bakımı"],
        foundedYear: null,
        linkedinUrl: null,
        logoUrl: null,
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("tanıtım FİRMANIN içerik dilinde istenir (arayüz dili yalnız yedek); kategori adları istek dilinde gider", async () => {
    const co = await seedCompany({ verified: true });
    const provider = new FakeProvider();
    await runWithLocale("en", () => makeService(provider).enrich(co.auth));
    const req = provider.calls[0]!;
    // Firmanın metni Türkçe, arayüz İngilizce: tanıtım İngilizceye ZORLANMAZ
    // (eski kural: "DAİMA şu dilde yaz: English (en) — girdi başka dilde olsa bile").
    expect(req.system).toContain("ÇIKTI DİLİ (aboutText)");
    expect(req.system).toContain("hangi dilde yazılmışsa O DİLDE yaz — ÇEVİRME");
    expect(req.system).toContain("şu dili kullan: English (en)");
    expect(req.system).not.toContain("KULLANICI METNİ DİLİ");
    expect(req.system).not.toContain("girdi başka dilde olsa bile");
    // Kategori adı platform etiketidir: istek dilinde gider, istem onu dil kararının dışında tutar.
    expect(req.prompt).toContain("Ball valves");
    expect(req.prompt).not.toContain("Küresel vanalar");
    expect(req.system).toContain("PLATFORM ETİKETİDİR");
    // Firmanın kendi metni olduğu gibi (Türkçe) gider.
    expect(req.prompt).toContain("Endüstriyel vana");
    expect(req.prompt).toContain("Vana bakımı");
  });

  it("kayıttan çıkan firma (tek kategori sorusu → dört kolon): kategoriler YÖNSÜZ gider; ayıran firmada yönlü", async () => {
    const co = await seedCompany({ verified: true });
    // `completeOnboarding` aynı seçimi satış ve satın alma kolonlarına yazar.
    await prisma.company.update({
      where: { id: co.company.id },
      data: {
        buyerCategoryIds: ["40000000"],
        buyerSubCategoryIds: ["40140000", "40141600", "40141607"],
      },
    });
    const provider = new FakeProvider();
    const svc = makeService(provider);
    await svc.enrich(co.auth);
    const veri = (n: number) =>
      JSON.parse(
        provider.calls[n]!.prompt.replace(/^<firma_verisi>\n/, "").replace(/\n<\/firma_verisi>$/, ""),
      ) as Record<string, unknown>;
    expect(veri(0).categories).toEqual(["Küresel vanalar"]);
    expect(veri(0)).not.toHaveProperty("sellingCategories");
    expect(veri(0)).not.toHaveProperty("buyingCategories");
    expect(provider.calls[0]!.system).toContain("alış / satış ayrımı YAPILMAMIŞ");

    // Firma Ayarlar'da satın almayı ayırdı (yalnız segment geneli) → yön artık olgu.
    await prisma.company.update({
      where: { id: co.company.id },
      data: { buyerCategoryIds: ["40000000"], buyerSubCategoryIds: [] },
    });
    await svc.enrich(co.auth);
    expect(veri(1)).not.toHaveProperty("categories");
    expect(veri(1).sellingCategories).toEqual(["Küresel vanalar"]);
    expect(veri(1).buyingCategories).toEqual(["Dağıtım ve Şartlandırma"]);
  });

  it("kaydedilmemiş form değerleri (sektör, hizmetler) kayıtlının yerine okunur — DB'ye yazılmaz", async () => {
    const co = await seedCompany({ verified: true });
    const provider = new FakeProvider();
    await makeService(provider).enrich(co.auth, { industry: "Vana ve aktüatör", services: ["Saha montajı"] });
    const req = provider.calls[0]!;
    expect(req.prompt).toContain("Vana ve aktüatör");
    expect(req.prompt).toContain("Saha montajı");
    expect(req.prompt).not.toContain("Vana bakımı");
    const saved = await prisma.company.findUniqueOrThrow({
      where: { id: co.company.id },
      select: { industry: true, services: true },
    });
    expect(saved).toEqual({ industry: "Endüstriyel vana", services: ["Vana bakımı"] });
  });
});

describe("profil tanıtımı önerisi — modele giden kategori (canlı doğrulama PD-02, PD-04)", () => {
  /**
   * Canlıdaki veri: çelik boru satan firmanın ürünleri "Vidalar" (beyan
   * edilmemiş) ve "Çiftlik hayvanları" (gizli segment 10) kategorilerine
   * iliştirilmişti. Model birini "vidalar gibi bağlantı elemanları" diye ürün
   * iddiasına çevirdi; öteki kataloğun artık sunmadığı bir addı.
   */
  async function seedBoruFirmasi() {
    const co = await seedCompany({ verified: true });
    await prisma.category.createMany({
      data: [
        { id: "31161500", code: "31161500", nameTr: "Vidalar", nameEn: "Screws", level: 3 },
        { id: "10000000", code: "10000000", nameTr: "Canlı Bitki ve Hayvan Malzemeleri", level: 1 },
        { id: "10101500", code: "10101500", nameTr: "Çiftlik hayvanları", level: 3 },
      ],
      skipDuplicates: true,
    });
    await prisma.companyItem.deleteMany({ where: { companyId: co.company.id } });
    const boru = (name: string, categoryId: string) =>
      prisma.companyItem.create({
        data: {
          companyId: co.company.id,
          createdById: co.user.id,
          name,
          unit: "adet",
          categoryId,
          keywords: ["çelik boru", "dikişsiz boru"],
          isPublic: true,
          publishedAt: new Date(),
          images: ["x.webp"],
        },
      });
    await boru("QA Çelik Boru MUGJWF0Q", "31161500");
    await boru("QA Çelik Boru MU4J3RB4", "10101500");
    return co;
  }

  it("ürüne iliştirilmiş kategori adı (beyan edilmemiş ya da gizli) isteme girmez; ürün adı ve etiketleri girer", async () => {
    const co = await seedBoruFirmasi();
    const provider = new FakeProvider();
    const draft = await makeService(provider).enrich(co.auth);

    expect(draft.productCount).toBe(2);
    const prompt = provider.calls[0]!.prompt;
    expect(prompt).toContain("QA Çelik Boru MUGJWF0Q");
    expect(prompt).toContain("QA Çelik Boru MU4J3RB4");
    expect(prompt).toContain("dikişsiz boru");
    expect(prompt).not.toMatch(/Vida|Screws|Çiftlik/);
    // Firmanın KENDİ beyanı (satış: Küresel vanalar) gitmeye devam eder.
    expect(prompt).toContain("Küresel vanalar");
  });

  it("gizli segmentteki ESKİ BEYAN da gitmez; görünür beyan kalır", async () => {
    const co = await seedBoruFirmasi();
    // 2026-09-19 öncesinden kalan beyan: satışta gizli segment 10 + yaprağı.
    await prisma.company.update({
      where: { id: co.company.id },
      data: {
        sellerCategoryIds: ["40000000", "10000000"],
        sellerSubCategoryIds: ["40140000", "40141600", "40141607", "10100000", "10101500"],
        buyerCategoryIds: ["10000000"],
        buyerSubCategoryIds: [],
      },
    });
    const provider = new FakeProvider();
    await makeService(provider).enrich(co.auth);
    const veri = JSON.parse(
      provider.calls[0]!.prompt.replace(/^<firma_verisi>\n/, "").replace(/\n<\/firma_verisi>$/, ""),
    ) as Record<string, unknown>;
    expect(veri.sellingCategories).toEqual(["Küresel vanalar"]);
    // Satın alma ekseninde yalnız gizli segment vardı → alan gönderilmez.
    expect(veri).not.toHaveProperty("buyingCategories");
    expect(provider.calls[0]!.prompt).not.toMatch(/Çiftlik|Canlı Bitki/);
  });
});

describe("profil tanıtımı önerisi — bütçe kapısı ve audit izleri", () => {
  it("çağrı `ai_usage`a yazılır (varsayılan config'te STANDART havuzuna sığar); izler: deneme + başarı + denemeye bağlı bitiş", async () => {
    const co = await seedCompany({ verified: false });
    await makeService(new FakeProvider()).enrich(co.auth);

    const usage = await prisma.aiUsage.findMany({ where: { companyId: co.company.id } });
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ feature: "profile_enrich", status: "SETTLED", userId: co.user.id });
    expect(usage[0]!.costUsd.toNumber()).toBeGreaterThan(0);
    // Üç iz de yazıldı; bitiş, denemenin kendi satırına bağlı. Sıra (deneme →
    // AI çağrısı, başarı → bitiş) birim testte: profile-enrich-tier.spec.
    const rows = await auditRows(co.company.id);
    expect(actionsOf(rows)).toEqual([
      "company.profile_enrich_attempt",
      "company.profile_enrich_settled",
      "company.profile_enriched",
    ]);
    expectSettledLinkedToAttempt(rows);
  });

  it("aylık AI bütçesi doluysa sağlayıcıya istek GİTMEZ; red olduğu gibi iletilir, başarı izi yok", async () => {
    const co = await seedCompany({ verified: false });
    await prisma.aiUsage.create({
      data: {
        companyId: co.company.id,
        userId: co.user.id,
        feature: "test",
        model: CFG.models.default,
        status: "SETTLED",
        // Bugün değil (günlük tavan değil HAVUZ dolsun): ayın başı.
        createdAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1, 0, 0, 1)),
        costUsd: new Prisma.Decimal(CFG.monthlyBudgetUsd.STANDART ?? 0),
      },
    });
    const provider = new FakeProvider();
    await expect(makeService(provider).enrich(co.auth)).rejects.toThrow(AiBudgetExceededException);
    expect(provider.calls).toHaveLength(0);
    expect(await countOf(co.company.id, "company.profile_enriched")).toBe(0);
    // Deneme ve bitişi yine iz bırakır (günlük sayaç + süren-istek kilidi);
    // bitiş bu denemeye bağlıdır.
    const rows = await auditRows(co.company.id);
    expect(actionsOf(rows)).toEqual([
      "company.profile_enrich_attempt",
      "company.profile_enrich_settled",
    ]);
    expectSettledLinkedToAttempt(rows);
  });
});

describe("profil tanıtımı önerisi — sınırlar", () => {
  it("tam erişimi olmayan firma: 6. başarılı öneri son haktır, 7. istek REDDEDİLİR (AI çağrılmaz)", async () => {
    const co = await seedCompany({ verified: false });
    await seedPastSuccess(co.company.id, 5);
    const provider = new FakeProvider();
    const svc = makeService(provider);

    await expect(svc.enrich(co.auth)).resolves.toMatchObject({ remainingSuggestions: 0 });
    await expect(svc.enrich(co.auth)).rejects.toThrow(/toplam 6 AI tanıtım önerisi/);
    expect(provider.calls).toHaveLength(1);
    // Reddedilen istek deneme kaydı da yazmaz (günlük hak yanmaz).
    expect(await countOf(co.company.id, "company.profile_enrich_attempt")).toBe(1);
    expect(await countOf(co.company.id, "company.profile_enriched")).toBe(6);
  });

  it("ücretli çağrı tavanına dayanan firma: kalan hak 0 söylenir, sonraki ret '6 öneri aldınız' DEMEZ", async () => {
    const co = await seedCompany({ verified: false });
    // 2 başarı + 15 ücretli başarısız deneme (boş / işlenemeyen çıktı, zaman
    // aşımı) = 17 ücretli `profile_enrich` satırı; hepsi geçmiş günlerden.
    await seedPastSuccess(co.company.id, 2);
    await prisma.aiUsage.createMany({
      data: Array.from({ length: 17 }, () => ({
        companyId: co.company.id,
        userId: co.user.id,
        feature: "profile_enrich",
        model: CFG.models.default,
        status: "SETTLED" as const,
        costUsd: new Prisma.Decimal("0.0001"),
        createdAt: new Date(Date.now() - 40 * 86_400_000),
      })),
    });
    const provider = new FakeProvider();
    const svc = makeService(provider);

    // 3. başarı: başarı sayacına göre 3 hak kalırdı; ücretli tavan (18) bu
    // çağrıyla doldu → doğru cevap 0.
    await expect(svc.enrich(co.auth)).resolves.toMatchObject({ aboutText: DRAFT, remainingSuggestions: 0 });
    expect(await prisma.aiUsage.count({ where: { companyId: co.company.id, costUsd: { gt: 0 } } })).toBe(18);

    const err = await svc.enrich(co.auth).catch((e: unknown) => e);
    const body = (err as { getResponse: () => { message: string; i18nKey: string } }).getResponse();
    expect(body.i18nKey).toBe("api.ai.profilTanitimDenemeSiniriDoldu");
    expect(body.message).toMatch(/toplam deneme sınırına \(18\) ulaşıldı/);
    expect(body.message).not.toMatch(/toplam 6 AI tanıtım önerisi/);
    // Reddedilen istek sağlayıcıya gitmez, deneme kaydı da yazmaz.
    expect(provider.calls).toHaveLength(1);
    expect(await countOf(co.company.id, "company.profile_enrich_attempt")).toBe(1);
    expect(await countOf(co.company.id, "company.profile_enriched")).toBe(3);
  });

  it("başarısız deneme hakkı YAKMAZ: sağlayıcı hatasından sonra hak tamdır", async () => {
    const co = await seedCompany({ verified: false });
    const provider = new FakeProvider();
    const svc = makeService(provider);

    provider.failWith = new AiProviderError("upstream 503", "provider_error");
    await expect(svc.enrich(co.auth)).rejects.toThrow();
    expect(await countOf(co.company.id, "company.profile_enriched")).toBe(0);

    // Taslak dönmeyen (boş metin) deneme de yakmaz.
    provider.failWith = null;
    provider.text = JSON.stringify({ aboutText: "" });
    await expect(svc.enrich(co.auth)).rejects.toThrow(/tanıtım yazamadı/);
    expect(await countOf(co.company.id, "company.profile_enriched")).toBe(0);

    provider.text = JSON.stringify({ aboutText: DRAFT });
    await expect(svc.enrich(co.auth)).resolves.toMatchObject({ aboutText: DRAFT, remainingSuggestions: 5 });
    // Üç deneme de günlük sayaca girdi; her birinin bitiş kaydı var.
    expect(await countOf(co.company.id, "company.profile_enrich_attempt")).toBe(3);
    expect(await countOf(co.company.id, "company.profile_enrich_settled")).toBe(3);
  });

  it("tam erişimli firma ömürlük sayaçtan MUAF; günlük deneme sınırı (3) yine uygulanır", async () => {
    const co = await seedCompany({ verified: true });
    await seedPastSuccess(co.company.id, 10);
    const provider = new FakeProvider();
    const svc = makeService(provider);

    for (let i = 0; i < 3; i++) {
      await expect(svc.enrich(co.auth)).resolves.toMatchObject({ remainingSuggestions: null });
    }
    await expect(svc.enrich(co.auth)).rejects.toThrow(/Günlük AI tanıtım önerisi sınırına ulaşıldı \(3\)/);
    expect(provider.calls).toHaveLength(3);
    // Tam erişimli firmada bitiş kaydı tutulmaz (süren-istek kilidi yalnız sınırlı firmaya).
    expect(await countOf(co.company.id, "company.profile_enrich_settled")).toBe(0);
  });

  /**
   * PD-07: günlük pencere UTC gece yarısında (TR 03:00) başlıyordu; sınır metni
   * "yarın tekrar deneyin" der. Pencere uygulama takvim günüdür (Europe/Istanbul).
   * İki test birlikte günün her saatinde ayırt edicidir: UTC pencereli eski kod
   * TR 00:00-03:00 arasında ilkinde, günün geri kalanında ikincisinde kırılır.
   */
  describe("günlük pencere = uygulama takvim günü (Europe/Istanbul)", () => {
    const bugunBasi = () => appDayStart(appDayKey(new Date()))!;
    const denemeler = (companyId: string, createdAt: Date) =>
      prisma.auditLog.createMany({
        data: Array.from({ length: 3 }, () => ({
          action: "company.profile_enrich_attempt",
          actorType: "company",
          tenantId: companyId,
          createdAt,
        })),
      });

    it("DÜN (TR) yapılan 3 deneme bugünü kilitlemez — gece yarısından bir dakika önce bile olsa", async () => {
      const co = await seedCompany({ verified: true });
      await denemeler(co.company.id, new Date(bugunBasi().getTime() - 60_000));
      const provider = new FakeProvider();
      await expect(makeService(provider).enrich(co.auth)).resolves.toMatchObject({ aboutText: DRAFT });
      expect(provider.calls).toHaveLength(1);
    });

    it("BUGÜN (TR) 00:00'dan itibaren yapılan 3 deneme sınırı doldurur — UTC günü değişmemiş olsa da", async () => {
      const co = await seedCompany({ verified: true });
      await denemeler(co.company.id, bugunBasi());
      const provider = new FakeProvider();
      await expect(makeService(provider).enrich(co.auth)).rejects.toThrow(
        /Günlük AI tanıtım önerisi sınırına ulaşıldı \(3\)/,
      );
      expect(provider.calls).toHaveLength(0);
    });
  });

  it("günlük deneme sınırı tam erişimi olmayan firmada da geçerli", async () => {
    const co = await seedCompany({ verified: false });
    const provider = new FakeProvider();
    const svc = makeService(provider);
    for (let i = 0; i < 3; i++) await svc.enrich(co.auth);
    await expect(svc.enrich(co.auth)).rejects.toThrow(/Günlük AI tanıtım önerisi sınırına ulaşıldı/);
    expect(provider.calls).toHaveLength(3);
    expect(await countOf(co.company.id, "company.profile_enriched")).toBe(3);
  });
});
