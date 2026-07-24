/**
 * Faz AI-2 — asistan sohbeti (api üretir, web tüketir).
 *
 * Asistan sistemin OKUMA servislerini kullanıcı kimliğiyle çağırır (ham DB YOK);
 * yetki katmanı (rol/tier/görünürlük/kapalı-zarf) bedava çalışır. Bağlayıcı
 * yazma aracı YOK — asistan ihale açmaz/teklif vermez, sayfaya yönlendirir.
 */

export type AiChatRole = "USER" | "ASSISTANT";

export interface AiChatMessageDto {
  id: string;
  role: AiChatRole;
  content: string;
  createdAt: string;
}

export interface AiChatSessionSummaryDto {
  id: string;
  title: string | null;
  lastMessageAt: string;
  turnCount: number;
}

export interface AiChatSessionDetailDto extends AiChatSessionSummaryDto {
  messages: AiChatMessageDto[];
}

/** POST message yanıtı. */
export interface AiAssistantReply {
  sessionId: string;
  /** Asistanın nihai metni. */
  reply: string;
  /** 35+ turda: yeni sohbet önerisi. */
  suggestNewChat: boolean;
  /** Havuz uyarı eşiği (%80) aşıldı. */
  warned: boolean;
  /** Bu turda çağrılan araç adları (gösterim/teşhis; sonuç içeriği DEĞİL). */
  toolsUsed: string[];
}
