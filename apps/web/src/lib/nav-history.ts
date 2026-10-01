/**
 * UYGULAMA İÇİ GEZİNME İZİ (arayüz testi D-156).
 *
 * "Geri" bağlantıları `document.referrer`a bakıyordu; istemci tarafı
 * (SPA) gezinmede referrer DEĞİŞMEZ → yeni sekmede Firmalar'dan bir firmaya
 * tıklayan kullanıcı "Geri" yerine sabit "← Bağlantılar" görüyordu.
 *
 * Kural: oturumun GİRİŞ adresi (sekmede ilk açılan panel adresi) kaydedilir;
 * şu anki adres girişten farklıysa ya da giriş sonrasında başka bir adrese
 * gidilmişse kullanıcı uygulamanın içinden gelmiştir → `router.back()` güvenli.
 * Kabuk (`markNavEntry` + `noteNavigation`) her adres değişiminde çağırır;
 * kabuktan önce çizilen çocuk bileşen (çocuk efektleri ebeveynden önce koşar)
 * `cameFromInApp()` içinde girişi kendisi işaretler — doğrudan açılan sayfada
 * giriş = kendisi olur.
 */
let entry: string | null = null;
let navigated = false;

function currentHref(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.pathname + window.location.search;
}

/** Girişi bir kez kaydeder (idempotent). */
export function markNavEntry(): void {
  if (entry === null) entry = currentHref();
}

/** Adres değişince çağrılır: girişten farklı bir adrese gidildiyse işaretler. */
export function noteNavigation(): void {
  markNavEntry();
  const here = currentHref();
  if (entry !== null && here !== null && here !== entry) navigated = true;
}

/** Bu sayfaya uygulamanın içinden mi gelindi (tarayıcı geçmişinde geri dönülecek panel adresi var mı)? */
export function cameFromInApp(): boolean {
  markNavEntry();
  return navigated || (entry !== null && currentHref() !== entry);
}

/** Yalnız testler için. */
export function resetNavHistoryForTest(): void {
  entry = null;
  navigated = false;
}
