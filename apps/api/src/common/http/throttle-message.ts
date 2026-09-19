/**
 * Hız sınırı aşımında kullanıcıya dönen metin — TEK KAYNAK. Global
 * `ThrottlerModule` ve rota bazlı `@Throttle` override'ları aynı metni basar;
 * web formları API mesajını olduğu gibi gösterdiği için Türkçe ve eylem odaklı.
 */
export const THROTTLE_MESSAGE = "Çok fazla deneme yapıldı. Lütfen bir dakika bekleyip yeniden deneyin.";
