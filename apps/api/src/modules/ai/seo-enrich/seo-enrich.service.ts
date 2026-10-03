import { i18nMessage } from "../../../common/i18n/http-i18n";
import { currentLocale } from "../../../common/i18n/locale-context";
import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { AiSeoEnrichInput, AiSeoEnrichResult } from "@rothern/shared";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { AiService, type AiCallResult } from "../ai.service";
import { clampSentences, isMostlyCjk, lowerCaseWords } from "../ai-text";
import { SEO_ENRICH_RESPONSE_SCHEMA, buildSeoEnrichPrompt, seoEnrichSystemPrompt } from "./seo-enrich.prompts";

export const SEO_ENRICH_MAX_DESCRIPTION = 5000;
export const SEO_ENRICH_MAX_FACTS = 40;
/** Vitrin etiketi tavanı (ShowcaseDto `keywords` @MaxLength(50)) — kayıtlı etiket kırpılmaz. */
const KEYWORD_MAX_LEN = 50;
/** Isteme giden mevcut etiket sayisi (eski DTO tavani). */
const KEYWORD_INPUT_MAX = 20;
/** DTO güvenlik tavanı (kırpma aşağıda): hızlı talep 500 kalem, kalem metni ~2300 kr. */
export const SEO_ENRICH_INPUT_MAX_ITEMS = 500;
export const SEO_ENRICH_INPUT_ITEM_MAX_LEN = 5000;
const DESC_MIN = 120;
const DESC_MAX = 900;
/** CJK yazıda karakter başına bilgi ~3 kat — sınırlar ÷3 (içerik çevirisindeki kural). */
const descMin = (s: string) => (isMostlyCjk(s) ? Math.round(DESC_MIN / 3) : DESC_MIN);
const descMax = (s: string) => (isMostlyCjk(s) ? Math.round(DESC_MAX / 3) : DESC_MAX);
const KEYWORD_MAX = 10;

/**
 * AI ile açıklama güçlendirme — TASLAK üretir, YAZMAZ (SEO Parça 8).
 * Erişim Silver+ (controller `CompanyPaidTierGuard`) + koltuk izni
 * (`assertAiAccess`); bütçe/tavan `callAi` kapısından.
 */
@Injectable()
export class SeoEnrichService {
  constructor(private readonly ai: AiService) {}

  async enrich(user: AuthenticatedCompanyUser, input: AiSeoEnrichInput): Promise<AiSeoEnrichResult> {
    this.ai.assertAiAccess(user);
    const name = (input.name ?? "").replace(/\s+/g, " ").trim();
    if (name.length < 2) throw new BadRequestException(i18nMessage("api.ai.onceBirAdBaslikYazin"));
    const clean: AiSeoEnrichInput = {
      kind: input.kind,
      name: name.slice(0, 200),
      description: (input.description ?? "").slice(0, SEO_ENRICH_MAX_DESCRIPTION) || null,
      categoryName: input.categoryName?.slice(0, 200) ?? null,
      facts: (input.facts ?? []).map((f) => f.replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean).slice(0, SEO_ENRICH_MAX_FACTS),
      keywords: normalizeKeywords(input.keywords ?? []).slice(0, KEYWORD_INPUT_MAX),
      brand: input.brand?.slice(0, 100) ?? null,
      city: input.city?.slice(0, 100) ?? null,
      industry: input.industry?.slice(0, 100) ?? null,
    };

    const callOptions = {
      feature: "seo_enrich",
      prompt: buildSeoEnrichPrompt(clean),
      system: seoEnrichSystemPrompt(currentLocale()),
      responseSchema: SEO_ENRICH_RESPONSE_SCHEMA as unknown as object,
      thinkingLevel: "low" as const,
      metadata: { kind: clean.kind, chars: (clean.description ?? "").length, facts: clean.facts?.length ?? 0 },
    };
    let result: AiCallResult = await this.ai.callAi(user, callOptions);
    let parsed = tryParse(result.text);
    const tooShort = (d: string | undefined) => !d || d.trim().length < descMin(d);
    if (parsed == null || tooShort(parsed.description)) {
      result = await this.ai.callAi(user, { ...callOptions, premiumRetry: true, metadata: { ...callOptions.metadata, retry: true } });
      parsed = tryParse(result.text);
    }
    if (parsed == null || !parsed.description || tooShort(parsed.description)) {
      throw new ServiceUnavailableException(i18nMessage("api.ai.aciklamaUretilemediBirkacOlguDahaEkleyip"));
    }

    // SANİTİZER: uzunluk tavanı, madde/emoji temizliği, anahtar kelime birleşimi.
    const cleanDesc = stripBullets(parsed.description);
    const description = clampSentences(cleanDesc, descMax(cleanDesc));
    // Tavan kullanicinin MEVCUT etiket sayisindan kucuk olamaz (derin denetim
    // S015): urun 15 etikete izin verir, web "Uygula" listeyi oldugu gibi yazar
    // -> eskiden 10'a kirpma kullanicinin 11.-15. etiketlerini sessizce siliyordu.
    const existingKeywords = clean.keywords ?? [];
    const keywords = normalizeKeywords([...existingKeywords, ...(parsed.keywords ?? [])]).slice(
      0,
      Math.max(KEYWORD_MAX, existingKeywords.length),
    );
    const title = typeof parsed.titleSuggestion === "string" ? parsed.titleSuggestion.replace(/\s+/g, " ").trim() : "";
    const titleMin = isMostlyCjk(title) ? 4 : 10;
    const titleSuggestion =
      title.length >= titleMin && title.length <= 80 && lowerCaseWords(title) !== lowerCaseWords(name) ? title : null;
    const missingFacts = (parsed.missingFacts ?? [])
      .filter((f): f is string => typeof f === "string")
      .map((f) => f.replace(/\s+/g, " ").trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 5);
    return { description, keywords, titleSuggestion, missingFacts, downgraded: result.downgraded, warned: result.warned };
  }
}

interface Raw {
  description?: unknown;
  keywords?: unknown;
  titleSuggestion?: unknown;
  missingFacts?: unknown;
}

function tryParse(text: string): (Raw & { description?: string; keywords?: string[]; missingFacts?: unknown[] }) | null {
  try {
    const j = JSON.parse(text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "")) as Raw;
    if (!j || typeof j !== "object") return null;
    return {
      description: typeof j.description === "string" ? j.description : undefined,
      keywords: Array.isArray(j.keywords) ? j.keywords.filter((k): k is string => typeof k === "string") : [],
      titleSuggestion: j.titleSuggestion,
      missingFacts: Array.isArray(j.missingFacts) ? j.missingFacts : [],
    };
  } catch {
    return null;
  }
}

function normalizeKeywords(list: string[]): string[] {
  const out: string[] = [];
  for (const k of list) {
    const v = lowerCaseWords((k ?? "").replace(/\s+/g, " ").trim()).slice(0, KEYWORD_MAX_LEN);
    if (v.length >= 2 && !out.includes(v)) out.push(v);
  }
  return out;
}

function stripBullets(s: string): string {
  return s
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
