/**
 * "HESABINIZ SİLİNDİ" ONAYI SAYFA YÜKLEMESİNİ AŞAR (inceleme 2026-10-16).
 *
 * Hesap silindikten sonra giriş sayfası TAM sayfa yüklemesiyle açılır (istemci
 * durumu sıfırlansın diye); sonner bildirimi bellekte yaşadığı için yükleme
 * anında kayboluyordu — onay ekranda ancak bir an görünüyordu. Oysa
 * `/hesap-silme` ("ekranda “Hesabınız silindi” bildirimi görünür") ve Apple
 * 5.1.1(v) ("silme tamamlanınca onay verin") bir onay vaat ediyor.
 *
 * Silme formu yönlendirmeden hemen önce bu işareti yazar, giriş sayfası bir
 * kez okuyup siler ve kalıcı bir bilgi kutusu çizer. Adres parametresi DEĞİL:
 * `?deleted=1` gibi bir bağlantıyı herkes üretip birine "hesabınız silindi"
 * yazdırabilirdi; sekmeye bağlı depo yalnız silmeyi yapan sekmede vardır.
 * Önek `TENANT_SESSION_PREFIXES`te DEĞİL: işaret oturum temizliğinden SONRA
 * yazılır ve giriş sayfasında tüketilir.
 */
const KEY = "rothern.account-deleted-notice";

/** Silme başarılı: giriş sayfası açılınca onay gösterilsin. */
export function rememberAccountDeleted(): void {
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    /* depolama kapalı: onay yalnız yönlendirme öncesindeki bildirimde kalır */
  }
}

/** Giriş sayfası: işaret varsa true döner ve işareti siler (onay bir kez). */
export function takeAccountDeletedNotice(): boolean {
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (value !== null) window.sessionStorage.removeItem(KEY);
    return value === "1";
  } catch {
    return false;
  }
}
