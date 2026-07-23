import type { ConfigService } from "@nestjs/config";
import type { TierName } from "@rothern/shared";

/**
 * Faz AI-0 — AI altyapı config'i (model/sağlayıcı/fiyat/bütçe TEK KAYNAK).
 *
 * TASARIM KARARLARI:
 * - Bütçe TOKEN değil PARA (USD) cinsindendir: aynı token modele göre ~20 kat
 *   farklı maliyet üretir; token kotası maliyet garantisi vermez.
 * - Fiyat tablosu DB'de değil burada — her AiUsage satırı yazım anında costUsd
 *   SNAPSHOT'ı taşıdığından fiyat güncellemesi geçmişi bozmaz (FX-damga deseni).
 * - Model kimlikleri env'den override edilebilir (fiyatlar hızla değişiyor;
 *   yeni model = env + buradaki fiyat satırı, kod değişikliği değil).
 * - Kullanıcı model SEÇEMEZ; premium'a yükseltme kuralları KOD kararıdır
 *   (upgrade.* eşikleri), AI kararı değil.
 */

export interface AiModelPricing {
  /** USD / 1M token — cache'siz girdi */
  inputPerMTok: number;
  /** USD / 1M token — çıktı (thinking/reasoning token'ları dahil) */
  outputPerMTok: number;
  /** USD / 1M token — cache'ten okunan girdi (~0.1×, AYRI sayılır) */
  cacheReadPerMTok: number;
}

export interface AiConfig {
  /** Anahtar yoksa false — endpoint'ler 503 (fail-closed, sessiz no-op değil). */
  enabled: boolean;
  provider: string;
  apiKey: string | null;
  models: {
    /** Ucuz varsayılan — metin (Flash sınıfı) */
    default: string;
    /** Vision varyantı (AI-1: fotoğraf/taranmış belge) — ayrı tanımlanabilir */
    vision: string;
    /** Pahalı model — yalnız SİSTEM seçer, ayrı alt-bütçe (%20) */
    premium: string;
  };
  /** model → fiyat. models.* içinde fiyatı olmayan model = config hatası. */
  pricing: Record<string, AiModelPricing>;
  /** Aylık firma havuzu (USD, takvim ayı UTC). Listede olmayan tier = AI yok. */
  monthlyBudgetUsd: Partial<Record<TierName, number>>;
  caps: {
    /** Tek kullanıcı havuzun en fazla bu payını tüketebilir. */
    userShare: number;
    /** Günlük tavan: aylık bütçenin payı (patlamalı kullanım + kaçak emniyeti). */
    dailyShare: number;
    /** İstek başı tavan (tek dev belge bütçeyi yakmasın). */
    requestShare: number;
    /** Premium alt-bütçesi: havuzun payı. */
    premiumShare: number;
    /** Uyarı eşiği (havuz doluluk oranı). */
    warnShare: number;
  };
  upgrade: {
    /** Bu tahmini girdi token sayısını aşan belge → premium (kural 1). */
    inputTokenThreshold: number;
    /** Baştan premium işaretli özellik anahtarları (kural 4). */
    premiumFeatures: string[];
  };
  /** Tek istekte üretilebilecek azami çıktı token'ı (tahmin de bunu kullanır). */
  maxOutputTokens: number;
  timeoutMs: number;
}

/** Varsayılan fiyat tablosu (USD / 1M token). Cache-read ~0.1× girdi. */
const DEFAULT_PRICING: Record<string, AiModelPricing> = {
  "gemini-2.5-flash": {
    inputPerMTok: 0.3,
    outputPerMTok: 2.5,
    cacheReadPerMTok: 0.03,
  },
  "gemini-3.1-pro": {
    inputPerMTok: 2,
    outputPerMTok: 12,
    cacheReadPerMTok: 0.2,
  },
};

/** Env erişimini soyutlar — ConfigService veya düz kayıt (testler) alır. */
export type AiEnvSource =
  | Pick<ConfigService, "get">
  | { get(key: string): string | undefined };

export function loadAiConfig(env: AiEnvSource): AiConfig {
  const g = (key: string): string | undefined => {
    const v = (env as { get(k: string): unknown }).get(key);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  };

  const apiKey = g("GEMINI_API_KEY") ?? null;
  const models = {
    default: g("AI_MODEL_DEFAULT") ?? "gemini-2.5-flash",
    vision: g("AI_MODEL_VISION") ?? "gemini-2.5-flash",
    premium: g("AI_MODEL_PREMIUM") ?? "gemini-3.1-pro",
  };

  const cfg: AiConfig = {
    enabled: apiKey != null,
    provider: g("AI_PROVIDER") ?? "gemini",
    apiKey,
    models,
    pricing: DEFAULT_PRICING,
    monthlyBudgetUsd: { SILVER: 6, GOLD: 25 },
    caps: {
      userShare: 0.5,
      dailyShare: 0.25,
      requestShare: 0.05,
      premiumShare: 0.2,
      warnShare: 0.8,
    },
    upgrade: {
      inputTokenThreshold: Number(g("AI_PREMIUM_INPUT_TOKEN_THRESHOLD") ?? 50_000),
      premiumFeatures: (g("AI_PREMIUM_FEATURES") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
    maxOutputTokens: Number(g("AI_MAX_OUTPUT_TOKENS") ?? 8192),
    timeoutMs: Number(g("AI_TIMEOUT_MS") ?? 60_000),
  };

  // Fail-closed: seçili modellerin fiyatı yoksa maliyet hesaplanamaz →
  // bütçe garantisi verilemez. Sessizce 0 maliyet saymak yerine boot'ta patla.
  for (const m of Object.values(cfg.models)) {
    if (!cfg.pricing[m]) {
      throw new Error(
        `AI config hatası: "${m}" modeli için fiyat tanımı yok (ai.config.ts DEFAULT_PRICING). ` +
          "Fiyatsız model bütçe sayacını anlamsızlaştırır — fiyat satırı ekleyin.",
      );
    }
  }

  return cfg;
}

/** DI token'ları */
export const AI_CONFIG = "AI_CONFIG";
export const AI_PROVIDER_TOKEN = "AI_PROVIDER_TOKEN";
