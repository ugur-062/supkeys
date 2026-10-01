/**
 * Rapor kriterleri ADRESTE (arayüz testi D-293): rapor sonucu bir mutasyon
 * yanıtıdır, sayfa durumu bellekte durur. Rapor satırından talebe gidip
 * Geri'ye basınca bileşen yeniden bağlanıyor, kriterler ve sonuç
 * kayboluyordu. "Raporu Oluştur" kriterleri sorguya yazar (geçmiş kaydı
 * DEĞİŞTİRİLİR, yeni kayıt açılmaz); sayfa açılışta sorguyu okuyup raporu
 * yeniden üretir.
 *
 * `window.history.replaceState` Next app router'ın desteklediği yoldur
 * (yönlendirici adresi senkron tutar); sorgu efektte `window`dan okunur.
 */
export type ReportQueryValue = string | boolean | null | undefined;

/** Geçerli adresin sorgusu (sunucuda / pencere yokken boş). */
export function readReportQuery(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

/** Kriterleri sorguya yazar; boş/false değerler adrese düşmez. */
export function writeReportQuery(values: Record<string, ReportQueryValue>): void {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value == null || value === "" || value === false) continue;
    q.set(key, value === true ? "1" : value);
  }
  const qs = q.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", url);
}

/** Tarih girdisi değeri (YYYY-MM-DD) mi — adresten gelen değer süzülür. */
export function isDayValue(value: string | null): value is string {
  return value != null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Ters aralık: iki gün de doluysa bitiş başlangıçtan önce mi (D-113). */
export function isInvertedRange(start: string, end: string): boolean {
  return start.length > 0 && end.length > 0 && end < start;
}
