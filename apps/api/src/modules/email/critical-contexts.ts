/**
 * Erişimi kapılayan KRİTİK e-posta context tipleri — bunlar gitmezse kullanıcı
 * sisteme hiç giremez (kayıt doğrulama kodu, şifre sıfırlama, 2FA giriş kodu) ve
 * in-app fallback YOKTUR (kullanıcı henüz giriş yapmamış).
 *
 * TEK KAYNAK — İKİ TÜKETİCİ:
 *   1. GÖNDERİM (email.service.ts): kritik e-posta suppress/hata → reportToSentry.
 *   2. BOUNCE (resend-event.service.ts): kritik e-postanın KENDİSİ hard-bounce/
 *      complaint alınca → reportToSentry (webhook async gelir, gönderim başarılıydı).
 * İki taraf da bu sabiti okur; lokal kopya YOK (yoksa ıraksar).
 * PII GÖNDERİLMEZ: yalnız log-id + context tipi/id (adres/gövde/kod GEÇMEZ).
 */
export const CRITICAL_EMAIL_CONTEXTS = new Set<string>([
  "password_reset",
  "login_2fa",
  "email_verify",
]);

export function isCriticalEmailContext(type: string | undefined): boolean {
  return type != null && CRITICAL_EMAIL_CONTEXTS.has(type);
}
