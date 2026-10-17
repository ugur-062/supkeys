/**
 * Mobil kabukta anlık bildirim (FCM) köprüsü — saf kısım.
 *
 * Web paketine Capacitor bağımlılığı GİRMEZ: `PushNotifications` eklentisi
 * kabuğun WebView'e enjekte ettiği `window.Capacitor`'dan okunur (bkz.
 * `native-shell.ts`). Tarayıcıda köprü yoktur; buradaki okuyucular null döner.
 *
 * Cihaz belirteci `localStorage`da tutulur: çıkışta sunucudan silinmesi
 * (`/company-auth/push-devices/unregister`) için bu cihazın hangi belirteci
 * kaydettiğini bilmek gerekir. Depo kapalıysa (gizli pencere, engelli site
 * verisi) okuma null, yazma sessizce atlanır.
 */
import { resolveApiBaseUrl } from "./resolve-api-url";
import { deepLinkTarget, type NativeListenerResult } from "./native-shell";

/** Bu cihazın sunucuya kaydettiği FCM belirteci. */
export const PUSH_TOKEN_KEY = "rothern:push-token";

/**
 * Sunucudan silinmesi BEKLENEN belirteç: çıkışta ya da oturum düşünce silme
 * isteği 2xx ile dönmediyse (ağ hatası, yanıt gelmeden sayfa değişti) burada
 * kalır ve sonraki sayfa yüklemesinde `NativeShellBridge` yeniden dener. Aynı
 * belirteç yeniden kaydedilince (yeni giriş) bekleyen silinir.
 */
export const PUSH_UNREGISTER_PENDING_KEY = "rothern:push-unregister";

/** Cihaz kaydı ucu (API `modules/push`, `CompanyJwtAuthGuard`). */
export const PUSH_DEVICES_PATH = "/company-auth/push-devices";

/** Cihaz silme ucu — oturum istemez (oturum düşmüşken de çalışır). */
export const PUSH_UNREGISTER_PATH = "/company-auth/push-devices/unregister";

/**
 * Bu sayfadaki cihaz istekleri sıralıdır: kayıt ile silme sunucuya gönderildiği
 * sırayla ulaşsın diye her istek öncekinin bitmesini en çok bu kadar bekler
 * (askıda kalan istek sonrakini sonsuza dek tutmasın).
 */
export const PUSH_REQUEST_ORDER_WAIT_MS = 2000;

/**
 * "Bu uygulama açılışında kayıt akışı bu kullanıcı için başladı" işareti
 * (`sessionStorage` = WebView oturumu ≈ uygulama açılışı). Tam sayfa
 * yüklemelerinde (dil değişimi, devredilen bağlantı) izin / kayıt yeniden
 * koşmasın; çıkışta `clearPushToken` siler, aynı kişi yeniden girince akış
 * yeniden koşar.
 */
export const PUSH_SESSION_KEY = "rothern:push-session";

/** Android bildirim kanalı — sunucu FCM iletisinde aynı kimliği verir. */
export const PUSH_CHANNEL_ID = "default";

/** Sunucunun kabul ettiği en uzun belirteç (DTO ile aynı). */
export const PUSH_TOKEN_MAX_LENGTH = 4096;

export type NativePushPlatform = "android" | "ios";

/** Capacitor `PermissionState` (`prompt-with-rationale` = Android'de bir kez reddedildi). */
export type PushPermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";

export interface NativePushNotification {
  title?: string;
  body?: string;
  data?: unknown;
}

export interface NativePushAction {
  actionId?: string;
  notification?: NativePushNotification;
}

export interface NativePushChannel {
  id: string;
  name: string;
  description?: string;
  importance?: 0 | 1 | 2 | 3 | 4 | 5;
  vibration?: boolean;
}

/** Kabuğun `PushNotifications` eklentisinden kullandığımız kadarı. */
export interface NativePushPlugin {
  checkPermissions(): Promise<{ receive?: PushPermissionState } | undefined>;
  requestPermissions(): Promise<{ receive?: PushPermissionState } | undefined>;
  register(): Promise<void>;
  /** Yalnız Android 8+; iOS'ta ve eski Android'de çağrılmaz / reddeder. */
  createChannel?(channel: NativePushChannel): Promise<void>;
  addListener(event: "registration", listener: (token: { value?: string }) => void): NativeListenerResult;
  addListener(event: "registrationError", listener: (error: { error?: string }) => void): NativeListenerResult;
  addListener(
    event: "pushNotificationReceived",
    listener: (notification: NativePushNotification) => void,
  ): NativeListenerResult;
  addListener(
    event: "pushNotificationActionPerformed",
    listener: (action: NativePushAction) => void,
  ): NativeListenerResult;
}

interface PushBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: { PushNotifications?: NativePushPlugin };
}

export interface NativePush {
  plugin: NativePushPlugin;
  platform: NativePushPlatform;
}

