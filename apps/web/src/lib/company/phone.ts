import { isValidPhoneNumber } from "@rothern/shared";

/**
 * Telefon doğrulaması — TEK KAYNAK (2026-09-10): Hesap Bilgileri, Kullanıcı
 * düzenleme ve adres defteri aynı kuralı okur (eskiden yalnız Hesap Bilgileri
 * denetliyordu, kullanıcı kartından bozuk numara yazılabiliyordu).
 * Boş değer geçerli (alan isteğe bağlı).
 *
 * 2026-09-27: kural ülke koduna göre ulusal uzunluk — `@rothern/shared`
 * `isValidPhoneNumber` (kayıt formu ve API DTO'ları da aynı fonksiyonu okur).
 * Eski "7-20 karakter" deseni "+90 89161234567" gibi 11 haneli numarayı geçiriyordu.
 */
export function isValidPhone(phone: string): boolean {
  const p = phone.trim();
  return p === "" || isValidPhoneNumber(p);
}
