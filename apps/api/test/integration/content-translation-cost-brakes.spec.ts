/**
 * İÇERİK ÇEVİRİSİ MALİYET FRENLERİ (yayın denetimi 2026-09-28 Bölüm 5).
 *
 * Çeviri platformun anahtarıyla koşar, firma bütçesine yazılmaz. Frensiz
 * hâliyle ücretsiz bir hesap (a) sınırsız nitelik değeriyle dev kaynak
 * gönderip her denemede iki Pro çağrısı yaktırabiliyor, (b) ürün yayınla/geri
 * çek döngüsüyle sınırsız çeviri işi açabiliyor, (c) kaynak değişmeden yapılan
 * her kayıtta başarısız çevirinin sayacını sıfırlatıp hemen yeniden
 * denetebiliyordu. Kilitlenenler:
 *   · kaynak `MAX_SOURCE_CHARS`i aşarsa model ÇAĞRILMAZ, kayıt kalıcı FAILED;
 *   · firma başına günlük iş tavanı — başka firmanın çevirisi etkilenmez;
 *   · platform günlük USD tavanı (0 = çeviri durur);
 *   · aynı kaynakta başarısız çeviri `enqueue` ile sıfırlanmaz, yeniden
 *     çağrı yakmaz;
 *   · aynı anda en fazla 4 iş modelde.
 */
import { ContentTranslationService, MAX_SOURCE_CHARS } from "../../src/modules/content-translation/content-translation.service";
import { makeCompanyWithUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

const ENV_KEYS = ["CONTENT_TRANSLATION_DAILY_USD", "CONTENT_TRANSLATION_COMPANY_DAILY_JOBS"] as const;
const prevEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (prevEnv[k] === undefined) delete process.env[k];
    else process.env[k] = prevEnv[k];
  }
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

/**
 * Doğrulamadan geçmeyen çıktı döndüren sahte sağlayıcı: her iş iki çağrı
 * yapar (bir düzeltme turu) ve FAILED biter — sayılan şey ÇAĞRI sayısı.
 */
