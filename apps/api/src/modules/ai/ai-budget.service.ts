import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@rothern/db";
import { effectiveTier } from "../../common/company/effective-tier";
import { PrismaService } from "../../common/prisma/prisma.service";
import { runTenantTx } from "../../common/prisma/tenant-tx";
import { AI_CONFIG, type AiConfig, type AiModelPricing } from "./ai.config";
import type { AiTokenUsage } from "./providers/ai-provider.interface";

/**
 * Faz AI-0 — bütçe motoru. PARA (USD) sayar, token değil.
 *
 * ÖN-REZERVASYON MODELİ (sadece ön-kontrol DEĞİL):
 * 1. reserve(): kısa tx — company satırı FOR UPDATE (Faz K lockedAdminTx deseni)
 *    → türetilmiş SUM'lar + tavan kontrolleri → RESERVED satır (costUsd=tahmin).
 *    İki eşzamanlı istek serileşir; ikincinin SUM'u ilkinin rezervasyonunu görür
 *    → son bütçe PAYLAŞILAMAZ.
 * 2. Sağlayıcı çağrısı kilitsiz (uzun HTTP çağrısı kilit altında tutulmaz).
 * 3. settle(): gerçek usage ile costUsd güncellenir (SETTLED).
 *
 * Bakiye HER ZAMAN türetilir: SUM(costUsd) — stored bakiye yok (X7-drift).
 * FAILED satırlar da toplanır: released hata costUsd=0 (etkisiz), timeout
 * tahmini KORUR (fail-closed — kısmi token harcanmış olabilir).
 *
 * PENCERE: takvim ayı (UTC). Abonelik-dönemi anchor'ı bugün yok (iyzico = Faz P);
 * Faz P gelince yalnız monthStart() değişir.
 */

export class AiBudgetExceededException extends ForbiddenException {}

export interface ReserveCandidate {
  model: string;
  estimatedCostUsd: Prisma.Decimal;
  isPremium: boolean;
}

export interface ReserveResult {
  id: string;
  model: string;
  /** Premium istendi ama alt-bütçe doluydu → ucuz modele düşüldü. */
  downgraded: boolean;
}

type BudgetDenial = "request_cap" | "pool" | "user_cap" | "daily_cap" | "premium_cap";

const DENIAL_MESSAGES: Record<Exclude<BudgetDenial, "premium_cap">, string> = {
  request_cap:
    "Bu istek tek başına izin verilen AI kullanım sınırını aşıyor — belgeyi bölerek deneyin.",
  pool: "Firmanızın aylık AI bütçesi doldu — AI özellikleri gelecek ay yeniden açılır.",
  user_cap:
    "Kişisel AI kullanım tavanınıza ulaştınız (firma havuzunun %50'si) — firma yöneticinize başvurun.",
  daily_cap: "Günlük AI kullanım tavanına ulaşıldı — yarın tekrar deneyin.",
};

export function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function dayStartUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

const MTOK = new Prisma.Decimal(1_000_000);

/** Usage × fiyat → USD (girdi/çıktı/cache AYRI; cache-read indirimli). */
export function costFromUsage(
  usage: AiTokenUsage,
  pricing: AiModelPricing,
): Prisma.Decimal {
  return new Prisma.Decimal(usage.inputTokens)
    .mul(pricing.inputPerMTok)
    .add(new Prisma.Decimal(usage.outputTokens).mul(pricing.outputPerMTok))
    .add(new Prisma.Decimal(usage.cacheReadTokens).mul(pricing.cacheReadPerMTok))
    // Cache yazımı: ayrı fiyat tanımı yok → girdi fiyatından (Gemini'de 0 token).
    .add(new Prisma.Decimal(usage.cacheWriteTokens).mul(pricing.inputPerMTok))
    .div(MTOK)
    .toDecimalPlaces(6);
}

