/**
 * PROGRAMLA GEZİNMEDEN ÖNCE "AYRILAYIM MI" (mobil kabuk 2026-10).
 *
 * Kaydedilmemiş değişiklik koruması (`hooks/use-unsaved-changes-guard.ts`)
 * uygulama içi bağlantı tıklamalarını kendi yakalar; yeni sekme bağlantısını
 * ise bilerek geçirir (sayfa yerinde kalır). Mobil kabukta aynı kökendeki yeni
 * sekme bağlantısı aynı WebView'de açılır (`NativeShellBridge`) — o yol
 * gezinmeden önce buradaki kontrolleri sorar. Kirli form kontrolünü kayıt
 * eder, temizlenince kaydı kaldırır.
 */

/** `true` = ayrılmaya izin; `false` = kal. */
export type LeaveCheck = () => boolean | Promise<boolean>;

const checks = new Set<LeaveCheck>();

/** Kontrolü ekler; dönen işlev kaydı kaldırır. */
export function registerLeaveCheck(check: LeaveCheck): () => void {
  checks.add(check);
  return () => {
    checks.delete(check);
  };
}

/** Kayıtlı her kontrol izin verirse `true` (kontrol yoksa hemen). Hata = kal. */
export async function confirmAppLeave(): Promise<boolean> {
  for (const check of Array.from(checks)) {
    try {
      if (!(await check())) return false;
    } catch {
      return false;
    }
  }
  return true;
}
