/**
 * Faz AI-0 — AI bütçe motoru + orkestratör sözleşme testleri.
 *
 * Sözleşmeler:
 * - Bütçe kontrolü ÇAĞRIDAN ÖNCE: bütçe doluysa sağlayıcıya istek GİTMEZ.
 * - Ön-rezervasyon + FOR UPDATE: iki eşzamanlı istek son bütçeyi PAYLAŞAMAZ.
 * - Tavanlar: kullanıcı %50, günlük %25, istek-başı %5, premium alt-bütçe %20.
 * - Erişim: SA/ST koltuk sahibi + Silver+ (etiket-only, ONAYLAYICI, Standart → 403).
 * - Maliyet: girdi/çıktı/cache AYRI fiyatlanır, doğru MODELİN fiyatıyla.
 * - Bakiye TÜRETİLİR (SUM) — stored bakiye yok; FAILED(0) etkisiz, timeout tahmini korur.
 * - Kullanıcı model SEÇEMEZ; yükseltme kod kararıdır (eşik/feature/retry).
 */
import "reflect-metadata";
import { CompanyRole, Prisma } from "@rothern/db";
import { ForbiddenException } from "@nestjs/common";
import { AiBudgetService, AiBudgetExceededException } from "../../src/modules/ai/ai-budget.service";
import { AiService, type AiCallOptions } from "../../src/modules/ai/ai.service";
import type { AiConfig } from "../../src/modules/ai/ai.config";
import {
  AiProviderError,
  AiProviderTimeoutError,
  BaseAiProvider,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiTokenUsage,
} from "../../src/modules/ai/providers/ai-provider.interface";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeUser } from "./factories";

const FLASH = "gemini-2.5-flash";
const PRO = "gemini-3.1-pro";

function makeCfg(over: {
  budgets?: Partial<Record<string, number>>;
  caps?: Partial<AiConfig["caps"]>;
  upgrade?: Partial<AiConfig["upgrade"]>;
  maxOutputTokens?: number;
  enabled?: boolean;
} = {}): AiConfig {
  return {
    enabled: over.enabled ?? true,
    provider: "gemini",
    vertex: null,
    apiKey: over.enabled === false ? null : "test-key",
    models: { default: FLASH, vision: FLASH, premium: PRO },
    pricing: {
      [FLASH]: { inputPerMTok: 0.3, outputPerMTok: 2.5, cacheReadPerMTok: 0.03 },
      [PRO]: { inputPerMTok: 2, outputPerMTok: 12, cacheReadPerMTok: 0.2 },
    },
    monthlyBudgetUsd: { SILVER: 6, GOLD: 25, ...(over.budgets ?? {}) },
    caps: {
      userShare: 0.5,
      dailyShare: 0.25,
      requestShare: 0.05,
      premiumShare: 0.2,
      warnShare: 0.8,
      ...(over.caps ?? {}),
    },
    upgrade: {
      inputTokenThreshold: 50_000,
      premiumFeatures: [],
      ...(over.upgrade ?? {}),
    },
    maxOutputTokens: over.maxOutputTokens ?? 1000,
    timeoutMs: 5000,
    maxPages: 20,
  };
}

const OK_USAGE: AiTokenUsage = {
  inputTokens: 1000,
  outputTokens: 2000,
  cacheReadTokens: 500,
  cacheWriteTokens: 0,
};

class FakeProvider extends BaseAiProvider {
  readonly name = "fake";
  calls: AiCompletionRequest[] = [];
  usage: AiTokenUsage = OK_USAGE;
  delayMs = 0;
  failWith: Error | null = null;

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    this.calls.push(req);
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    if (this.failWith) throw this.failWith;
    return { text: "cevap", usage: this.usage };
  }
}

function makeAi(cfg: AiConfig, provider: BaseAiProvider | null) {
  const budget = new AiBudgetService(prisma as never, cfg);
  return new AiService(cfg, provider, budget, prisma as never, undefined);
}

function authFor(
  u: { id: string; email: string },
  companyId: string,
  roles: CompanyRole[],
  over: { tier?: string; isOwner?: boolean; verification?: string } = {},
) {
  return {
    userId: u.id,
    companyId,
    email: u.email,
    roles,
    isOwner: over.isOwner ?? false,
    country: "TR",
    tier: over.tier ?? "GOLD",
    // Ücretsiz dönem: kısıtlı firma = DOĞRULANMAMIŞ firma (saklı kademesiyle kalır).
    companyVerificationStatus: over.verification ?? "VERIFIED",
  } as never;
}

