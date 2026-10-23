import type { ApiTranslator } from "@rothern/i18n";
import { tApi } from "./i18n.service";

type ApiKey = Parameters<ApiTranslator>[0];

/**
 * İstisna GÖVDESİ için anahtarlı mesaj — `throw new BadRequestException(
 * i18nMessage("api.business.expired", undefined, "BID_EXPIRED"))`.
 *
 * Mesaj FIRLATMA anında istek dilinde çevrilir (ALS), `code` makine
 * tarafından okunur (web `TIER_REQUIRED` kalıbı). Şekil Nest'in standart
 * `{ statusCode, message, error }` gövdesiyle uyumlu: HttpException nesne
 * yanıtını olduğu gibi döner, `statusCode`/`error`ı kendi ekler.
 */
export function i18nMessage(
  key: ApiKey,
  values?: Record<string, string | number | Date>,
  code?: string,
): { message: string; i18nKey: string; code?: string } {
  return {
    message: tApi(key, values),
    i18nKey: key,
    ...(code ? { code } : {}),
  };
}
