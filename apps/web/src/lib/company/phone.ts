/**
 * Telefon doğrulaması — TEK KAYNAK (2026-09-10): Hesap Bilgileri ve
 * Kullanıcı düzenleme aynı kuralı okur (eskiden yalnız Hesap Bilgileri
 * denetliyordu, kullanıcı kartından bozuk numara yazılabiliyordu).
 * Boş değer geçerli (alan isteğe bağlı).
 */
export const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;

export function isValidPhone(phone: string): boolean {
  const p = phone.trim();
  return p === "" || PHONE_RE.test(p);
}