/** Ay içi (bugün olmayan güne denk gelmeyecek şekilde ay başı +1 saat) seed. */
function monthStartSeedDate(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 1, 0, 0),
  );
}

async function seedSpend(
  companyId: string,
  userId: string,
  costUsd: number | string,
  over: Partial<Prisma.AiUsageUncheckedCreateInput> = {},
) {
  return prisma.aiUsage.create({
    data: {
      companyId,
      userId,
      feature: "test",
      model: FLASH,
      status: "SETTLED",
      costUsd: new Prisma.Decimal(costUsd),
      ...over,
    },
  });
}

const CALL: AiCallOptions = { feature: "test", prompt: "x".repeat(400) }; // ~100 girdi token

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("Faz AI-0 — erişim kapısı", () => {
  it("SA/ST olmayan 403 (ONAYLAYICI + etiket-only Kurucu) — sağlayıcıya istek gitmez", async () => {
    const provider = new FakeProvider();
    const ai = makeAi(makeCfg(), provider);
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });

    const approver = await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);
    await expect(
      ai.callAi(authFor(approver, co.company.id, [CompanyRole.ONAYLAYICI]), CALL),
    ).rejects.toThrow(/işlem yetkisi taşıyan/);

    // Etiket-only Kurucu (Faz R: SAHIP op-izin vermez) → AI yok.
    const owner = await makeUser(prisma, co.company.id, [CompanyRole.SAHIP]);
    await expect(
      ai.callAi(
        authFor(owner, co.company.id, [CompanyRole.SAHIP], { isOwner: true }),
        CALL,
      ),
    ).rejects.toThrow(/işlem yetkisi taşıyan/);

    expect(provider.calls).toHaveLength(0);
  });

  it("doğrulanmamış firma (saklı STANDART) 403 — metin doğrulama ister, paket adı anmaz", async () => {
    const provider = new FakeProvider();
    const ai = makeAi(makeCfg(), provider);
    // Ücretsiz dönem: kısıtlı firma = doğrulanmamış firma; ret metni duruma göre ayrışır.
    const expected: Record<string, RegExp> = {
      UNVERIFIED: /AI özellikleri için firma doğrulaması gerekir/,
      PENDING: /Firma doğrulamanız inceleniyor/,
      REJECTED: /Firma doğrulamanız onaylanmadı/,
    };
    for (const verification of ["UNVERIFIED", "PENDING", "REJECTED"] as const) {
      const co = await makeCompanyWithUser(prisma, {
        tier: "STANDART",
        companyVerificationStatus: verification,
      });
      const denied = ai.callAi(
        authFor(co.user, co.company.id, co.auth.roles as CompanyRole[], {
          tier: "STANDART",
          isOwner: true,
          verification,
        }),
        CALL,
      );
      await expect(denied).rejects.toThrow(ForbiddenException);
      await expect(denied).rejects.toThrow(expected[verification]!);
      await expect(denied).rejects.not.toThrow(/Silver|Gold|paket/i);
    }
    expect(provider.calls).toHaveLength(0);
  });

  it("anahtar yoksa AI kapalı: 503 (fail-closed)", async () => {
    const ai = makeAi(makeCfg({ enabled: false }), null);
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await expect(ai.callAi(co.auth, CALL)).rejects.toThrow(/kullanılamıyor/);
  });
});

