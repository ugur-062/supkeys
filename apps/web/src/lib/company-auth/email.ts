/**
 * GEVŞEK E-POSTA KURALI — kayıt, giriş ve şifremi unuttum formlarının ORTAK
 * ön denetimi (arayüz testi 2026-10 code-auth-7).
 *
 * Asıl doğrulama API'dedir (class-validator `IsEmail`). Form yalnız bariz
 * yazım hatasını ("ayse@firma", "ayse veli@firma.com", "abc") istek atmadan
 * yakalar. Giriş formu eskiden zod `.email()` kullanıyordu: o kural kaydın ve
 * API'nin kabul ettiği adresleri (`satis&pazarlama@firma.com`, ASCII dışı
 * alan adı) reddediyor, böyle bir hesap formdan giriş yapamıyordu.
 *
 * Baş/son boşluk sayılmaz (formlar gönderirken kırpar); adresin İÇİNDE boşluk
 * olamaz.
 */
const LOOSE_EMAIL_RE = /^\S+@\S+\.\S+$/;

export function isPlausibleEmail(value: string): boolean {
  return LOOSE_EMAIL_RE.test(value.trim());
}
