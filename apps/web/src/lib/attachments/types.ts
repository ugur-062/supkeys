/**
 * V2-2 — R2 dosya yükleme tipleri.
 *
 * Aynı bileşenler hem tenant hem supplier panelinde kullanılır.
 * `surface` prop'u ile doğru axios instance + path prefix seçilir.
 */
export type AttachmentSurface = "tenant" | "supplier";

export type AttachmentScope = "TENDER_DOC" | "BID_RESPONSE" | "ORDER_INVOICE";

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
