/**
 * POSTA KODU — Ayarlar adres defteri ve Firma Bilgileri ortak kuralı
 * (arayüz testi D-133). API `assertPostalCode` (company-addresses.service)
 * ile aynı: Türkiye'de 5 rakam, diğer ülkelerde harf/rakam/boşluk/tire
 * (SW1A 1AA, 1012 AB, K1A 0B1). Boş değer serbest — alan isteğe bağlı.
 */
export function cleanPostal(v: string, tr: boolean): string {
  return tr ? v.replace(/\D/g, "").slice(0, 5) : v.toUpperCase().replace(/[^A-Z0-9 -]/g, "");
}

/** TR posta kodu hatalı mı? (boş = hatasız) */
export function isInvalidTrPostal(v: string): boolean {
  const s = v.trim();
  return s.length > 0 && !/^\d{5}$/.test(s);
}