describe("Faz AI-0 — bütçe tavanları (çağrıdan ÖNCE reddedilir)", () => {
  it("aylık havuz dolu → rezervasyon reddi, sağlayıcıya istek GİTMEZ", async () => {
    const provider = new FakeProvider();
    const ai = makeAi(makeCfg(), provider);
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await seedSpend(co.company.id, co.user.id, 25, {
      createdAt: monthStartSeedDate(),
    });

    await expect(ai.callAi(co.auth, CALL)).rejects.toThrow(AiBudgetExceededException);
    await expect(ai.callAi(co.auth, CALL)).rejects.toThrow(/aylık AI bütçesi doldu/);
    expect(provider.calls).toHaveLength(0);
    // Reddedilen istek iz bırakmaz (rezervasyon yazılmadı).
    expect(await prisma.aiUsage.count({ where: { status: "RESERVED" } })).toBe(0);
  });

  it("tek kullanıcı havuzun %50'sinden fazlasını tüketemez; diğer kullanıcı devam eder", async () => {
    const provider = new FakeProvider();
    // Günlük tavan karışmasın — bu test yalnız kullanıcı tavanını ölçer.
    const ai = makeAi(makeCfg({ caps: { dailyShare: 1 } }), provider);
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await seedSpend(co.company.id, co.user.id, 12.5, {
      createdAt: monthStartSeedDate(),
    });

    await expect(ai.callAi(co.auth, CALL)).rejects.toThrow(/Kişisel AI kullanım tavanınıza/);

    const u2 = await makeUser(prisma, co.company.id, [CompanyRole.SATIN_ALMACI]);
    await expect(
      ai.callAi(authFor(u2, co.company.id, [CompanyRole.SATIN_ALMACI]), CALL),
    ).resolves.toMatchObject({ text: "cevap" });
    expect(provider.calls).toHaveLength(1);
  });

  it("günlük tavan (aylık bütçenin %25'i) çalışır", async () => {
    const provider = new FakeProvider();
    const ai = makeAi(makeCfg({ caps: { userShare: 1 } }), provider);
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    // Bugünkü harcama 6.25 (=%25) → yeni istek günlük tavana takılır.
    await seedSpend(co.company.id, co.user.id, 6.25);

    await expect(ai.callAi(co.auth, CALL)).rejects.toThrow(/Günlük AI kullanım tavanına/);
    expect(provider.calls).toHaveLength(0);
  });

  it("istek-başı tavan (%5): tek dev istek reddedilir", async () => {
    const provider = new FakeProvider();
    // Havuz 0.01 → istek-başı 0.0005; flash tahmini ~0.0025 > tavan.
    const ai = makeAi(makeCfg({ budgets: { GOLD: 0.01 } }), provider);
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });

    await expect(ai.callAi(co.auth, CALL)).rejects.toThrow(/bölerek deneyin/);
    expect(provider.calls).toHaveLength(0);
  });

  it("ret mesajı SON adayın sebebinden: premium request_cap + Flash havuz → 'havuz doldu' (derin denetim LU-04)", async () => {
    const budget = new AiBudgetService(prisma as never, makeCfg());
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await seedSpend(co.company.id, co.user.id, 24.999, { createdAt: monthStartSeedDate() });
    const reserve = budget.reserve({
      companyId: co.company.id,
      userId: co.user.id,
      feature: "test",
      candidates: [
        // Havuz 25 → istek tavanı 1,25; premium tahmini 2 → request_cap.
        { model: PRO, estimatedCostUsd: new Prisma.Decimal(2), isPremium: true },
        // Flash sığardı ama aylık havuz dolu → pool.
        { model: FLASH, estimatedCostUsd: new Prisma.Decimal(0.01), isPremium: false },
      ],
    });
    await expect(reserve).rejects.toThrow(/aylık AI bütçesi doldu/);
  });

  it("paket bazında istek tavanı (requestShareByTier): yalnız o pakette genişler, diğer paketler %5'te kalır (derin denetim S013/X21)", async () => {
    // Gerçek sayılar: STANDART havuzu 0,5 USD, çıktı tavanı 8192 token.
    // Web aramalı tahmin = 0,035 (istek ücreti) + 8192×2,5/1M ≈ 0,056 USD;
    // genel %5 pay 0,025 USD tavan verir → her seferinde request_cap.
    // (Mekanizma testi: profil tanıtımı önerisi 2026-10-08'den beri web'e
    // çıkmaz; web araması tedarikçi keşfinde kullanılır.)
    const GROUNDED: AiCallOptions = {
      feature: "test",
      prompt: "x".repeat(800),
      minTier: "STANDART",
      webSearch: true,
    };
    // Ücretsiz dönem: STANDART havuzu yalnız DOĞRULANMAMIŞ firmada geçerli
    // (doğrulanmış firma en üst kademenin havuzunu kullanır).
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      companyVerificationStatus: "UNVERIFIED",
    });
    const auth = authFor(co.user, co.company.id, co.auth.roles as CompanyRole[], {
      tier: "STANDART",
      isOwner: true,
      verification: "UNVERIFIED",
    });

    const eski = new FakeProvider();
    const aiEski = makeAi(
      makeCfg({ budgets: { STANDART: 0.5 }, maxOutputTokens: 8192 }),
      eski,
    );
    await expect(aiEski.callAi(auth, GROUNDED)).rejects.toThrow(AiBudgetExceededException);
    expect(eski.calls).toHaveLength(0);

    const yeni = new FakeProvider();
    const aiYeni = makeAi(
      makeCfg({
        budgets: { STANDART: 0.5 },
        maxOutputTokens: 8192,
        caps: { requestShareByTier: { STANDART: 0.2 } },
      }),
      yeni,
    );
    await expect(aiYeni.callAi(auth, GROUNDED)).resolves.toMatchObject({ text: "cevap" });
    expect(yeni.calls).toHaveLength(1);

    // Override yalnız STANDART'a: GOLD havuzu 0,5 olsaydı %5 tavanı sürerdi.
    const gold = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const goldAi = makeAi(
      makeCfg({
        budgets: { GOLD: 0.5 },
        maxOutputTokens: 8192,
        caps: { requestShareByTier: { STANDART: 0.2 } },
      }),
      new FakeProvider(),
    );
    await expect(
      goldAi.callAi(gold.auth, { feature: "test", prompt: "x".repeat(800), webSearch: true }),
    ).rejects.toThrow(AiBudgetExceededException);
  });

  it("paket bazında günlük tavan (dailyShareByTier): zaman aşımı tahmini KORUNUR, günün sonraki denemesi yine sığar (MU-06 gözden geçirme)", async () => {
    // Profil tanıtımı önerisi: tek metin çağrısı, tahmin ≈ 8192×2,5/1M ≈ 0,021 USD.
    // Zaman aşımına düşen deneme tahminini KORUR (FAILED satır, fail-closed).
    // Günün önceki denemeleri tahminiyle kalmışken genel günlük pay
    // (0,5 × %25 = 0,125) yeni çağrıyı daily_cap ile düşürür; STANDART payı
    // 0,5 (0,25 USD) ile sığar.
    const CALL_STANDART: AiCallOptions = {
      feature: "profile_enrich",
      prompt: "x".repeat(4000),
      minTier: "STANDART",
    };
    // Ücretsiz dönem: STANDART havuzu yalnız DOĞRULANMAMIŞ firmada geçerli
    // (doğrulanmış firma en üst kademenin havuzunu kullanır).
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      companyVerificationStatus: "UNVERIFIED",
    });
    const auth = authFor(co.user, co.company.id, co.auth.roles as CompanyRole[], {
      tier: "STANDART",
      isOwner: true,
      verification: "UNVERIFIED",
    });
    await seedSpend(co.company.id, co.user.id, "0.11", {
      feature: "profile_enrich",
      status: "FAILED",
      errorCode: "timeout",
    });

    // Genel günlük pay: 0,11 + 0,021 > 0,125 → sağlayıcıya GİTMEDEN reddedilir
    // (para yanmaz, rezervasyon satırı açılmaz).
    const eski = new FakeProvider();
    const aiEski = makeAi(
      makeCfg({
        budgets: { STANDART: 0.5 },
        maxOutputTokens: 8192,
        caps: { requestShareByTier: { STANDART: 0.2 } },
      }),
      eski,
    );
    await expect(aiEski.callAi(auth, CALL_STANDART)).rejects.toThrow(AiBudgetExceededException);
    expect(eski.calls).toHaveLength(0);
    expect(
      await prisma.aiUsage.count({ where: { companyId: co.company.id, status: "RESERVED" } }),
    ).toBe(0);

    // STANDART günlük payı 0,5 (0,25 USD): aynı gün yeni deneme sığar.
    const yeni = new FakeProvider();
    yeni.usage = { inputTokens: 1000, outputTokens: 400, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const aiYeni = makeAi(
      makeCfg({
        budgets: { STANDART: 0.5 },
        maxOutputTokens: 8192,
        caps: { requestShareByTier: { STANDART: 0.2 }, dailyShareByTier: { STANDART: 0.5 } },
      }),
      yeni,
    );
    await expect(aiYeni.callAi(auth, CALL_STANDART)).resolves.toMatchObject({ text: "cevap" });
    expect(yeni.calls).toHaveLength(1);

    // Satır yalnız kendi (gerçek) maliyetini tutar.
    const rows = await prisma.aiUsage.findMany({
      where: { companyId: co.company.id, status: "SETTLED" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.costUsd.toNumber()).toBeLessThan(0.01);
  });

  it("YARIŞ: kalan bütçeye tek istek sığarken 2 eşzamanlı istek → TAM 1 başarılı", async () => {
    const provider = new FakeProvider();
    provider.delayMs = 50;
    // flash tahmini = (100×0.3 + 1000×2.5)/1e6 = 0.00253; havuz 0.004 → 1 sığar, 2 sığmaz.
    const ai = makeAi(
      makeCfg({
        budgets: { GOLD: 0.004 },
        caps: { requestShare: 1, userShare: 1, dailyShare: 1 },
      }),
      provider,
    );
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });

    const results = await Promise.allSettled([
      ai.callAi(co.auth, CALL),
      ai.callAi(co.auth, CALL),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    expect(provider.calls).toHaveLength(1); // kaybeden sağlayıcıya hiç gitmedi
    expect(
      (fail[0] as PromiseRejectedResult).reason,
    ).toBeInstanceOf(AiBudgetExceededException);
  });
});

