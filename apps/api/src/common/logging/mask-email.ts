/**
 * Günlük satırında e-posta adresi MASKELİ (yayın denetimi 2026-09-28 Bölüm 13,
 * B5-17): her gönderim/atlama satırı alıcının tam adresini Render günlüğüne
 * yazıyordu — üye olmayan (soğuk davet) üçüncü kişiler dahil; günlük ayrı bir
 * işleyende, ayrı saklama süresiyle duruyor. Teslim takibi `email_logs`
 * satırında (id ile ilişkilendirilir); günlükte alan adı kalır (teslim
 * sorunları alan adına göre okunur).
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "-";
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
