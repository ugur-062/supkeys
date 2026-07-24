/**
 * Faz AI-0 — AI bütçe motoru + orkestratör sözleşme testleri.
 *
 * Sözleşmeler:
 * - Bütçe kontrolü ÇAĞRIDAN ÖNCE: bütçe doluysa sağlayıcıya istek GİTMEZ.
 * - Ön-rezervasyon + FOR UPDATE: iki eşzamanlı istek son bütçeyi PAYLAŞAMAZ.
 * - Tavanlar: kullanıcı %50, günlük %25, istek-başı %5, premium alt-bütçe %20.
 * - Erişim: SA/ST koltuk sahibi + Silver+ (etiket-only, ONAYLAYICI, Bronz → 403).
 * - Maliyet: girdi/çıktı/cache AYRI fiyatlanır, doğru MODELİN fiyatıyla.
 * - Bakiye TÜRETİLİR (SUM) — stored bakiye yok; FAILED(0) etkisiz, timeout tahmini korur.
 * - Kullanıcı model SEÇEMEZ; yükseltme kod kararıdır (eşik/feature/retry).
 */
import "reflect-metadata";
import { CompanyRole, Prisma } from "@rothern/db";
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
  over: { tier?: string; isOwner?: boolean } = {},
) {
  return {
    userId: u.id,
    companyId,
    email: u.email,
    roles,
    isOwner: over.isOwner ?? false,
    country: "TR",
    tier: over.tier ?? "GOLD",
    companyVerificationStatus: "VERIFIED",
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
    ).rejects.toThrow(/Satın Almacı veya Satışçı/);

    // Etiket-only Kurucu (Faz R: SAHIP op-izin vermez) → AI yok.
    const owner = await makeUser(prisma, co.company.id, [CompanyRole.SAHIP]);
    await expect(
      ai.callAi(
        authFor(owner, co.company.id, [CompanyRole.SAHIP], { isOwner: true }),
        CALL,
      ),
    ).rejects.toThrow(/Satın Almacı veya Satışçı/);

    expect(provider.calls).toHaveLength(0);
  });

  it("BRONZ/STANDART 403 (Silver+ şartı)", async () => {
    const provider = new FakeProvider();
    const ai = makeAi(makeCfg(), provider);
    const co = await makeCompanyWithUser(prisma, { tier: "BRONZ" });
    for (const tier of ["BRONZ", "STANDART"]) {
      await expect(
        ai.callAi(
          authFor(co.user, co.company.id, co.auth.roles as CompanyRole[], { tier, isOwner: true }),
          CALL,
        ),
      ).rejects.toThrow(/Silver/);
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
