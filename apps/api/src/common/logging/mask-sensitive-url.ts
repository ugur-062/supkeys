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
const TOKEN_PARAMS = /([?&](?:token|code|key|secret|signature|sig)=)[^&#]*/gi;
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
