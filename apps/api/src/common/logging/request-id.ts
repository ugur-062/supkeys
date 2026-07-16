import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Correlation-id (request-id) — bir isteği uçtan uca (access log + servis log +
 * response header + Sentry) izlenebilir kılan rastgele değer.
 *
 * PII DEĞİL: her zaman rastgele UUID veya istemcinin verdiği opak id. Kullanıcı
 * id'si / e-posta / oturum gibi bir şey ASLA konmaz.
 */
export const REQUEST_ID_HEADER = "x-request-id";

// Gelen header'ı onurlandırırken güvenlik sınırı: yalnız kısa, opak, log/header
// enjeksiyonuna kapalı karakter kümesi. Uymayan (boş, çok uzun, kontrol karakteri
// içeren) değerler REDDEDİLİR ve yeni UUID üretilir.
const VALID_INCOMING_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Gelen `x-request-id` header'ını doğrula: geçerliyse onurlandır (dağıtık
 * izlemede üst-servisin id'si korunur), aksi halde yeni UUID üret.
 */
export function resolveRequestId(headerValue: unknown): string {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (VALID_INCOMING_ID.test(trimmed)) return trimmed;
  }
  return randomUUID();
}

/**
 * pino-http `genReqId` — istek başında çağrılır. Gelen id'yi onurlandırır/üretir,
 * response header'ında geri döner (istemci/destek ekibi hata bildirirken verebilsin)
 * ve `req.id` olarak yerleşir (pino access log + downstream buradan okur).
 */
export function genRequestId(
  req: IncomingMessage,
  res: ServerResponse,
): string {
  const id = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}
