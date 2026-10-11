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

/**
 * "YENİDEN GÖNDER" DÜĞMESİNİN PASİF GÖRÜNÜMÜ (arayüz testi 2026-10 relogin-3).
 *
 * Geri sayım sürerken düğme pasiftir ama metni ("Yeniden gönder (59sn)")
 * kullanıcının OKUDUĞU bilgidir. Pasif düğmeyi soluklaştıran `opacity-50`,
 * zinc-500 metni beyazda zinc-400'den de açık bırakıyordu (kural: küçük metin
 * en az tam güçte zinc-500). Soluklaştırma yalnız istek sürerken uygulanır;
 * geri sayımda renk tam kalır, düğme yalnız tıklanamaz görünür (imleç).
 * Üzerine gelme rengi ayrıca `enabled:` ile sınırlıdır (çağıranın sınıfında).
 */
export function resendDisabledClass(countingDown: boolean): string {
  return countingDown ? "disabled:cursor-default" : "disabled:opacity-50";
}
