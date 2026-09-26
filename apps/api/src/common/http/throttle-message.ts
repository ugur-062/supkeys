import { tApi } from "../i18n/i18n.service";

/**
 * Hız sınırı aşımında kullanıcıya dönen metin — TEK KAYNAK. Global
 * `ThrottlerModule` ve rota bazlı `@Throttle` override'ları aynı metni basar;
 * web formları API mesajını olduğu gibi gösterdiği için eylem odaklı.
 *
 * Fonksiyon: `@nestjs/throttler` (6.x) `errorMessage`ı her 429'da çağırır →
 * metin İSTEK dilinde üretilir (`LocaleMiddleware` guard'lardan önce koşar,
 * ALS bağlamı hazır).
 */
export function throttleMessage(): string {
  return tApi("api.http.cokFazlaDeneme");
}
