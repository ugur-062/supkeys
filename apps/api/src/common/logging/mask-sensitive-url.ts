/**
 * Access-log URL maskeleme (denetim 2026-08-23 Parça 1 #6): davet/referral/
 * sıfırlama token'ları URL path'inde ya da query'de taşınıyor; pino `req.url`
 * redakte edilmeden loglanıyordu (aynı token EmailLog'da bilinçli redakte).
 * Kural: (a) query'de token|code|key|secret|signature param değerleri,
 * (b) bilinen "token taşıyan" path segmentlerinden (invitations, davet, referral,
 * reset-password, verify, accept, unsubscribe, optout) sonra gelen uzun opak
 * segment (≥16 karakter, [A-Za-z0-9._~-]) → `[redacted]`.
 * Saf fonksiyon — test edilebilir; hata durumunda girdiyi olduğu gibi döner.
 */
// `t`: e-posta çıkış jetonu ve misafir bilgi talebi doğrulama jetonu.
// `ref`: davet (referral) jetonu — `public/invite-preview?ref=`; kayıtta
// davet edenle bağlantı ve o davet edenin talep davetlerini verir (yayın
// denetimi 2026-09-28).
const TOKEN_PARAMS = /([?&](?:token|code|key|secret|signature|sig|t|ref)=)[^&#]*/gi;
const TOKEN_SEGMENT =
  /(\/(?:invitations?|davet|referral(?:-optout)?|reset-password|verify(?:-email)?|accept|unsubscribe|optout|confirm)\/)([A-Za-z0-9._~-]{16,})(?=\/|\?|#|$)/gi;

export function maskSensitiveUrl(url: string | undefined | null): string {
  if (!url) return url ?? "";
  try {
    return url.replace(TOKEN_PARAMS, "$1[redacted]").replace(TOKEN_SEGMENT, "$1[redacted]");
  } catch {
    return url;
  }
}

/** `TOKEN_PARAMS` ile aynı anahtar kümesi — nesne biçimli sorgu için. */
const SENSITIVE_QUERY_KEYS = new Set(["token", "code", "key", "secret", "signature", "sig", "t", "ref"]);

/**
 * Nesne biçimli sorgu (`req.query`) — yayın denetimi 2026-09-28 Bölüm 5: pino
 * istek serileştiricisi `url`in YANINDA `query` ve `params` alanlarını da
 * yazıyordu; yalnız `url` maskelendiği için `?ref=` / `?t=` jetonları erişim
 * günlüğüne ve istek içindeki her servis satırına düz metin düşüyordu.
 */
export function maskSensitiveQuery<T>(query: T): T {
  if (!query || typeof query !== "object" || Array.isArray(query)) return query;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(query as Record<string, unknown>)) {
    out[k] = SENSITIVE_QUERY_KEYS.has(k.toLowerCase()) ? "[redacted]" : v;
  }
  return out as T;
}

/** Ham sorgu dizesi (`a=1&ref=…`, başında `?` olabilir) — Sentry `query_string`. */
export function maskQueryString(qs: string): string {
  if (!qs) return qs;
  const lead = qs.startsWith("?") ? "" : "?";
  return maskSensitiveUrl(`${lead}${qs}`).slice(lead.length);
}