/**
 * Sayfa kabuğun içindeyse bildirim eklentisi ve platform; değilse null.
 * Köprü YALNIZ `isNativePlatform()` true iken okunur (tarayıcıda, eklentisi
 * kurulmamış eski kabukta ya da bilinmeyen platformda null).
 */
export function nativePush(win: object | undefined): NativePush | null {
  try {
    const bridge = (win as { Capacitor?: PushBridge } | undefined)?.Capacitor;
    if (!bridge?.isNativePlatform?.()) return null;
    const plugin = bridge.Plugins?.PushNotifications;
    if (!plugin) return null;
    const platform = bridge.getPlatform?.();
    if (platform !== "android" && platform !== "ios") return null;
    return { plugin, platform };
  } catch {
    return null;
  }
}

/** Kayıt olayındaki belirteç — boş ya da sunucu sınırını aşan değer null. */
export function pushTokenValue(token: { value?: unknown } | null | undefined): string | null {
  const value = typeof token?.value === "string" ? token.value.trim() : "";
  if (!value || value.length > PUSH_TOKEN_MAX_LENGTH) return null;
  return value;
}

/**
 * Bildirime dokunulunca açılacak adres: iletinin `data.url`'i, devredilen
 * bağlantıyla AYNI kuralla (`deepLinkTarget`: yalnız aynı köken, `/api` ve
 * `/_next` hariç, zaten açık adres yeniden yüklenmez).
 */
export function pushActionTarget(action: NativePushAction | null | undefined, currentHref: string): string | null {
  const data = action?.notification?.data;
  if (!data || typeof data !== "object") return null;
  const url = (data as { url?: unknown }).url;
  return typeof url === "string" ? deepLinkTarget(url, currentHref) : null;
}

function localStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Bu cihazın kaydettiği belirteç (yoksa ya da depo kapalıysa null). */
export function readPushToken(): string | null {
  try {
    const value = localStore()?.getItem(PUSH_TOKEN_KEY);
    return value ? value : null;
  } catch {
    return null;
  }
}

export function storePushToken(token: string): void {
  try {
    localStore()?.setItem(PUSH_TOKEN_KEY, token);
  } catch {
    // Depo kapalı: çıkışta silinecek belirteç bilinmez; sunucu geçersiz belirteci kendisi temizler.
  }
}

/** Belirteci ve açılış işaretini siler (çıkış, hesap silme). */
export function clearPushToken(): void {
  try {
    localStore()?.removeItem(PUSH_TOKEN_KEY);
  } catch {
    // yok say
  }
  try {
    sessionStore()?.removeItem(PUSH_SESSION_KEY);
  } catch {
    // yok say
  }
}

/**
 * Oturum işaretinin "akış bitti" biçimi (belirteç yazıldı, izin verilmedi ya
 * da kayıt hatası). Başlamış ama bitmemiş akış — `register()`dan sonra
 * belirteç gelmeden tam yükleme (söküm koşmaz) — sonraki yüklemede yeniden
 * kayıt ister; biten akış istemez.
 */
const FINISHED_PREFIX = "done:";

