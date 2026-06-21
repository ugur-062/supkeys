/**
 * V2-2 — R2 dosya yükleme tipleri.
 *
 * Aynı bileşenler hem tenant hem supplier panelinde kullanılır.
 * `surface` prop'u ile doğru axios instance + path prefix seçilir.
 */
export type AttachmentSurface = "tenant" | "supplier";

export type AttachmentScope =
  | "TENDER_DOC"
  | "BID_RESPONSE"
  | "ORDER_INVOICE"
  // G5 madde 19/21 — sipariş belge kategorileri (scopeRefId = order id)
  | "ORDER_PROFORMA"
  | "ORDER_TECHNICAL"
  | "ORDER_DELIVERY"
  // Faz 3 madde 16 — ödeme dekontu (alıcı yükler, ikisi de görür)
  | "ORDER_PAYMENT_PROOF"
  // Madde 33 — teminat mektubu (nakit ödemede tedarikçi yükler, ikisi de görür)
  | "ORDER_GUARANTEE_LETTER"
  | "MESSAGE_ATTACHMENT";

export interface AttachmentItem {
  id: string;
  scope: AttachmentScope;
  scopeRefId: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  finalizedAt: string | null;
  uploadedBy: {
    firstName: string;
    lastName: string;
    kind: "tenant" | "supplier";
  } | null;
}

export interface RequestUploadUrlResponse {
  attachmentId: string;
  key: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface DownloadUrlResponse {
  url: string;
  filename: string;
  mimeType: string;
  expiresIn: number;
}
