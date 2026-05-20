/**
 * V2-4 — Mesajlaşma tipleri.
 */
export type MessageContext = "ORDER" | "TENDER" | "DIRECT";
export type MessageSenderType = "TENANT_USER" | "SUPPLIER_USER";
export type MessageSurface = "tenant" | "supplier";

export interface MessageItem {
  id: string;
  threadId: string;
  senderType: MessageSenderType;
  senderUserId: string | null;
  senderSupplierUserId: string | null;
  senderName: string;
  content: string;
  attachmentIds: string[];
  emailNotifiedAt: string | null;
  sentAt: string;
  /** V2-4.2 — Hangi tender/order'dan gönderildiğinin etiketi. */
  context: MessageContext | null;
  contextRefId: string | null;
  /** Backend'de pre-resolve edilmiş insan-okur etiket. */
  contextLabel: string | null;
}

export interface MessageThreadInfo {
  id: string;
  tenantId: string;
  supplierId: string;
  lastMessageAt: string | null;
}

export interface ThreadMessagesResponse {
  thread: MessageThreadInfo;
  messages: MessageItem[];
}

export interface TenderThreadSummary {
  supplierId: string;
  supplierName: string;
  threadId: string | null;
  lastMessageAt: string | null;
  lastMessageContent: string | null;
  lastMessageSenderType: MessageSenderType | null;
  unread: boolean;
}

export interface SendMessagePayload {
  content: string;
  attachmentIds?: string[];
  /** V2-4.2 — gönderilen mesajın context etiketi (tender/order detay
   * sayfalarından gönderiminde otomatik set edilir). Boşsa DIRECT. */
  context?: MessageContext;
  contextRefId?: string;
}

/**
 * Header dropdown + /mesajlar sayfası için tüm thread'leri özet halinde döndüren
 * /threads endpoint'inin shape'i.
 */
/**
 * V2-4.1 — /mesajlar sayfası kontak listesi. Bağlantılı (ACTIVE relation)
 * tüm tedarikçiler/alıcılar dahil; mesajlaşmamış olanlar da listelenir.
 * lastMessageAt desc; null'lar alfabetik en altta.
 */
export interface ContactSummary {
  otherPartyId: string;
  otherPartyName: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unread: boolean;
}

export interface AllThreadSummary {
  threadId: string;
  context: MessageContext;
  contextRefId: string;
  contextLabel: "Sipariş" | "İhale";
  contextNumber: string;
  contextTitle: string | null;
  otherPartyId: string;
  otherPartyName: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unread: boolean;
}
