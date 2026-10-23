/**
 * UYGULAMA İÇİ GEZİNME İZİ (arayüz testi D-156).
 *
 * "Geri" bağlantıları `document.referrer`a bakıyordu; istemci tarafı
 * (SPA) gezinmede referrer DEĞİŞMEZ → yeni sekmede Firmalar'dan bir firmaya
 * tıklayan kullanıcı "Geri" yerine sabit "← Bağlantılar" görüyordu.
 *
 * Kural: oturumun GİRİŞİNDE (sekmede ilk açılan panel sayfası) tarayıcı
 * geçmişinin uzunluğu kaydedilir; geçmiş o andan sonra BÜYÜDÜYSE (push) bu
 * belgenin içinde geri dönülecek bir panel girdisi vardır → `router.back()`
 * güvenli. Adres karşılaştırması YETMEZ: `router.replace` (dil yönlendirmesi
 * `/en/company/companies/X` → `/company/firma/X`, filtre/sorgu eşitlemesi)
 * adresi değiştirir ama geçmişe girdi EKLEMEZ — adres farkına bakınca "Geri"
 * sekmenin önceki girdisine (başka site / about:blank) çıkarıyordu (arayüz
 * testi webA-04 yeniden doğrulama). Tersi yönde yanılma (ileri geçmişi
 * kesen push uzunluğu büyütmez) güvenli tarafa düşer: sabit Bağlantılar
 * bağlantısı.
 *
 * Kabuk (`noteNavigation`) her adres değişiminde çağırır; kabuktan önce
 * çizilen çocuk bileşen (çocuk efektleri ebeveynden önce koşar)
 * `cameFromInApp()` içinde girişi kendisi işaretler.
 */
let entryLength: number | null = null;

function historyLength(): number | null {
  if (typeof window === "undefined") return null;
  return window.history.length;
}

/** Girişi bir kez kaydeder (idempotent). */
export function markNavEntry(): void {
  if (entryLength === null) entryLength = historyLength();
}

/** Adres değişince çağrılır (kabuk): girişin kaydedildiğinden emin olur. */
export function noteNavigation(): void {
  markNavEntry();
}

/** Bu sayfaya uygulamanın içinden mi gelindi (tarayıcı geçmişinde geri dönülecek panel adresi var mı)? */
export function cameFromInApp(): boolean {
  markNavEntry();
  const now = historyLength();
  return entryLength !== null && now !== null && now > entryLength;
}

/** Yalnız testler için. */
export function resetNavHistoryForTest(): void {
  entryLength = null;
}
