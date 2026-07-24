import { GoogleGenAI, type Content } from "@google/genai";
import {
  AiProviderError,
  AiProviderTimeoutError,
  BaseAiProvider,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiHistoryTurn,
  type AiTokenUsage,
  type AiToolCall,
} from "./ai-provider.interface";

/** AiHistoryTurn[] → Gemini Content[] (metin / functionCall / functionResponse). */
function historyToContents(history: AiHistoryTurn[]): Content[] {
  return history.map((turn) => ({
    role: turn.role,
    parts: turn.parts.map((p) => {
      if ("text" in p) return { text: p.text };
      if ("functionCall" in p) {
        // Gemini 3 thought signature'ı functionCall part'ıyla birlikte geri gider.
        return {
          functionCall: { name: p.functionCall.name, args: p.functionCall.args },
          ...(p.signature ? { thoughtSignature: p.signature } : {}),
        };
      }
      return {
        functionResponse: {
          name: p.functionResponse.name,
          response: p.functionResponse.response,
        },
      };
    }),
  }));
}

/**
 * Faz AI-0 — Gemini adapter'ı (@google/genai). Usage normalizasyonu:
 * - `promptTokenCount` cache'lenmiş içeriği DE içerir (SDK dokümantasyonu) →
 *   cache'siz girdi = prompt − cached; ayrı sayılmazsa cache'li token tam
 *   fiyattan hesaplanır ve maliyet ŞİŞER.
 * - `thoughtsTokenCount` (reasoning) çıktı fiyatından faturalanır → output'a eklenir.
 * - Gemini implicit cache'te ayrı yazım ücreti yok → cacheWriteTokens=0.
 */
export class GeminiProvider extends BaseAiProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    super();
    this.client = new GoogleGenAI({ apiKey });
  }

  /** Geçici Gemini hataları (yük/kapasite) — kısa backoff'la retry edilir.
   *  Preview/free-tier modeller sık 503 "high demand" verir; tek denemede
   *  düşmek asistanı "yanıt veremedi"ye çevirir. Timeout/4xx retry EDİLMEZ. */
  private static readonly MAX_RETRIES = 2;
  private static readonly RETRY_BACKOFF_MS = [600, 1500];

  private static isTransient(err: unknown): boolean {
    const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
      m.includes('"code":503') ||
      m.includes('"code":429') ||
      m.includes("unavailable") ||
      m.includes("overloaded") ||
      m.includes("high demand") ||
      m.includes("resource_exhausted")
    );
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.completeOnce(req);
      } catch (err) {
        // Timeout kullanıcıyı bekletmesin; geçici olmayan hata da anında düşer.
        if (
          err instanceof AiProviderTimeoutError ||
          !GeminiProvider.isTransient(err) ||
          attempt >= GeminiProvider.MAX_RETRIES
        ) {
          throw err;
        }
        await new Promise((r) =>
          setTimeout(r, GeminiProvider.RETRY_BACKOFF_MS[attempt] ?? 1500),
        );
      }
    }
  }

  private async completeOnce(
    req: AiCompletionRequest,
  ): Promise<AiCompletionResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);
    try {
      // Son kullanıcı turu: metin + (AI-1) vision part'ları. AI-2 araç
      // döngüsünde prompt BOŞ olabilir — history functionResponse ile biter ve
      // model devam eder; boş user turu EKLENMEZ (Gemini iki ardışık user
      // turunu / fnResponse sonrası boş user turunu reddeder).
      const userParts: object[] = [
        ...(req.parts ?? []).map((p) => ({
          inlineData: { mimeType: p.mimeType, data: p.data },
        })),
        ...(req.prompt ? [{ text: req.prompt }] : []),
      ];
      // AI-2: geçmiş turlar (metin + araç çağrı/sonuçları) prompt'tan ÖNCE.
      const contents: Content[] = [
        ...(req.history ? historyToContents(req.history) : []),
        ...(userParts.length > 0
          ? [{ role: "user", parts: userParts as Content["parts"] }]
          : []),
      ];
      const resp = await this.client.models.generateContent({
        model: req.model,
        contents,
        config: {
          maxOutputTokens: req.maxOutputTokens,
          abortSignal: controller.signal,
          ...(req.system ? { systemInstruction: req.system } : {}),
          ...(req.responseSchema
            ? {
                responseMimeType: "application/json",
                responseSchema: req.responseSchema,
              }
            : {}),
          // AI-2 asistan: thinking kapalı → thought_signature üretilmez →
          // çok-turlu araç döngüsünde 400 INVALID_ARGUMENT yapısal olarak biter.
          ...(req.disableThinking
            ? { thinkingConfig: { thinkingBudget: 0 } }
            : {}),
          // AI-2: araç tanımları (function-calling).
          ...(req.tools && req.tools.length > 0
            ? {
                tools: [
                  {
                    functionDeclarations: req.tools.map((t) => ({
                      name: t.name,
                      description: t.description,
                      parametersJsonSchema: t.parameters,
                    })),
                  },
                ],
              }
            : {}),
        },
      });
      const meta = resp.usageMetadata;
      const cached = meta?.cachedContentTokenCount ?? 0;
      const prompt = meta?.promptTokenCount ?? 0;
      const usage: AiTokenUsage = {
        inputTokens: Math.max(0, prompt - cached),
        outputTokens:
          (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
        cacheReadTokens: cached,
        cacheWriteTokens: 0,
      };
      // functionCall + thoughtSignature aynı Part'ta — ham parts'tan eşleştir
      // (resp.functionCalls düzleştirilmişi imzayı taşımaz).
      const respParts = resp.candidates?.[0]?.content?.parts ?? [];
      const toolCalls: AiToolCall[] = [];
      for (const p of respParts) {
        if (p.functionCall?.name) {
          toolCalls.push({
            name: p.functionCall.name,
            args: (p.functionCall.args ?? {}) as Record<string, unknown>,
            ...(p.thoughtSignature ? { signature: p.thoughtSignature } : {}),
          });
        }
      }
      return {
        text: resp.text ?? "",
        usage,
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
      };
    } catch (err) {
      if (controller.signal.aborted) {
        throw new AiProviderTimeoutError(
          `Gemini isteği zaman aşımına uğradı (${req.timeoutMs}ms)`,
        );
      }
      if (err instanceof AiProviderError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      // API anahtarı/istek gövdesi mesaja sızmasın diye sadece özet kod tutulur.
      throw new AiProviderError(`Gemini hatası: ${msg}`, "provider_error");
    } finally {
      clearTimeout(timer);
    }
  }
}
