/**
 * Vergi no GÖRÜNÜRLÜĞÜ — TEK KAYNAK (KVKK, derin denetim Y-06).
 *
 * Şahıs firmasında (`SOLE_PROPRIETOR`) `taxNumber` firma sahibinin 11 haneli
 * TCKN'sidir (onboarding `sahisFirmasiIcin11HaneliTckn`) → kişisel veri; tam
 * değeri yalnız firmanın kendi yetkili üyesi görür. Tüzel kişide (JOINT_STOCK /
 * LIMITED / OTHER) vergi no ticari sicil verisidir, açık kalır.
 *
 * Kullanım: başka firmanın vergi no'sunu döndüren her okuma (panel firma
 * profili) ve firmanın kendi `company:manage`'siz üyesine dönen profil bu
 * helper'dan geçer — kuralı yeniden yazma.
 */
export function visibleTaxNumber(c: {
  companyType: string | null;
  taxNumber: string | null;
}): string | null {
  return c.companyType === "SOLE_PROPRIETOR" ? null : c.taxNumber;
}
