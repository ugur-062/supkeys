import {
  BadGatewayException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { SEAT_ROLES, tierAtLeast } from "@rothern/shared";
import { hasManagementRole } from "../company-auth/permissions/company-permissions.constants";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationService } from "../notifications/notification.service";
import { AI_CONFIG, AI_PROVIDER_TOKEN, type AiConfig } from "./ai.config";
import { AiBudgetService, costFromUsage } from "./ai-budget.service";
import {
  AiProviderError,
  AiProviderTimeoutError,
  BaseAiProvider,
  type AiInlinePart,
} from "./providers/ai-provider.interface";

/**
 * Faz AI-0 — AI orkestratörü: erişim kapısı → model seçimi (KOD kararı) →
 * rezervasyon → sağlayıcı → kapanış. Kullanıcıya YÜZDE gösterilir, dolar ve
 * model adı gösterilmez (model seçimi/bilgisi kullanıcıya AÇIK DEĞİL).
 *
 * ERİŞİM (üçüncü tanım YOK — mevcut tek-kaynaklar):
 * - tier: tierAtLeast(user.tier, "SILVER") (CompanyPaidTierGuard ile aynı)
 * - rol: SEAT_ROLES (shared) — SA/ST koltuk sahipleri. Etiket-only SAHIP/
 *   YONETICI, ONAYLAYICI → 403 (Faz R salt-okunur modeliyle tutarlı).
 */

export interface AiCallOptions {
  feature: string;
  prompt: string;
  system?: string;
  /** AI-1: fotoğraf/taranmış belge → vision model varyantı. */
  vision?: boolean;
  /**
   * Yükseltme kuralı 2+3 (çağıran özellik sinyali): Flash düşük güvenle döndü
   * veya kullanıcı "tekrar dene" dedi → bu deneme premium adayıyla başlar.
   */
  premiumRetry?: boolean;
  /** AI-1 — vision part'ları (küçültülmüş görüntü / doğrudan PDF), tek çağrıda. */
  parts?: AiInlinePart[];
  /** AI-1 — structured output şeması (Gemini responseSchema). */
  responseSchema?: object;
  /** Dış keşif — Google Search grounding (responseSchema ile birlikte verme). */
  webSearch?: boolean;
  /**
   * AI-1 — metin-dışı girdinin token tahmini (PDF ~300/sayfa, görüntü ~1300).
   * Bütçe rezervasyonu ve premium eşiği doğru çalışsın diye tahmine eklenir.
   */
  extraInputTokenEstimate?: number;
  /** AiUsage.metadata'ya yazılacak özellik bağlamı (route, sayfa sayısı vb.). */
  metadata?: Record<string, unknown>;
  /**
   * Thinking seviyesi tavanı (Gemini `thinkingLevel`). Belge çıkarımı gibi
   * şema-kısıtlı işler "low" kullanır: varsayılan dinamik thinking hem
   * gecikmeyi 2-3× artırıyor hem ara sıra BOŞ/parse-edilemez JSON üretip
   * premium retry'ı tetikliyordu (2026-08-22 ölçümü: 7 sn → 25 sn). Asistan
   * zaten "low" (boş-yanıt fix'i, 2026-07-28). Verilmezse sağlayıcı varsayılanı.
   */
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
}

export interface AiCallResult {
  text: string;
  /** Premium istendi ama alt-bütçe doluydu → ucuz modelle devam edildi. */
  downgraded: boolean;
  /** Firma havuzu uyarı eşiğini (%80) aştı. */
  warned: boolean;
  /** Sağlayıcı bitiş nedeni (teşhis; STOP/MAX_TOKENS/…) — hata değildir. */
  finishReason?: string;
  /** Çıktı token'ı (thinking dahil) — boş-yanıt teşhisi için. */
  outputTokens?: number;
}