function rig(opts: { delayMs?: number } = {}) {
  let active = 0;
  let maxActive = 0;
  const complete = jest.fn(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    active -= 1;
    return {
      text: "geçersiz çıktı",
      usage: { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  });
  const cfg = {
    enabled: true,
    models: { premium: "m" },
    pricing: { m: { inputPerMTok: 1, outputPerMTok: 1, cacheReadPerMTok: 0 } },
  };
  const svc = new ContentTranslationService(prisma as never, cfg as never, { complete } as never);
  // `enqueue` satırı açsın ama kendiliğinden başlatmasın — testler işi `translateEntity` ile sürer.
  svc.kick = () => undefined;
  return { svc, complete, maxActive: () => maxActive };
}

async function product(companyId: string, userId: string, over: Record<string, unknown> = {}) {
  return prisma.companyItem.create({
    data: { companyId, createdById: userId, name: "Dağıtım panosu", unit: "adet", keywords: ["pano"], ...over },
  });
}

async function rowsOf(entityId: string) {
  return prisma.contentTranslation.findMany({ where: { entityId }, orderBy: { locale: "asc" } });
}

describe("içerik çevirisi — maliyet frenleri", () => {
  it("kaynak tavanı: dev kaynakta model ÇAĞRILMAZ, kayıt kalıcı FAILED (yeniden denenmez)", async () => {
    const { svc, complete } = rig();
    const { company, user } = await makeCompanyWithUser(prisma);
    const p = await product(company.id, user.id, { description: "x".repeat(MAX_SOURCE_CHARS + 10) });

    expect(await svc.enqueue("PRODUCT", p.id)).toBe(true);
    expect(await svc.translateEntity("PRODUCT", p.id)).toBe("failed");

    expect(complete).not.toHaveBeenCalled();
    const rows = await rowsOf(p.id);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "FAILED" && r.attempts === 9 && /source too large/.test(r.error ?? ""))).toBe(true);
  });

  it("firma günlük iş tavanı: tavanı aşan iş modele gitmez; BAŞKA firmanın çevirisi sürer", async () => {
    process.env.CONTENT_TRANSLATION_COMPANY_DAILY_JOBS = "2";
    const { svc, complete } = rig();
    const a = await makeCompanyWithUser(prisma);
    const b = await makeCompanyWithUser(prisma);
    const ps = await Promise.all([1, 2, 3].map((i) => product(a.company.id, a.user.id, { name: `Pano ${i}` })));
    const other = await product(b.company.id, b.user.id, { name: "Kablo" });

    for (const p of [...ps, other]) await svc.enqueue("PRODUCT", p.id);
    for (const p of ps) await svc.translateEntity("PRODUCT", p.id);
    // İki iş × iki çağrı (düzeltme turu); üçüncü iş hiç çağırmadı.
    expect(complete).toHaveBeenCalledTimes(4);
    const third = await rowsOf(ps[2]!.id);
    expect(third.every((r) => r.status === "FAILED" && r.attempts === 3 && /company daily/.test(r.error ?? ""))).toBe(true);

    await svc.translateEntity("PRODUCT", other.id);
    expect(complete).toHaveBeenCalledTimes(6);
  });

  it("platform günlük USD tavanı: 0 ise hiçbir çeviri modele gitmez; harcama tavanı doldurunca sonraki iş durur", async () => {
    process.env.CONTENT_TRANSLATION_DAILY_USD = "0";
    const first = rig();
    const { company, user } = await makeCompanyWithUser(prisma);
    const p1 = await product(company.id, user.id, { name: "Pano 1" });
    await first.svc.enqueue("PRODUCT", p1.id);
    await first.svc.translateEntity("PRODUCT", p1.id);
    expect(first.complete).not.toHaveBeenCalled();
    expect((await rowsOf(p1.id)).every((r) => /platform daily/.test(r.error ?? ""))).toBe(true);

    // Çağrı başına 0,002 USD (1000+1000 token × 1 USD/M); tavan 0,003 → ilk iş
    // iki çağrıyla 0,004 harcar, ikinci iş tavana takılır.
    process.env.CONTENT_TRANSLATION_DAILY_USD = "0.003";
    const second = rig();
    const p2 = await product(company.id, user.id, { name: "Pano 2" });
    const p3 = await product(company.id, user.id, { name: "Pano 3" });
    for (const p of [p2, p3]) await second.svc.enqueue("PRODUCT", p.id);
    await second.svc.translateEntity("PRODUCT", p2.id);
    await second.svc.translateEntity("PRODUCT", p3.id);
    expect(second.complete).toHaveBeenCalledTimes(2);
    expect((await rowsOf(p3.id)).every((r) => /platform daily/.test(r.error ?? ""))).toBe(true);
  });

  it("aynı kaynakta başarısız çeviri: enqueue sayacı SIFIRLAMAZ ve yeniden kuyruğa almaz", async () => {
    const { svc, complete } = rig();
    const { company, user } = await makeCompanyWithUser(prisma);
    const p = await product(company.id, user.id);
    await svc.enqueue("PRODUCT", p.id);
    await svc.translateEntity("PRODUCT", p.id);
    const failed = await rowsOf(p.id);
    expect(failed.every((r) => r.status === "FAILED" && r.attempts === 1)).toBe(true);

    let kicked = 0;
    svc.kick = () => {
      kicked += 1;
    };
    // Kayıt/yayın döngüsü: kaynak değişmeden tekrar tekrar kuyruğa alma.
    for (let i = 0; i < 5; i++) expect(await svc.enqueue("PRODUCT", p.id)).toBe(false);

    expect(kicked).toBe(0);
    expect(complete).toHaveBeenCalledTimes(2);
    expect((await rowsOf(p.id)).every((r) => r.status === "FAILED" && r.attempts === 1)).toBe(true);

    // Kaynak DEĞİŞİNCE yeniden kuyruğa girer (sayaç sıfırlanır).
    await prisma.companyItem.update({ where: { id: p.id }, data: { name: "Dağıtım panosu IP65" } });
    expect(await svc.enqueue("PRODUCT", p.id)).toBe(true);
    expect(kicked).toBe(1);
    expect((await rowsOf(p.id)).every((r) => r.status === "PENDING" && r.attempts === 0)).toBe(true);
  });

  it("eşzamanlılık: aynı anda en fazla 4 iş modelde; kalanlar sırayla tamamlanır", async () => {
    const { svc, complete, maxActive } = rig({ delayMs: 40 });
    const { company, user } = await makeCompanyWithUser(prisma);
    const ps = await Promise.all(Array.from({ length: 8 }, (_, i) => product(company.id, user.id, { name: `Pano ${i}` })));
    for (const p of ps) await svc.enqueue("PRODUCT", p.id);

    const results = await Promise.all(ps.map((p) => svc.translateEntity("PRODUCT", p.id)));

    expect(results.every((r) => r === "failed")).toBe(true);
    expect(complete).toHaveBeenCalledTimes(16);
    expect(maxActive()).toBeLessThanOrEqual(4);
    expect(maxActive()).toBeGreaterThan(1);
  });
});
