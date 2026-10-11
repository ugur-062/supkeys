/**
 * PANEL API SAĞLIK SİNYALİ (2026-10-09, canlı doğrulama OUT-1).
 *
 * "Sunucuya şu anda ulaşılamıyor" notu (`company-shell/service-notice.tsx`)
 * eskiden yalnız kabuğun `/me` sorgusuna bakıyordu; o sorgu sayfa yüklemesinde
 * BİR kez koşar. Panel açıkken API giderse (uyuyan staging API'si) `/me` hiç
 * sorulmuyor, not hiç çıkmıyordu: kullanıcı genel hata kartı ya da bitmeyen
 * iskelet görüyor, API dönünce de hiçbir şey kendiliğinden toparlanmıyordu.
 *
 * Bu modül panelin İSTEKLERİNİN yaşadığını tek yerde toplar. `companyApi`
 * interceptor'ları bildirir (`lib/company-auth/api.ts`), not dinler:
 *  - istek YANITSIZ bitti (ağ hatası / zaman aşımı) ya da 502 · 503 · 504 aldı,
 *    ya da `SERVICE_SLOW_AFTER_MS` boyunca yanıtsız kaldı → ŞÜPHE
 *    (`suspectServiceOutage`): TEK `/me` yoklaması atılır — aynı anda düşen on
 *    istek bir yoklamayı paylaşır;
 *  - yoklama da düşerse (yanıt yok / 502 · 503 · 504) durum "ulaşılamıyor" olur,
 *    dinleyenler haberdar edilir;
 *  - API'den gelen HER yanıt (2xx, 4xx, 500) "ulaşılıyor" demektir: durum
 *    temizlenir (`reportServiceReachable`).
 *
 * 4xx şüphe DOĞURMAZ (yetki, doğrulama, bulunamadı — API ayakta). Dinleyen yoksa
 * (not çizilmeyen sayfa: giriş, kayıt) yoklama da durum da yok. Gizli sekmede
 * yoklama atılmaz; sekme görünür olunca atılır.
 */

/** İstek bu kadar yanıtsız kalırsa şüphe doğar (ms). */
export const SERVICE_SLOW_AFTER_MS = 6_000;

/** Yoklama (`/me`) bu kadar yanıtsız kalırsa düşmüş sayılır (ms). */
export const SERVICE_PROBE_TIMEOUT_MS = 4_000;

type Listener = () => void;

const listeners = new Set<Listener>();
let unreachable = false;
let probe: (() => Promise<unknown>) | null = null;
let inFlight: Promise<boolean> | null = null;
/** Son dinleyen ayrılınca artar: yarıda kalan yoklamanın sonucu yazılmaz. */
let epoch = 0;
/** Her "ulaşılıyor" bildiriminde artar: bekleyen şüphe düşer. */
let reachableSeq = 0;
const slowTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();

const emit = () => {
  for (const listener of [...listeners]) listener();
};

/**
 * Kesinti belirtisi mi: yanıt yok (ağ hatası / zaman aşımı) ya da geçit hatası
 * (502 · 503 · 504). İptal edilen istek (sorgu `signal`i) belirti DEĞİLDİR;
 * 4xx ve 500 de değil — API yanıt verdi.
 */
export function isServiceFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { response?: { status?: number }; code?: string; __CANCEL__?: boolean };
  if (e.code === "ERR_CANCELED" || e.__CANCEL__ === true) return false;
  const status = e.response?.status;
  return status === undefined || status === 502 || status === 503 || status === 504;
}

/** Yoklamayı `companyApi` kaydeder (döngüsel içe aktarma olmasın diye burada değil). */
export function registerServiceProbe(fn: () => Promise<unknown>): void {
  probe = fn;
}

/** `useSyncExternalStore` aboneliği. Son dinleyen ayrılınca durum unutulur. */
export function subscribeServiceHealth(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    unreachable = false;
    epoch += 1;
  };
}

/** Şu anki durum: yoklama düştü ve o günden beri API'den yanıt gelmedi. */
export function isServiceUnreachable(): boolean {
  return unreachable;
}

/** API bir yanıt verdi (2xx / 4xx / 500) → ulaşılıyor. */
export function reportServiceReachable(): void {
  reachableSeq += 1;
  if (!unreachable) return;
  unreachable = false;
  emit();
}

function whenVisible(): Promise<void> {
  if (typeof document === "undefined" || document.visibilityState !== "hidden") return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.visibilityState === "hidden") return;
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    };
    document.addEventListener("visibilitychange", onChange);
  });
}

async function runProbe(run: () => Promise<unknown>): Promise<boolean> {
  const startedEpoch = epoch;
  const startedSeq = reachableSeq;
  await whenVisible();
  // Beklerken dinleyen kalmadı ya da API yanıt verdi → şüphe düştü.
  if (epoch !== startedEpoch || reachableSeq !== startedSeq) return false;
  let down = false;
  try {
    await run();
  } catch (err) {
    down = isServiceFailure(err);
  }
  // Yoklama sürerken başka bir istek yanıt aldıysa API ayakta: yanlış alarm.
  if (!down || epoch !== startedEpoch || reachableSeq !== startedSeq) return false;
  unreachable = true;
  emit();
  return true;
}

/**
 * Bir istek kesinti belirtisi gösterdi. Sonuç: API'ye ulaşılamıyor mu?
 *  - zaten "ulaşılamıyor" → `true`, yoklama yok;
 *  - dinleyen yok → `false`, yoklama yok;
 *  - aksi hâlde TEK yoklama (uçuştaki paylaşılır) ve onun sonucu.
 */
export function suspectServiceOutage(): Promise<boolean> {
  if (unreachable) return Promise.resolve(true);
  if (listeners.size === 0 || !probe) return Promise.resolve(false);
  if (!inFlight) {
    const flight: Promise<boolean> = runProbe(probe).finally(() => {
      if (inFlight === flight) inFlight = null;
    });
    inFlight = flight;
  }
  return inFlight;
}

/** İstek yola çıktı: `SERVICE_SLOW_AFTER_MS` yanıtsız kalırsa şüphe doğar. */
export function trackServiceRequest(key: object): void {
  settleServiceRequest(key);
  slowTimers.set(
    key,
    setTimeout(() => {
      slowTimers.delete(key);
      void suspectServiceOutage();
    }, SERVICE_SLOW_AFTER_MS),
  );
}

/** İstek bitti (yanıt ya da hata): yanıtsızlık sayacı kapanır. */
export function settleServiceRequest(key: object | undefined | null): void {
  if (!key) return;
  const timer = slowTimers.get(key);
  if (timer === undefined) return;
  clearTimeout(timer);
  slowTimers.delete(key);
}

/** Yalnız testler için: dinleyenler dahil her şeyi sıfırlar. */
export function resetServiceHealthForTests(): void {
  listeners.clear();
  unreachable = false;
  inFlight = null;
  epoch += 1;
  reachableSeq = 0;
}
