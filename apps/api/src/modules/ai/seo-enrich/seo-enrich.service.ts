import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { AiSeoEnrichInput, AiSeoEnrichResult } from "@rothern/shared";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { AiService, type AiCallResult } from "../ai.service";
import { SEO_ENRICH_RESPONSE_SCHEMA, SEO_ENRICH_SYSTEM_PROMPT, buildSeoEnrichPrompt } from "./seo-enrich.prompts";

export const SEO_ENRICH_MAX_DESCRIPTION = 5000;
export const SEO_ENRICH_MAX_FACTS = 40;
const DESC_MIN = 120;
const DESC_MAX = 900;
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
    if (name.length < 2) throw new BadRequestException("Önce bir ad/başlık yazın.");
    const clean: AiSeoEnrichInput = {
      kind: input.kind,
      name: name.slice(0, 200),
      description: (input.description ?? "").slice(0, SEO_ENRICH_MAX_DESCRIPTION) || null,
      categoryName: input.categoryName?.slice(0, 200) ?? null,
      facts: (input.facts ?? []).map((f) => f.replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean).slice(0, SEO_ENRICH_MAX_FACTS),
      keywords: normalizeKeywords(input.keywords ?? []),
      brand: input.brand?.slice(0, 100) ?? null,
      city: input.city?.slice(0, 100) ?? null,
      industry: input.industry?.slice(0, 100) ?? null,
    };

    const callOptions = {
      feature: "seo_enrich",
      prompt: buildSeoEnrichPrompt(clean),
      system: SEO_ENRICH_SYSTEM_PROMPT,
      responseSchema: SEO_ENRICH_RESPONSE_SCHEMA as unknown as object,
      thinkingLevel: "low" as const,
      metadata: { kind: clean.kind, chars: (clean.description ?? "").length, facts: clean.facts?.length ?? 0 },
    };
    let result: AiCallResult = await this.ai.callAi(user, callOptions);
    let parsed = tryParse(result.text);
    if (parsed == null || !parsed.description || parsed.description.trim().length < DESC_MIN) {
      result = await this.ai.callAi(user, { ...callOptions, premiumRetry: true, metadata: { ...callOptions.metadata, retry: true } });
      parsed = tryParse(result.text);
    }
    if (parsed == null || !parsed.description || parsed.description.trim().length < DESC_MIN) {
      throw new ServiceUnavailableException("Açıklama üretilemedi — birkaç olgu daha ekleyip tekrar deneyin.");
    }

    // SANİTİZER: uzunluk tavanı, madde/emoji temizliği, anahtar kelime birleşimi.
    const description = clampSentences(stripBullets(parsed.description), DESC_MAX);
    const keywords = normalizeKeywords([...(clean.keywords ?? []), ...(parsed.keywords ?? [])]).slice(0, KEYWORD_MAX);
    const title = typeof parsed.titleSuggestion === "string" ? parsed.titleSuggestion.replace(/\s+/g, " ").trim() : "";
    const titleSuggestion = title.length >= 10 && title.length <= 80 && title.toLowerCase() !== name.toLowerCase() ? title : null;
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
    const v = (k ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 40);
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

/** Tavanı aşarsa CÜMLE sınırında keser — yarım cümle alıntılanmaz. */
function clampSentences(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > max * 0.5 ? cut.slice(0, end + 1) : cut.trimEnd();
}
