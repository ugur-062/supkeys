import { GoogleGenAI } from "@google/genai";
import {
  AiProviderError,
  AiProviderTimeoutError,
  BaseAiProvider,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiTokenUsage,
} from "./ai-provider.interface";

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

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);
    try {
      const resp = await this.client.models.generateContent({
        model: req.model,
        contents: req.prompt,
        config: {
          maxOutputTokens: req.maxOutputTokens,
          abortSignal: controller.signal,
          ...(req.system ? { systemInstruction: req.system } : {}),
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
      return { text: resp.text ?? "", usage };
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
