import { entitlementForbidden } from "../../common/company/entitlement-required";
import { i18nMessage } from "../../common/i18n/http-i18n";
import {
  BadGatewayException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ALL_SEAT_PERMISSIONS, tierAtLeast, type TierName } from "@rothern/shared";
import { hasCompanyPermission } from "../company-auth/permissions/company-permissions.constants";
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

/**
 * The AI call ran out of time (`callAi`). Still a 503 with the same message; a
 * class of its own so that a caller can tell "timed out - trying again helps"
 * from the other 503s (round 5 review, R5-03: an incomplete supplier search
 * reports WHY a pass failed).
 */
export class AiTimeoutException extends ServiceUnavailableException {}

export interface AiCallOptions {
  feature: string;
  prompt: string;
  system?: string;
  /** Erişim: özelliğin istediği izinler (any-of). Boş → herhangi bir işlem izni. */
  anyOf?: readonly string[];
  /** Bu özelliğin ALT paket sınırı — varsayılan SILVER (bkz. assertAiAccess). */
  minTier?: TierName;
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
  /**
   * Per-call timeout (ms) instead of the global `AI_TIMEOUT_MS` (round 5, D1).
   * Only for a call that is known to need longer: the grounded supplier
   * research takes 45-75 s and the 60 s default cut 15 % of them. An
   * interactive caller keeps the whole HTTP request below the proxy limit
   * (Cloudflare 100 s) itself. Keep it well below the reservation reaper
   * (10 min, `ai.scheduler.ts`).
   */
  timeoutMs?: number;
  /**
   * Absolute end of the call (epoch ms), the provider's own retries included:
   * without it every retry of a transient provider error gets the full
   * `timeoutMs` again. A caller with a wall-clock budget passes it.
   */
  deadlineAt?: number;
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

  /**
   * Erişim kapısı — AI-1 özellik servisleri de BURADAN geçer (tek kapı).
   * `anyOf`: özelliğin istediği izinler (herhangi biri yeter). Varsayılan:
   * herhangi bir İŞLEM izni (koltuk) — yetki tablosu 2026-09-05; etiket-only
   * Kurucu/Yönetici, Onaylayıcı ve salt görüntüleyici → 403. Ürün çıkarımı
   * `sell:product:manage`, profil tanıtımı önerisi `company:manage` geçirir.
   */
  /**
   * `minTier` — VARSAYILAN "SILVER" ve öyle KALMALI; AI özellikleri paketli
   * özelliktir. Tek istisna profil tanıtımı önerisi: tam erişimi olmayan
   * firmanın tanıtım metni de PLATFORMUN işine yarıyor (indekslenebilir sayfa =
   * organik büyüme), o yüzden orada "STANDART" geçiliyor ve öneri sayısı firma
   * başına ayrıca sınırlanıyor. Yeni bir özelliğe bu parametreyi vermeden önce
   * "bedelini kim ödüyor, karşılığında ne kazanıyoruz" sorusunu yanıtla.
   */
  assertAiAccess(
    user: AuthenticatedCompanyUser,
    anyOf: readonly string[] = ALL_SEAT_PERMISSIONS,
    minTier: TierName = "SILVER",
  ): void {
    if (!this.config.enabled || !this.provider) {
      // Fail-closed ama SESSİZ DEĞİL: anahtar yoksa özellik kapalı, net 503.
      throw new ServiceUnavailableException(
        i18nMessage("api.ai.aiOzelligiSuAndaKullanilamiyorYapilandirilmamis"),
      );
    }
    if (!tierAtLeast(user.tier, minTier)) {
      throw entitlementForbidden(user.companyVerificationStatus, {
        key: "api.ai.aiOzellikleriIcinDogrulama",
      });
    }
    if (!hasCompanyPermission(user, anyOf)) {
      throw new ForbiddenException(
        i18nMessage("api.ai.aiOzellikleriniYalnizcaBuAlandaIslem"),
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
    this.assertAiAccess(user, options.anyOf, options.minTier);
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
        timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
        deadlineAt: options.deadlineAt,
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
        throw new AiTimeoutException(
          i18nMessage("api.ai.aiIstegiZamanAsiminaUgradiLutfen"),
        );
      }
      if (err instanceof AiProviderError) {
        // usage raporlandıysa gerçek (kısmi) maliyet; yoksa üretim başlamadan
        // hata → costUsd=0 (harcanmamış token bütçeden düşülmez).
        await this.budget.fail(reservation.id, {
          errorCode: err.code,
          usage: err.usage,
          // Temizlenmiş sebep (ör. `http_400:FAILED_PRECONDITION`) kullanım
          // kaydının metadata'sına yazılır — 502'ler günlüksüz teşhis edilsin.
          reason: err.reason,
        });
        this.logger.warn(
          `AI sağlayıcı hatası (${err.code}${err.reason ? `, ${err.reason}` : ""}): ${err.message}`,
        );
        throw new BadGatewayException(
          i18nMessage("api.ai.saglayiciHataDondurdu"),
        );
      }
      // Beklenmeyen iç hata: rezervasyonu serbest bırakma (fail-closed) —
      // reaper 10 dk sonra timeout kuralıyla kapatır.
      throw err;
    }
  }