@Injectable()
export class AiBudgetService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_CONFIG) private readonly config: AiConfig,
  ) {}

  /** Firmanın aylık havuzu (USD). Paketi AI içermiyorsa null. */
  async poolFor(
    companyId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<number | null> {
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { tier: true, membershipEndAt: true },
    });
    if (!company) throw new NotFoundException("Firma bulunamadı");
    const pool =
      this.config.monthlyBudgetUsd[
        effectiveTier(company.tier, company.membershipEndAt)
      ];
    return pool != null && pool > 0 ? pool : null;
  }

  private async sumCost(
    db: Prisma.TransactionClient | PrismaService,
    where: Prisma.AiUsageWhereInput,
  ): Promise<Prisma.Decimal> {
    const agg = await db.aiUsage.aggregate({
      _sum: { costUsd: true },
      where,
    });
    return agg._sum.costUsd ?? new Prisma.Decimal(0);
  }

  /**
   * Adayları SIRAYLA dener (premium → fallback). Premium yalnız alt-bütçe
   * yüzünden düşerse fallback'e geçilir (downgraded=true); genel tavanlar
   * (havuz/kullanıcı/gün/istek) düşürürse fırlatır — model değiştirmek onları
   * çözmez (fallback tahmini daha ucuz olduğundan istek-başı tavanda yine de
   * denenir).
   */
  async reserve(args: {
    companyId: string;
    userId: string;
    userEmail?: string | null;
    feature: string;
    /** Özellik bağlamı (route/sayfa sayısı) — ölçüm; PII/belge içeriği YAZILMAZ. */
    metadata?: Record<string, unknown>;
    candidates: ReserveCandidate[];
  }): Promise<ReserveResult> {
    const { caps } = this.config;
    const premiumModel = this.config.models.premium;
    const now = new Date();

    return runTenantTx(this.prisma, async (tx) => {
      // Faz K deseni: firma satırı FOR UPDATE — bütçe kontrol+rezervasyon
      // penceresi firma bazında serileşir (TOCTOU kapalı).
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${args.companyId} FOR UPDATE`;

      const pool = await this.poolFor(args.companyId, tx);
      if (pool == null) {
        throw new ForbiddenException(
          "Paketiniz AI özelliklerini içermiyor — Silver veya üzeri paket gerekir.",
        );
      }
      const poolD = new Prisma.Decimal(pool);
      const scopeMonth = { companyId: args.companyId, createdAt: { gte: monthStartUtc(now) } };
      const [monthSpend, userSpend, daySpend, premiumSpend] = await Promise.all([
        this.sumCost(tx, scopeMonth),
        this.sumCost(tx, { ...scopeMonth, userId: args.userId }),
        this.sumCost(tx, {
          companyId: args.companyId,
          createdAt: { gte: dayStartUtc(now) },
        }),
        this.sumCost(tx, { ...scopeMonth, model: premiumModel }),
      ]);

      let firstDenial: BudgetDenial | null = null;
      for (let i = 0; i < args.candidates.length; i++) {
        const cand = args.candidates[i]!;
        const est = cand.estimatedCostUsd;
        const denial: BudgetDenial | null =
          est.gt(poolD.mul(caps.requestShare))
            ? "request_cap"
            : monthSpend.add(est).gt(poolD)
              ? "pool"
              : userSpend.add(est).gt(poolD.mul(caps.userShare))
                ? "user_cap"
                : daySpend.add(est).gt(poolD.mul(caps.dailyShare))
                  ? "daily_cap"
                  : cand.isPremium &&
                      premiumSpend.add(est).gt(poolD.mul(caps.premiumShare))
                    ? "premium_cap"
                    : null;
        if (denial == null) {
          const row = await tx.aiUsage.create({
            data: {
              companyId: args.companyId,
              userId: args.userId,
              userEmail: args.userEmail ?? null,
              feature: args.feature,
              model: cand.model,
              status: "RESERVED",
              costUsd: est,
              metadata:
                (args.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
            },
            select: { id: true },
          });
          return { id: row.id, model: cand.model, downgraded: i > 0 };
        }
        firstDenial ??= denial;
      }

      // Tüm adaylar düştü. premium_cap tek başına buraya gelmez (fallback
      // denendi) — mesaj son/genel sebepten üretilir.
      const reason = firstDenial === "premium_cap" ? "pool" : (firstDenial ?? "pool");
      throw new AiBudgetExceededException(
        DENIAL_MESSAGES[reason as Exclude<BudgetDenial, "premium_cap">],
      );
    });
  }

  /** Gerçek usage ile kapat. Dönen warned: havuz doluluk uyarı eşiğini aştı. */
  async settle(
    id: string,
    usage: AiTokenUsage,
  ): Promise<{ costUsd: Prisma.Decimal; warned: boolean; percentUsed: number }> {
    const row = await this.prisma.aiUsage.findUnique({
      where: { id },
      select: { model: true, companyId: true },
    });
    if (!row) throw new NotFoundException("AI kullanım kaydı bulunamadı");
    const pricing = this.config.pricing[row.model];
    if (!pricing) {
      // loadAiConfig boot'ta doğrular — buraya düşmek config regresyonudur.
      throw new Error(`"${row.model}" için fiyat tanımı yok`);
    }
    const costUsd = costFromUsage(usage, pricing);
    await this.prisma.aiUsage.update({
      where: { id },
      data: {
        status: "SETTLED",
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        costUsd,
        settledAt: new Date(),
      },
    });

    const pool = await this.poolFor(row.companyId);
    if (pool == null) return { costUsd, warned: false, percentUsed: 0 };
    const monthSpend = await this.sumCost(this.prisma, {
      companyId: row.companyId,
      createdAt: { gte: monthStartUtc() },
    });
    const percentUsed = pctOf(monthSpend, pool);
    return {
      costUsd,
      warned: monthSpend.gte(
        new Prisma.Decimal(pool).mul(this.config.caps.warnShare),
      ),
      percentUsed,
    };
  }

  /**
   * Hata kapanışı:
   * - usage verildiyse → sağlayıcı kısmi tüketim raporladı: GERÇEK maliyet düşülür.
   * - keepEstimate → timeout: tahmin KALIR (fail-closed, kısmi harcama olabilir).
   * - aksi → üretim başlamadan hata: costUsd=0 (token harcanmadı, düşmek haksız).
   */
  async fail(
    id: string,
    opts: { errorCode: string; keepEstimate?: boolean; usage?: AiTokenUsage },
  ): Promise<void> {
    let costData: { costUsd?: Prisma.Decimal } = {};
    if (opts.usage) {
      const row = await this.prisma.aiUsage.findUnique({
        where: { id },
        select: { model: true },
      });
      const pricing = row ? this.config.pricing[row.model] : undefined;
      if (pricing) costData = { costUsd: costFromUsage(opts.usage, pricing) };
    } else if (!opts.keepEstimate) {
      costData = { costUsd: new Prisma.Decimal(0) };
    }
    await this.prisma.aiUsage.update({
      where: { id },
      data: {
        status: "FAILED",
        errorCode: opts.errorCode,
        settledAt: new Date(),
        ...costData,
      },
    });
  }

  /** Ay içi harcama özetleri — kullanım ekranı (yüzde; dolar UI'a sızmaz). */
  async usageSnapshot(companyId: string, userId: string) {
    const pool = await this.poolFor(companyId);
    if (pool == null) return null;
    const scopeMonth = { companyId, createdAt: { gte: monthStartUtc() } };
    const [monthSpend, userSpend, premiumSpend, byUser, byFeature] =
      await Promise.all([
        this.sumCost(this.prisma, scopeMonth),
        this.sumCost(this.prisma, { ...scopeMonth, userId }),
        this.sumCost(this.prisma, {
          ...scopeMonth,
          model: this.config.models.premium,
        }),
        this.prisma.aiUsage.groupBy({
          by: ["userId", "userEmail"],
          where: scopeMonth,
          _sum: { costUsd: true },
          _count: { _all: true },
        }),
        this.prisma.aiUsage.groupBy({
          by: ["feature"],
          where: scopeMonth,
          _sum: { costUsd: true },
          _count: { _all: true },
        }),
      ]);
    const { caps } = this.config;
    return {
      pool,
      percentUsed: pctOf(monthSpend, pool),
      premiumPercentUsed: pctOf(premiumSpend, pool * caps.premiumShare),
      myPercentOfCap: pctOf(userSpend, pool * caps.userShare),
      warned: monthSpend.gte(new Prisma.Decimal(pool).mul(caps.warnShare)),
      byUser: byUser.map((r) => ({
        userId: r.userId,
        userEmail: r.userEmail,
        requests: r._count._all,
        percentOfPool: pctOf(r._sum.costUsd ?? new Prisma.Decimal(0), pool),
      })),
      byFeature: byFeature.map((r) => ({
        feature: r.feature,
        requests: r._count._all,
        percentOfPool: pctOf(r._sum.costUsd ?? new Prisma.Decimal(0), pool),
      })),
    };
  }
}

/** spend/limit → yüzde (1 ondalık, 0-999 aralığına kırpılmış). */
function pctOf(spend: Prisma.Decimal, limitUsd: number): number {
  if (limitUsd <= 0) return 0;
  const pct = spend.div(limitUsd).mul(100).toDecimalPlaces(1).toNumber();
  return Math.min(999, Math.max(0, pct));
}
