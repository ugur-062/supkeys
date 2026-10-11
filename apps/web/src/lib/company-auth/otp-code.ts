/**
 * 6 haneli doğrulama kodu girişi: önce rakam dışı ayıklanır, SONRA 6'ya
 * kesilir. "123 456", "Kod: 123456" yapıştırması eskiden `maxLength={6}`
 * yüzünden önce kırpılıp "12345"/"1" kalıyordu (arayüz testi D-351). Kayıt ve
 * giriş (e-posta doğrulama modu) ortak.
 */
export const OTP_LENGTH = 6;

export function normalizeOtpCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, OTP_LENGTH);
}
