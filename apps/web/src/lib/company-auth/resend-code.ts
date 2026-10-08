/**
 * `POST company-auth/resend-email-code` YANITI (arayüz testi 2026-10
 * code-auth-3, login-7).
 *
 * Uç eskiden her durumda `{ success: true }` dönüyor, ekran da "Yeni kod
 * gönderildi" diyordu — saatlik kod tavanında (5 kod) ya da gönderim hatasında
 * hiçbir e-posta çıkmadığı hâlde. Kullanıcı gelmeyen kodu bekliyor, her tık
 * yine "gönderildi" diyordu. API artık dürüst sinyal verir:
 *
 *  - `sent: true`  → kod gönderildi.
 *  - `sent: false` → e-posta ÇIKMADI: gönderim hatası / bastırılmış adres.
 *  - `sent: false, capped: true` → saatlik tavan; son gönderilen kod süresi
 *    dolana dek geçerlidir.
 *
 * Eski API yalnız `{ success: true }` döner → alan yoksa "gönderildi" sayılır
 * (API web'den önce dağıtılır; ters sırada da ekran bozulmaz).
 */
export interface ResendEmailCodeResult {
  success: true;
  sent?: boolean;
  capped?: boolean;
}

export type ResendEmailCodeOutcome = "sent" | "capped" | "failed";

/** Ekranın söyleyeceği sonuç — "gönderildi" yalnız kod gerçekten çıktıysa. */
export function resendEmailCodeOutcome(
  res: ResendEmailCodeResult | null | undefined,
): ResendEmailCodeOutcome {
  if (res?.capped) return "capped";
  return res?.sent === false ? "failed" : "sent";
}