const WARN_NOTIFICATION_TYPE = "ai_budget_warn";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(AI_CONFIG) private readonly config: AiConfig,
    @Inject(AI_PROVIDER_TOKEN) private readonly provider: BaseAiProvider | null,
    private readonly budget: AiBudgetService,
    private readonly prisma: PrismaService,
    // Testler servisi elle new'ler — bildirim opsiyonel (company-users deseni).
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  /** Erişim kapısı — AI-1 özellik servisleri de BURADAN geçer (tek kapı). */
  assertAiAccess(user: AuthenticatedCompanyUser): void {
    if (!this.config.enabled || !this.provider) {
      // Fail-closed ama SESSİZ DEĞİL: anahtar yoksa özellik kapalı, net 503.
      throw new ServiceUnavailableException(
        "AI özelliği şu anda kullanılamıyor (yapılandırılmamış).",
      );
    }
    if (!tierAtLeast(user.tier, "SILVER")) {
      throw new ForbiddenException(
        "AI özellikleri Silver veya üzeri paket gerektirir.",
      );
    }
    if (!user.roles.some((r) => (SEAT_ROLES as readonly string[]).includes(r))) {
      throw new ForbiddenException(
        "AI özelliklerini yalnızca Satın Almacı veya Satışçı rolü taşıyan kullanıcılar kullanabilir.",
      );
    }
  }

  /**
   * Tek AI çağrısı — bütçe kontrolü ÇAĞRIDAN ÖNCE (rezervasyon; bütçe yoksa
   * sağlayıcıya istek GİTMEZ), düşüm çağrıdan SONRA (gerçek usage ile).
   */
  async callAi(
    user: AuthenticatedCompanyUser,
    options: AiCallOptions,
  ): Promise<AiCallResult> {
    this.assertAiAccess(user);
    const provider = this.provider!;
    const { models, upgrade } = this.config;

    // Tahmin (fail-closed): girdi ~4 karakter/token + metin-dışı part tahmini
    // (AI-1); çıktı maxOutputTokens tavanından — gerçek maliyet tahmini aşamaz,
    // bütçe taşması yapısal olarak kapalı kalır.
    const estInputTokens =
      Math.ceil((options.prompt.length + (options.system?.length ?? 0)) / 4) +
      (options.extraInputTokenEstimate ?? 0);

    // YÜKSELTME KURALLARI — kod kararı, AI değil (config eşikleri):
    // 1) girdi eşiğini aşan belge  2+3) çağıran özelliğin premiumRetry sinyali
    // 4) baştan premium işaretli özellik. Kullanıcı model SEÇEMEZ.
    const baseModel = options.vision ? models.vision : models.default;
    const premiumWanted =
      estInputTokens > upgrade.inputTokenThreshold ||
      options.premiumRetry === true ||
      upgrade.premiumFeatures.includes(options.feature);

    const estimateFor = (model: string) =>
      costFromUsage(
        {
          inputTokens: estInputTokens,
          outputTokens: this.config.maxOutputTokens,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        this.config.pricing[model]!,
        // Rezervasyon da grounding ücretini içermeli; aksi halde tavanlar
        // gerçekte harcanacak paradan az rezerve eder (fail-open).
        { grounded: options.webSearch === true },
      );

    // Premium alt-bütçesi doluysa reserve() fallback'e (ucuz model) düşer —
    // premium'a yükseltme YAPILMAZ, Flash'la devam edilir.
    const candidates = premiumWanted
      ? [
          {
            model: models.premium,
            estimatedCostUsd: estimateFor(models.premium),
            isPremium: true,
          },
          {
            model: baseModel,
            estimatedCostUsd: estimateFor(baseModel),
            isPremium: false,
          },
        ]
      : [
          {
            model: baseModel,
            estimatedCostUsd: estimateFor(baseModel),
            isPremium: false,
          },
        ];

    const reservation = await this.budget.reserve({
      companyId: user.companyId,
      userId: user.userId,
      userEmail: user.email,
      feature: options.feature,
      metadata: options.metadata,
      candidates,
    });

    try {
      const result = await provider.complete({
        model: reservation.model,
        prompt: options.prompt,
        system: options.system,
        parts: options.parts,
        responseSchema: options.responseSchema,
        webSearch: options.webSearch,
        thinkingLevel: options.thinkingLevel,
        maxOutputTokens: this.config.maxOutputTokens,
        timeoutMs: this.config.timeoutMs,
      });
      // Grounding (Google Search) TOKEN DIŞI, istek başına ücretlidir —
      // maliyete dahil edilmezse bütçe gerçek faturayı ölçmez (denetim P6).
      const settled = await this.budget.settle(reservation.id, result.usage, {
        grounded: options.webSearch === true,
      });
      if (settled.warned) {
        void this.notifyBudgetWarning(user.companyId, settled.percentUsed);
      }
      return {
        finishReason: result.finishReason,
        outputTokens: result.usage.outputTokens,
        text: result.text,
        downgraded: reservation.downgraded,
        warned: settled.warned,
      };
    } catch (err) {
      if (err instanceof AiProviderTimeoutError) {
        // Kısmi token harcanmış olabilir → tahmin tutarı KALIR (fail-closed).
        await this.budget.fail(reservation.id, {
          errorCode: "timeout",
          keepEstimate: true,
        });
        throw new ServiceUnavailableException(
          "AI isteği zaman aşımına uğradı — lütfen tekrar deneyin.",
        );
      }
      if (err instanceof AiProviderError) {
        // usage raporlandıysa gerçek (kısmi) maliyet; yoksa üretim başlamadan
        // hata → costUsd=0 (harcanmamış token bütçeden düşülmez).
        await this.budget.fail(reservation.id, {
          errorCode: err.code,
          usage: err.usage,
        });
        this.logger.warn(`AI sağlayıcı hatası (${err.code}): ${err.message}`);
        throw new BadGatewayException(
          "AI sağlayıcısı hata döndürdü — lütfen tekrar deneyin.",
        );
      }
      // Beklenmeyen iç hata: rezervasyonu serbest bırakma (fail-closed) —
      // reaper 10 dk sonra timeout kuralıyla kapatır.
      throw err;
    }
  }

  /**
   * Kullanım ekranı (yalnız YÜZDE — dolar UI'a sızmaz):
   * - Kurucu/Yönetici: firma toplamı + kim/hangi özellik kırılımı.
   * - SA/ST (yönetim değil): yalnız KENDİ kullanımı (kendi tavanına oranla);
   *   firma toplamı yanıtta YOK.
   * - Diğerleri (ONAYLAYICI vb.): 403.
   */
  async usageView(user: AuthenticatedCompanyUser) {
    const isManagement = user.isOwner || hasManagementRole(user.roles);
    const hasSeat = user.roles.some((r) =>
      (SEAT_ROLES as readonly string[]).includes(r),
    );
    if (!isManagement && !hasSeat) {
      throw new ForbiddenException(
        "AI kullanımını yalnızca Kurucu/Yönetici veya işlem rolü taşıyan kullanıcılar görüntüleyebilir.",
      );
    }

    const enabled = this.config.enabled;
    const snapshot = await this.budget.usageSnapshot(user.companyId, user.userId);
    if (snapshot == null) {
      throw new ForbiddenException(
        "Paketiniz AI özelliklerini içermiyor — Silver veya üzeri paket gerekir.",
      );
    }
    const warnAtPercent = Math.round(this.config.caps.warnShare * 100);

    if (isManagement) {
      return {
        enabled,
        view: "company" as const,
        warnAtPercent,
        percentUsed: snapshot.percentUsed,
        premiumPercentUsed: snapshot.premiumPercentUsed,
        warning: snapshot.warned,
        byUser: snapshot.byUser,
        byFeature: snapshot.byFeature,
      };
    }
    return {
      enabled,
      view: "self" as const,
      warnAtPercent,
      percentUsed: snapshot.myPercentOfCap,
      warning: snapshot.myPercentOfCap >= warnAtPercent,
    };
  }

  /** %80 uyarısı — Kurucu/Yönetici'ye in-app, ay başına 1 kez (dedup). */
  private async notifyBudgetWarning(
    companyId: string,
    percentUsed: number,
  ): Promise<void> {
    if (!this.notifications) return;
    try {
      const monthStart = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      );
      const already = await this.prisma.notification.findFirst({
        where: {
          companyId,
          type: WARN_NOTIFICATION_TYPE,
          createdAt: { gte: monthStart },
        },
        select: { id: true },
      });
      if (already) return;
      const managers = await this.prisma.companyUser.findMany({
        where: {
          companyId,
          isActive: true,
          deletedAt: null,
          roles: { hasSome: ["SAHIP", "YONETICI"] },
        },
        select: { id: true },
      });
      for (const m of managers) {
        await this.notifications.pushToUser(m.id, {
          type: WARN_NOTIFICATION_TYPE,
          title: "AI bütçe uyarısı",
          body: `Firmanızın aylık AI kullanımı %${Math.round(percentUsed)} seviyesine ulaştı. Bütçe dolduğunda AI özellikleri ay sonuna kadar kapanır.`,
          ctaUrl: "/company/ayarlar/ai-kullanim",
          ctaLabel: "Kullanımı Gör",
        });
      }
    } catch (err) {
      // Uyarı best-effort — ana akışı bozmasın.
      this.logger.warn(
        `AI bütçe uyarısı yazılamadı (${companyId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
