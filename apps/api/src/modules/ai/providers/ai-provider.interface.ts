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

/** AI-1 — vision içerik parçası (görüntü veya PDF, base64). */
export interface AiInlinePart {
  mimeType: string;
  /** base64 kodlu içerik */
  data: string;
}

/** AI-2 — araç (function) tanımı. `parameters` JSON Schema (OpenAPI-benzeri). */
export interface AiToolDef {
  name: string;
  description: string;
  parameters: object;
}

/** AI-2 — geçmiş konuşma parçası (metin / model'in araç çağrısı / araç sonucu).
 *  `signature`: sağlayıcı-opak imza (Gemini 3 thought signature) — modelin
 *  ürettiği functionCall part'ıyla birlikte geri gönderilmezse API reddeder. */
export type AiHistoryPart =
  | { text: string }
  | {
      functionCall: { name: string; args: Record<string, unknown> };
      signature?: string;
    }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export interface AiHistoryTurn {
  role: "user" | "model";
  parts: AiHistoryPart[];
}

/** AI-2 — modelin talep ettiği araç çağrısı. */
export interface AiToolCall {
  name: string;
  args: Record<string, unknown>;
  /** Sağlayıcı-opak imza (Gemini thought signature) — geri beslemede korunur. */
  signature?: string;
}

export interface AiCompletionRequest {
  model: string;
  system?: string;
  prompt: string;
  /**
   * AI-1 — vision part'ları (küçültülmüş görüntüler veya doğrudan PDF).
   * Çoklu part TEK çağrıda gider (4 sayfa = 1 istek): sabit prompt bir kez
   * ödenir, sayfalar-arası bölünen tablolarda doğruluk artar.
   */
  parts?: AiInlinePart[];
  /**
   * AI-1 — structured output: verilirse sağlayıcı JSON modunda (responseSchema)
   * çalışır; yanıt metni şemaya uyan JSON string'idir.
   */
  responseSchema?: object;
  /** AI-2 — araç tanımları (function-calling). Prompt'un önünde sabit prefix. */
  tools?: AiToolDef[];
  /**
   * Dış keşif — Google Search grounding. function-calling araçları ve
   * responseSchema ile BİRLİKTE kullanılamaz (Gemini kısıtı); çağıran iki
   * aşamalı desenle (grounding'li metin → şemalı JSON) çalışır.
   */
  webSearch?: boolean;
  /** AI-2 — önceki konuşma + araç turları (prompt'tan ÖNCE gelir). */
  history?: AiHistoryTurn[];
  /**
   * AI-2 — thinking'i kapat (thinkingBudget=0). Düşünen Gemini-3 modelleri araç
   * çağrısında thought_signature üretir; çok-turlu araç döngüsünde bu imza
   * kaybolursa 400 INVALID_ARGUMENT. Asistan basit okuma+yanıt yapar, thinking
   * gereksiz → kapatınca signature derdi YAPISAL olarak biter + ucuz/hızlı.
   */
  disableThinking?: boolean;
  /**
   * Thinking seviyesi tavanı (Gemini 3 `thinkingLevel`). Asistan "low" kullanır:
   * thinking tamamen kapatılamayan modellerde de çalışır, thought token'ları
   * (maxOutputTokens'tan yer) ve gecikmeyi kısar. disableThinking öncelikli.
   */
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  maxOutputTokens: number;
  timeoutMs: number;
  /**
   * Tur-geneli mutlak son tarih (epoch ms). Çok-çağrılı akışlarda (asistan araç
   * döngüsü) toplam süreyi sınırlar: her deneme kalan süreyle yarışır, süre
   * bittiyse retry yapılmaz. Verilmezse yalnız timeoutMs geçerlidir.
   */
  deadlineAt?: number;
}

export interface AiCompletionResult {
  text: string;
  usage: AiTokenUsage;
  /** AI-2 — modelin bu turda talep ettiği araç çağrıları (varsa). */
  toolCalls?: AiToolCall[];
  /**
   * Sağlayıcının bitiş nedeni (Gemini finishReason; ör. STOP, MAX_TOKENS,
   * MALFORMED_FUNCTION_CALL). Boş yanıt teşhisi için — hata DEĞİLDİR.
   */
  finishReason?: string;
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