describe("Faz AI-0 — model politikası (kod kararı; kullanıcı seçemez)", () => {
  it("girdi eşiğini aşan belge premium'a gider; kısa istek flash'ta kalır", async () => {
    const provider = new FakeProvider();
    const ai = makeAi(makeCfg({ upgrade: { inputTokenThreshold: 150 } }), provider);
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });

    await ai.callAi(co.auth, CALL); // ~100 token < 150 → flash
    await ai.callAi(co.auth, { feature: "test", prompt: "x".repeat(1000) }); // 250 > 150 → pro
    expect(provider.calls[0]!.model).toBe(FLASH);
    expect(provider.calls[1]!.model).toBe(PRO);
  });

  it("baştan premium işaretli özellik + premiumRetry premium'a gider", async () => {
    const provider = new FakeProvider();
    const ai = makeAi(
      makeCfg({ upgrade: { premiumFeatures: ["bid_compare"] } }),
      provider,
    );
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });

    await ai.callAi(co.auth, { feature: "bid_compare", prompt: "kısa" });
    await ai.callAi(co.auth, { feature: "test", prompt: "kısa", premiumRetry: true });
    expect(provider.calls[0]!.model).toBe(PRO);
    expect(provider.calls[1]!.model).toBe(PRO);
  });

  it("premium alt-bütçesi (%20) doluysa yükseltme YAPILMAZ — flash ile devam (downgraded)", async () => {
    const provider = new FakeProvider();
    const ai = makeAi(
      makeCfg({ caps: { userShare: 1, dailyShare: 1 } }),
      provider,
    );
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    // Premium alt-bütçe: 25×0.2 = 5 → dolu.
    await seedSpend(co.company.id, co.user.id, 5, {
      model: PRO,
      createdAt: monthStartSeedDate(),
    });

    const result = await ai.callAi(co.auth, {
      feature: "test",
      prompt: "kısa",
      premiumRetry: true,
    });
    expect(result.downgraded).toBe(true);
    expect(provider.calls[0]!.model).toBe(FLASH);
  });

  it("kullanıcı model SEÇEMEZ: options içine sızdırılan model alanı yok sayılır", async () => {
    const provider = new FakeProvider();
    const ai = makeAi(makeCfg(), provider);
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });

    await ai.callAi(co.auth, {
      ...CALL,
      // API yüzeyinde model alanı YOK — kötü niyetli/yanlış çağıran eklese bile
      // model seçimi pickModel kurallarından gelir.
      model: PRO,
    } as never);
    expect(provider.calls[0]!.model).toBe(FLASH);
  });
});