function sessionMarker(): string | null {
  try {
    return sessionStore()?.getItem(PUSH_SESSION_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Bu uygulama açılışında akış bu kullanıcı için zaten başladı mı (bitmiş ya da değil)? */
export function pushStartedThisSession(userId: string): boolean {
  const marker = sessionMarker();
  return marker === userId || marker === `${FINISHED_PREFIX}${userId}`;
}

/** Bu açılışta akış bu kullanıcı için BİTTİ mi? */
export function pushFinishedThisSession(userId: string): boolean {
  return sessionMarker() === `${FINISHED_PREFIX}${userId}`;
}

export function markPushFinished(userId: string): void {
  try {
    sessionStore()?.setItem(PUSH_SESSION_KEY, `${FINISHED_PREFIX}${userId}`);
  } catch {
    // Depo kapalı: işaret hiç tutulmaz, akış her tam yüklemede yeniden koşar.
  }
}

export function markPushStarted(userId: string): void {
  try {
    sessionStore()?.setItem(PUSH_SESSION_KEY, userId);
  } catch {
    // Depo kapalı: akış her tam yüklemede yeniden koşar (izin sorusu zaten bir kez çıkar).
  }
}

/** Akış yarıda kaldıysa (bileşen söküldü, kayıt isteği düştü) sonraki yüklemede yeniden koşsun. */
export function unmarkPushStarted(userId: string): void {
  try {
    const store = sessionStore();
    const marker = store?.getItem(PUSH_SESSION_KEY);
    if (marker === userId || marker === `${FINISHED_PREFIX}${userId}`) store?.removeItem(PUSH_SESSION_KEY);
  } catch {
    // yok say
  }
}

function readPendingPushUnregister(): string | null {
  try {
    const value = localStore()?.getItem(PUSH_UNREGISTER_PENDING_KEY);
    return value ? value : null;
  } catch {
    return null;
  }
}

/** Bekleyen silme bu belirteç içinse kaldırılır (başkası yazıldıysa dokunulmaz). */
export function clearPendingPushUnregister(token: string): void {
  try {
    const store = localStore();
    if (store?.getItem(PUSH_UNREGISTER_PENDING_KEY) === token) store.removeItem(PUSH_UNREGISTER_PENDING_KEY);
  } catch {
    // yok say
  }
}

/** Bu sayfadaki son cihaz isteği (kayıt ya da silme) — bitince null. */
let lastDeviceRequest: Promise<void> | null = null;

/**
 * Cihaz isteğini sıraya koyar: önceki istek (en çok `PUSH_REQUEST_ORDER_WAIT_MS`)
 * bitmeden gönderilmez. Böylece çıkışın silmesi, sürmekte olan kaydın ARKASINDAN
 * sunucuya varır (yoksa geç gelen kayıt satırı çıkan kişiye yeniden bağlardı).
 */
export function runPushDeviceRequest<T>(send: () => Promise<T>): Promise<T> {
  const previous = lastDeviceRequest;
  return trackDeviceRequest(
    (previous ? settledWithin(previous, PUSH_REQUEST_ORDER_WAIT_MS) : Promise.resolve()).then(send),
  );
}

/** İsteği sıranın sonuna yazar; bitince (başarılı ya da değil) sıra boşalır. */
function trackDeviceRequest<T>(run: Promise<T>): Promise<T> {
  const tracked = run.then(
    () => undefined,
    () => undefined,
  );
  lastDeviceRequest = tracked;
  void tracked.then(() => {
    if (lastDeviceRequest === tracked) lastDeviceRequest = null;
  });
  return run;
}

/** Yalnız testler için: sayfa düzeyindeki istek sırasını sıfırlar. */
export function resetPushDeviceRequests(): void {
  lastDeviceRequest = null;
}

function settledWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    promise.then(done, done);
  });
}

/**
 * Silme isteği `fetch` + `keepalive` ile gider: çıkış ve oturum düşmesi hemen
 * ardından sayfayı değiştirir, axios isteği o anda iptal olurdu. Çerez
 * gönderilmez (uç oturum istemez; tek kimlik gövdedeki belirteç). Yalnız 2xx
 * true; hiçbir yolda fırlatmaz.
 */
export async function sendPushUnregister(token: string): Promise<boolean> {
  try {
    const base = resolveApiBaseUrl();
    if (!base) return false;
    const response = await fetch(`${base}${PUSH_UNREGISTER_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      keepalive: true,
      credentials: "omit",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Bu cihazı sunucudan bırakır (çıkış, oturum düşmesi). Belirteç EŞZAMANLI
 * olarak "silinmeyi bekliyor" anahtarına taşınır, etkin belirteç ve açılış
 * işareti silinir — istek yanıtlanmadan sayfa değişse de sonraki yükleme
 * yeniden dener; bekleyen yalnız 2xx ile kalkar.
 *
 * `ordered`: sürmekte olan cihaz isteğinin (kayıt) ardından gönder (çıkış
 * kancası bekleyebilir). Oturum düşmesinde istek HEMEN gider (sayfa hemen
 * değişir; oturum geçersiz olduğundan süren kayıt zaten reddedilir).
 * Belirteç yoksa (tarayıcı) hiçbir şey yapmaz ve true döner.
 */
export function releasePushToken(
  token: string | null = readPushToken(),
  { ordered = false }: { ordered?: boolean } = {},
): Promise<boolean> {
  if (!token) return Promise.resolve(true);
  try {
    localStore()?.setItem(PUSH_UNREGISTER_PENDING_KEY, token);
  } catch {
    // Depo kapalı: yeniden deneme olmaz; sunucu geçersiz belirteci kendisi temizler.
  }
  clearPushToken();
  const send = () => sendPushUnregister(token);
  // Sırasız gönderim de sıraya yazılır: sonraki kayıt bu silmenin ardından gider.
  return (ordered ? runPushDeviceRequest(send) : trackDeviceRequest(send())).then((ok) => {
    if (ok) clearPendingPushUnregister(token);
    return ok;
  });
}

/**
 * Önceki çıkışta / oturum düşmesinde silinemeyen belirteci yeniden dener (kök
 * düzen, sayfa yüklemesi başına). Güvenli: bekleyen belirteç ancak o günden beri
 * bu cihazda yeniden KAYDEDİLMEDİYSE durur (kayıt başarısı onu siler) ve sonraki
 * kayıt bu isteğin ardından gider. Yoksa hiçbir şey yapmaz.
 */
export function retryPendingPushUnregister(): Promise<boolean> {
  const token = readPendingPushUnregister();
  if (!token) return Promise.resolve(true);
  return runPushDeviceRequest(() => sendPushUnregister(token)).then((ok) => {
    if (ok) clearPendingPushUnregister(token);
    return ok;
  });
}