  /** AI yapılandırılmış mı (anahtar + sağlayıcı)? Sistem işleri önce buna bakar. */
  get isEnabled(): boolean {
    return this.config.enabled && !!this.provider;
  }

  /**
   * PLATFORMUN ÖDEDİĞİ çağrı (2026-09-27, AI tedarikçi keşfi Faz 1) — kullanıcı
   * yok, firma bütçesine YAZILMAZ. Yalnız platformun kendi edinme kanalı olan
   * işler (yayın sonrası otomatik tedarikçi araması) kullanır; maliyet çağırana
   * döner ve çağıran KENDİ tavanını uygular (bkz. discovery-runs, günlük USD
   * tavanı). İçerik çevirisiyle aynı ilke: platform işi, platform bütçesi.
   * Kullanıcının tetiklediği her şey `callAi` (bütçe + erişim kapısı) kalır.
   */
  async callAiSystem(
    options: Pick<
      AiCallOptions,
      "prompt" | "system" | "responseSchema" | "webSearch" | "thinkingLevel" | "timeoutMs" | "deadlineAt"
    >,
  ): Promise<AiCallResult & { costUsd: number }> {
    if (!this.isEnabled) {
      throw new ServiceUnavailableException(
        i18nMessage("api.ai.aiOzelligiSuAndaKullanilamiyorYapilandirilmamis"),
      );
    }
    const model = this.config.models.default;
    const result = await this.provider!.complete({
      model,
      prompt: options.prompt,
      system: options.system,
      responseSchema: options.responseSchema,
      webSearch: options.webSearch,
      thinkingLevel: options.thinkingLevel,
      maxOutputTokens: this.config.maxOutputTokens,
      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
      deadlineAt: options.deadlineAt,
    });
    const cost = costFromUsage(result.usage, this.config.pricing[model]!, {
      grounded: options.webSearch === true,
    });
    return {
      finishReason: result.finishReason,
      outputTokens: result.usage.outputTokens,
      text: result.text,
      downgraded: false,
      warned: false,
      costUsd: Number(cost),
    };
  }

  /**
   * Kullanım ekranı (yalnız YÜZDE — dolar UI'a sızmaz):
   * - Kurucu/Yönetici: firma toplamı + kim/hangi özellik kırılımı.
   * - SA/ST (yönetim değil): yalnız KENDİ kullanımı (kendi tavanına oranla);
   *   firma toplamı yanıtta YOK.
   * - Diğerleri (ONAYLAYICI vb.): 403.
   */
  async usageView(user: AuthenticatedCompanyUser) {
    const isManagement = hasCompanyPermission(user, [
      "users:manage",
      "company:manage",
    ]);
    const hasSeat = hasCompanyPermission(user, ALL_SEAT_PERMISSIONS);
    if (!isManagement && !hasSeat) {
      throw new ForbiddenException(
        i18nMessage("api.ai.aiKullaniminiYalnizcaYonetimYaDa"),
      );
    }

    const enabled = this.config.enabled;
    const snapshot = await this.budget.usageSnapshot(user.companyId, user.userId);
    if (snapshot == null) {
      throw entitlementForbidden(user.companyVerificationStatus, {
        key: "api.ai.aiOzellikleriIcinDogrulama",
      });
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
        exhausted: snapshot.poolExhausted,
        // `reserve` kişisel tavanı (havuzun userShare'i) yönetime de uygular:
        // havuz dolmasa da bu kullanıcının AI'ı kapalı olabilir (D-172).
        myExhausted: snapshot.userCapExhausted,
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
      // Kişisel tavan ya da firma havuzu doldu → bu kullanıcı için AI kapalı.
      exhausted: snapshot.userCapExhausted || snapshot.poolExhausted,
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
        // Metin ANAHTAR olarak geçer; her alıcı için kendi diliyle üretilir.
        await this.notifications.pushToUser(m.id, {
          type: WARN_NOTIFICATION_TYPE,
          titleKey: "api.notifications.ai.butceUyarisiBaslik",
          bodyKey: "api.notifications.ai.butceUyarisiGovde",
          params: { yuzde: Math.round(percentUsed) },
          ctaPath: "/company/ayarlar/ai-kullanim",
          ctaLabelKey: "api.notifications.ai.kullanimiGor",
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