describe("Faz AI-0 — maliyet hesabı + türetilmiş bakiye", () => {
  it("maliyet cache dahil, DOĞRU modelin fiyatıyla hesaplanır (settle snapshot)", async () => {
    const provider = new FakeProvider();
    const ai = makeAi(makeCfg(), provider);
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });

    // Flash: (1000×0.3 + 2000×2.5 + 500×0.03)/1e6 = 0.005315
    await ai.callAi(co.auth, CALL);
    // Pro: (1000×2 + 2000×12 + 500×0.2)/1e6 = 0.0261
    await ai.callAi(co.auth, { feature: "test", prompt: "kısa", premiumRetry: true });

    const rows = await prisma.aiUsage.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.status).toBe("SETTLED");
    expect(rows[0]!.model).toBe(FLASH);
    expect(rows[0]!.costUsd.toString()).toBe("0.005315");
    expect(rows[0]!.inputTokens).toBe(1000);
    expect(rows[0]!.cacheReadTokens).toBe(500);
    expect(rows[1]!.model).toBe(PRO);
    expect(rows[1]!.costUsd.toString()).toBe("0.0261");
  });

  it("sağlayıcı hatası (usage yok) → FAILED costUsd=0; timeout → tahmin KALIR (fail-closed)", async () => {
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });

    const p1 = new FakeProvider();
    p1.failWith = new AiProviderError("boom", "provider_error");
    await expect(makeAi(makeCfg(), p1).callAi(co.auth, CALL)).rejects.toThrow(
      /sağlayıcısı hata/,
    );
    const failed = await prisma.aiUsage.findFirstOrThrow({
      where: { errorCode: "provider_error" },
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.costUsd.toString()).toBe("0");

    const p2 = new FakeProvider();
    p2.failWith = new AiProviderTimeoutError("timeout");
    await expect(makeAi(makeCfg(), p2).callAi(co.auth, CALL)).rejects.toThrow(
      /zaman aşımı/,
    );
    const timedOut = await prisma.aiUsage.findFirstOrThrow({
      where: { errorCode: "timeout" },
    });
    expect(timedOut.status).toBe("FAILED");
    expect(timedOut.costUsd.toNumber()).toBeGreaterThan(0); // tahmin korunur
  });

  it("sağlayıcı hatasının temizlenmiş sebebi kullanım kaydına yazılır (metadata.providerReason); özellik bağlamı korunur, errorCode değişmez", async () => {
    // Staging'de her çağrı 502 dönüyordu ve kayıtta yalnız `provider_error`
    // vardı — Google'ın asıl yanıtı günlüğe bakmadan öğrenilemiyordu.
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const p = new FakeProvider();
    p.failWith = new AiProviderError(
      "Gemini hatası: {\"error\":{\"code\":400,\"message\":\"User location is not supported\"}}",
      "provider_error",
      undefined,
      "http_400:FAILED_PRECONDITION:location_not_supported",
    );
    await expect(
      makeAi(makeCfg(), p).callAi(co.auth, { ...CALL, metadata: { route: "text", pages: 3 } }),
    ).rejects.toThrow(/sağlayıcısı hata/);

    const row = await prisma.aiUsage.findFirstOrThrow({ where: { companyId: co.company.id } });
    expect(row.status).toBe("FAILED");
    expect(row.errorCode).toBe("provider_error");
    expect(row.costUsd.toString()).toBe("0");
    expect(row.metadata).toEqual({
      route: "text",
      pages: 3,
      providerReason: "http_400:FAILED_PRECONDITION:location_not_supported",
    });
    // Ham sağlayıcı metni kayda GİRMEZ.
    expect(JSON.stringify(row.metadata)).not.toContain("User location");
  });

  it("sebep kayda yazılmadan önce süzülür (serbest metin/sır sızmaz); sebep yoksa metadata'ya dokunulmaz", async () => {
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const budget = new AiBudgetService(prisma as never, makeCfg());
    const est = new Prisma.Decimal("0.001");
    const reserve = (metadata?: Record<string, unknown>) =>
      budget.reserve({
        companyId: co.company.id,
        userId: co.user.id,
        feature: "test",
        metadata,
        candidates: [{ model: FLASH, estimatedCostUsd: est, isPremium: false }],
      });

    const dirty = await reserve();
    await budget.fail(dirty.id, {
      errorCode: "provider_error",
      reason: "http_403 key=AIzaSy-SECRET \"kullanici@firma.com\" " + "x".repeat(300),
    });
    const dirtyRow = await prisma.aiUsage.findUniqueOrThrow({ where: { id: dirty.id } });
    const stored = (dirtyRow.metadata as { providerReason: string }).providerReason;
    expect(stored).toMatch(/^[A-Za-z0-9_:]+$/);
    expect(stored.length).toBeLessThanOrEqual(96);
    expect(stored.startsWith("http_403")).toBe(true);
    expect(stored).not.toContain("@");
    expect(stored).not.toContain("-");

    const plain = await reserve({ route: "pdf_vision" });
    await budget.fail(plain.id, { errorCode: "timeout", keepEstimate: true });
    const plainRow = await prisma.aiUsage.findUniqueOrThrow({ where: { id: plain.id } });
    expect(plainRow.metadata).toEqual({ route: "pdf_vision" });
    expect(plainRow.costUsd.toString()).toBe(est.toString()); // timeout: tahmin korunur

    const bare = await reserve();
    await budget.fail(bare.id, { errorCode: "provider_error" });
    const bareRow = await prisma.aiUsage.findUniqueOrThrow({ where: { id: bare.id } });
    expect(bareRow.metadata).toBeNull();
  });

  it("bakiye TÜRETİLİR (SUM): FAILED(0) etkisiz, SETTLED + timeout-FAILED sayılır", async () => {
    const provider = new FakeProvider();
    const cfg = makeCfg({ budgets: { GOLD: 0.02 }, caps: { requestShare: 1, userShare: 1, dailyShare: 1 } });
    const ai = makeAi(cfg, provider);
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });

    await ai.callAi(co.auth, CALL); // SETTLED 0.005315 → %26.6
    await seedSpend(co.company.id, co.user.id, 0, {
      status: "FAILED",
      errorCode: "provider_error",
    });

    const view = (await ai.usageView(co.auth)) as { percentUsed: number; warning: boolean };
    // 0.005315 / 0.02 = %26.6 — FAILED(0) satır yüzdeyi DEĞİŞTİRMEZ.
    expect(view.percentUsed).toBeCloseTo(26.6, 1);
    expect(view.warning).toBe(false);

    // Havuzu %80 üstüne taşı → uyarı bayrağı (türetilmiş, stored flag yok).
    await seedSpend(co.company.id, co.user.id, 0.012, {
      status: "FAILED",
      errorCode: "reaper_timeout", // timeout: tahmin bütçede KALIR
    });
    const view2 = (await ai.usageView(co.auth)) as { percentUsed: number; warning: boolean };
    expect(view2.warning).toBe(true);
  });
});

