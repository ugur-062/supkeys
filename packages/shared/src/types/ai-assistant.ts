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
  /**
   * Faz AI-3 — asistan konuşarak/belgeden ihale taslağı topladıysa güncel
   * taslak (aynı AiTenderExtractResult şekli — mapAiDraftToForm ile wizard'a
   * taşınır). BAĞLAYICI DEĞİL: ihale yine kullanıcı onayıyla wizard'dan açılır.
   */
  tenderDraft?: import("./ai-tender-draft").AiTenderExtractResult;
  /**
   * Faz AI-4 — modelin ÖNERDİĞİ, kullanıcı onayı bekleyen aksiyon. Model asla
   * doğrudan yazamaz: kart içeriği backend'in DOĞRULANMIŞ özetidir; işlem
   * yalnız kullanıcının confirm endpoint'ine (CSRF'li) basmasıyla gerçekleşir.
   */
  pendingAction?: AiPendingAction;
}

/** Onay bekleyen asistan aksiyonu — tek seferlik ve süreli. */
export interface AiPendingAction {
  id: string;
  type: "send_invites" | "publish_tender" | "eliminate_bid" | "award_tender";
  /** normal = tek tık; critical = vurgulu uyarı (bağlayıcı/geri alınamaz). */
  severity: "normal" | "critical";
  /** Backend'in ürettiği doğrulanmış özet satırları (model metni DEĞİL). */
  summary: string[];
  /** ISO — süre dolunca kart pasifleşir, onay reddedilir. */
  expiresAt: string;
}

/** Confirm/reject yanıtı. */
export interface AiActionResult {
  status: "executed" | "rejected";
  /** Kullanıcıya gösterilecek sonuç mesajı (Türkçe). */
  message: string;
  /** Oluşan kaynağın linki için (örn. yayınlanan ihale id'si). */
  resourceId?: string;
}
