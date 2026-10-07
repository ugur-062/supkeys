/**
 * Sağlayıcı hatasından KISA, TEMİZLENMİŞ sebep kodu (canlı öncesi
 * sağlamlaştırma, 2026-10-07).
 *
 * NEDEN: staging'de her AI çağrısı 502 dönüyordu; kullanım kaydında yalnız genel
 * `provider_error` vardı, Google'ın asıl yanıtı (400 "User location is not
 * supported" mı, 403 PERMISSION_DENIED mi, 404 model yok mu?) yalnız Render
 * günlüğündeydi → günlüğe erişmeden teşhis edilemedi.
 *
 * GÜVENLİK: sağlayıcının serbest metni KAYDEDİLMEZ (anahtar, istek gövdesi,
 * proje kimliği, kullanıcı içeriği sızabilir). Yalnız BİÇİMİ sabit parçalar
 * alınır ve hepsi beyaz liste desenine uyar:
 *   - HTTP durumu (3 hane)                    → `http_400`
 *   - Google hata durumu (BÜYÜK_HARF enum)    → `FAILED_PRECONDITION`
 *   - Google ayrıntı sebebi (BÜYÜK_HARF enum) → `API_KEY_INVALID`
 *   - ağ hata kodu (Node `E…` / undici)       → `net_ENOTFOUND`
 *   - bilinen metinlerden SABİT ipucu         → `location_not_supported`
 * Çıktı: `:` ile birleşik, yalnız `[A-Za-z0-9_:]`, en çok 96 karakter.
 * Örnek: `http_400:FAILED_PRECONDITION:location_not_supported`.
 */

export const PROVIDER_REASON_MAX_LENGTH = 96;
export const PROVIDER_REASON_UNKNOWN = "unknown";

/** Bilinen sağlayıcı metinleri → sabit ipucu (metnin kendisi saklanmaz). */
const HINTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/user location is not supported/i, "location_not_supported"],
  [/api key not valid|api_key_invalid/i, "api_key_invalid"],
  [/api key expired/i, "api_key_expired"],
  [/invalid_grant/i, "oauth_invalid_grant"],
  [/invalid_client|unauthorized_client/i, "oauth_invalid_client"],
  [/billing/i, "billing"],
  [/has not been used in project|is disabled|service_disabled/i, "api_disabled"],
  [/permission|iam_permission_denied/i, "permission_denied"],
  [/quota|resource_exhausted/i, "quota"],
  [/high demand|overloaded/i, "overloaded"],
  [/(model|publisher model)[^"]{0,120}(not found|does not exist)|is not found for api version/i, "model_not_found"],
  [/fetch failed/i, "fetch_failed"],
];

function httpStatusOf(err: unknown, message: string): number | undefined {
  const direct = (err as { status?: unknown } | null)?.status;
  if (typeof direct === "number" && Number.isInteger(direct) && direct >= 100 && direct <= 599) {
    return direct;
  }
  const m =
    message.match(/"code"\s*:\s*(\d{3})(?!\d)/) ?? message.match(/got status:?\s*(\d{3})(?!\d)/i);
  return m ? Number(m[1]) : undefined;
}

function networkCodeOf(err: unknown): string | undefined {
  const candidates = [
    (err as { code?: unknown } | null)?.code,
    (err as { cause?: { code?: unknown } } | null)?.cause?.code,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^(E[A-Z0-9_]{2,30}|UND_ERR_[A-Z0-9_]{2,30})$/.test(c)) return c;
  }
  return undefined;
}

/**
 * Ham sağlayıcı hatası → temizlenmiş sebep kodu. ASLA fırlatmaz; hiçbir parça
 * çıkarılamazsa `unknown`.
 */
export function providerFailureReason(err: unknown): string {
  try {
    const message = err instanceof Error ? err.message : String(err ?? "");
    const parts: string[] = [];

    const http = httpStatusOf(err, message);
    if (http !== undefined) parts.push(`http_${http}`);

    const status = message.match(/"status"\s*:\s*"([A-Z][A-Z_]{2,39})"/)?.[1];
    if (status) parts.push(status);

    const detail = message.match(/"reason"\s*:\s*"([A-Z][A-Z0-9_]{2,59})"/)?.[1];
    if (detail && detail !== status) parts.push(detail);

    const net = networkCodeOf(err);
    if (net) parts.push(`net_${net}`);

    const hint = HINTS.find(([re]) => re.test(message))?.[1];
    if (hint && !parts.some((p) => p.toLowerCase() === hint)) parts.push(hint);

    const joined = parts
      .join(":")
      .replace(/[^A-Za-z0-9_:]/g, "")
      .slice(0, PROVIDER_REASON_MAX_LENGTH);
    return joined || PROVIDER_REASON_UNKNOWN;
  } catch {
    return PROVIDER_REASON_UNKNOWN;
  }
}

/** Dışarıdan gelen (ör. hata nesnesindeki) sebebi saklamadan önce son süzgeç. */
export function sanitizeProviderReason(reason: string | undefined | null): string | undefined {
  if (typeof reason !== "string") return undefined;
  const clean = reason.replace(/[^A-Za-z0-9_:]/g, "").slice(0, PROVIDER_REASON_MAX_LENGTH);
  return clean === "" ? undefined : clean;
}