describe("Faz AI-0 — kullanım ekranı görünürlüğü", () => {
  it("Kurucu/Yönetici firma kırılımını görür; SA yalnız kendini; ONAYLAYICI 403", async () => {
    const ai = makeAi(makeCfg(), new FakeProvider());
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const sa = await makeUser(prisma, co.company.id, [CompanyRole.SATIN_ALMACI]);
    await seedSpend(co.company.id, co.user.id, 2, { createdAt: monthStartSeedDate() });
    await seedSpend(co.company.id, sa.id, 1, {
      userEmail: sa.email,
      createdAt: monthStartSeedDate(),
    });

    const mgmt = (await ai.usageView(co.auth)) as Record<string, unknown>;
    expect(mgmt.view).toBe("company");
    expect(Array.isArray(mgmt.byUser)).toBe(true);
    expect((mgmt.byUser as unknown[]).length).toBe(2);
    // Dolar YOK — yalnız yüzde alanları.
    expect(JSON.stringify(mgmt)).not.toMatch(/costUsd|usd|dolar/i);

    const self = (await ai.usageView(
      authFor(sa, co.company.id, [CompanyRole.SATIN_ALMACI]),
    )) as Record<string, unknown>;
    expect(self.view).toBe("self");
    expect(self.byUser).toBeUndefined(); // firma toplamı/kırılımı sızmaz
    // Kendi tavanı = 25×0.5 = 12.5; harcaması 1 → %8.
    expect(self.percentUsed).toBeCloseTo(8, 0);

    const approver = await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);
    await expect(
      ai.usageView(authFor(approver, co.company.id, [CompanyRole.ONAYLAYICI])),
    ).rejects.toThrow(/görüntüleyebilir/);
  });

  it("havuz %100 → exhausted (AI kapalı, %80 uyarısından ayrı); kişisel tavan dolan SA da exhausted (arayüz testi D-172)", async () => {
    const ai = makeAi(makeCfg({ budgets: { GOLD: 10 } }), new FakeProvider());
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const sa = await makeUser(prisma, co.company.id, [CompanyRole.SATIN_ALMACI]);
    const saAuth = authFor(sa, co.company.id, [CompanyRole.SATIN_ALMACI]);

    // %85: uyarı var, AI açık.
    await seedSpend(co.company.id, co.user.id, 3.5, { createdAt: monthStartSeedDate() });
    await seedSpend(co.company.id, sa.id, 5, { createdAt: monthStartSeedDate() });
    let mgmt = (await ai.usageView(co.auth)) as { warning: boolean; exhausted: boolean };
    expect(mgmt).toMatchObject({ warning: true, exhausted: false });
    // SA kendi tavanını (10×0.5=5) doldurdu → onun için AI kapalı.
    expect(((await ai.usageView(saAuth)) as { exhausted: boolean }).exhausted).toBe(true);

    // Havuz %101,7 → firma görünümünde de kapalı.
    await seedSpend(co.company.id, co.user.id, 1.67, { createdAt: monthStartSeedDate() });
    mgmt = (await ai.usageView(co.auth)) as { warning: boolean; exhausted: boolean };
    expect(mgmt).toMatchObject({ warning: true, exhausted: true });
  });

  it("kurucu kişisel tavanını (havuzun yarısı) doldurdu, havuz %100 altında → firma görünümünde myExhausted (arayüz testi D-172)", async () => {
    const ai = makeAi(makeCfg({ budgets: { GOLD: 10 } }), new FakeProvider());
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });

    // Kurucu %40: havuz da kişisel tavan da açık.
    await seedSpend(co.company.id, co.user.id, 4, { createdAt: monthStartSeedDate() });
    let mgmt = (await ai.usageView(co.auth)) as { warning: boolean; exhausted: boolean; myExhausted: boolean };
    expect(mgmt).toMatchObject({ warning: false, exhausted: false, myExhausted: false });

    // Kurucu 5,2 (tavan 10×0.5=5) → havuz %52 ama kurucu için AI kapalı.
    await seedSpend(co.company.id, co.user.id, 1.2, { createdAt: monthStartSeedDate() });
    mgmt = (await ai.usageView(co.auth)) as { warning: boolean; exhausted: boolean; myExhausted: boolean };
    expect(mgmt).toMatchObject({ warning: false, exhausted: false, myExhausted: true });
  });

  it("tier kapısı: controller CompanyPaidTierGuard (Silver+) taşır", async () => {
    const { AiUsageController } = await import(
      "../../src/modules/ai/ai-usage.controller"
    );
    const { CompanyPaidTierGuard } = await import(
      "../../src/modules/company-auth/guards/company-paid-tier.guard"
    );
    const guards = (Reflect.getMetadata("__guards__", AiUsageController) ??
      []) as unknown[];
    expect(guards).toContain(CompanyPaidTierGuard);
  });
});

describe("Faz AI-0 — reaper", () => {
  it("askıda RESERVED (10dk+) → FAILED(reaper_timeout), tahmin tutarı korunur", async () => {
    const { AiScheduler } = await import("../../src/modules/ai/ai.scheduler");
    const scheduler = new AiScheduler(prisma as never);
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });

    const stale = await seedSpend(co.company.id, co.user.id, 0.01, {
      status: "RESERVED",
      createdAt: new Date(Date.now() - 11 * 60 * 1000),
    });
    const fresh = await seedSpend(co.company.id, co.user.id, 0.01, {
      status: "RESERVED",
    });

    await scheduler.reapStaleReservations();

    const staleAfter = await prisma.aiUsage.findUniqueOrThrow({ where: { id: stale.id } });
    const freshAfter = await prisma.aiUsage.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(staleAfter.status).toBe("FAILED");
    expect(staleAfter.errorCode).toBe("reaper_timeout");
    expect(staleAfter.costUsd.toString()).toBe("0.01"); // fail-closed: tahmin kalır
    expect(freshAfter.status).toBe("RESERVED"); // taze rezervasyona dokunulmaz
  });
});
