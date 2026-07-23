/**
 * Faz AI-0 — sağlayıcı soyutlaması (packages/email BaseEmailProvider deseni).
 * Servisler yalnız bu arayüzü bilir; Gemini/Anthropic/vb. adapter'ları usage'ı
 * NORMALIZE ederek döner (girdi/çıktı/cache AYRI — cache'li girdi ~0.1×
 * fiyatlandığından ayrı sayılmazsa maliyet yanlış hesaplanır).
 */

export interface AiTokenUsage {
  /** Cache'siz girdi token'ı (tam fiyat). */
  inputTokens: number;
  /** Çıktı token'ı (varsa thinking/reasoning dahil — sağlayıcı öyle faturalar). */
  outputTokens: number;
  /** Cache'ten okunan girdi token'ı (indirimli fiyat). */
  cacheReadTokens: number;
  /** Cache'e yazım token'ı (Gemini implicit cache'te 0). */
  cacheWriteTokens: number;
}

export interface AiCompletionRequest {
  model: string;
  system?: string;
  /** AI-0: düz metin. AI-1 vision part'larını (image/pdf) ekleyecek. */
  prompt: string;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface AiCompletionResult {
  text: string;
  usage: AiTokenUsage;
}

/**
 * Sağlayıcı hatası. `usage` VARSA sağlayıcı kısmi tüketim raporladı demektir
 * (gerçek maliyet düşülür); yoksa üretim başlamadan reddedildi (maliyet 0).
 */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly usage?: AiTokenUsage,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

/** Timeout/iptal — kısmi token harcanmış olabilir → tahmin tutarı KALIR (fail-closed). */
export class AiProviderTimeoutError extends AiProviderError {
  constructor(message: string) {
    super(message, "timeout");
    this.name = "AiProviderTimeoutError";
  }
}

export abstract class BaseAiProvider {
  abstract readonly name: string;
  abstract complete(req: AiCompletionRequest): Promise<AiCompletionResult>;
}
