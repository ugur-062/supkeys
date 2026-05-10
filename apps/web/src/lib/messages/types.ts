/**
 * V2-4 — Mesajlaşma tipleri.
 */
export type MessageContext = "ORDER" | "TENDER";
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
}

export interface MessageThreadInfo {
  id: string;
  context: MessageContext;
  contextRefId: string;
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
}

/**
 * Header dropdown + /mesajlar sayfası için tüm thread'leri özet halinde döndüren
 * /threads endpoint'inin shape'i.
 */
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
