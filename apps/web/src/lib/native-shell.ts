/**
 * Mobil kabuk (Capacitor, `mobile/`) köprüsü — saf kısım.
 *
 * Kabuk canlı siteyi kendi WebView'inde açar ve yerel köprüyü `window.Capacitor`
 * olarak sayfaya kendisi enjekte eder; web paketine Capacitor bağımlılığı
 * girmez. Tarayıcıda `window.Capacitor` yoktur ve bu dosyadaki hiçbir şey çalışmaz.
 */

/** Yerel dinleyicinin kaldırma tutamacı. */
export interface NativeListenerHandle {
  remove: () => void | Promise<void>;
}

/**
 * `addListener` dönüşü. Sayfa `@capacitor/core` taşımadığı için eklentiler
 * kabuğun enjekte ettiği ESKİ biçimdedir (`window.Capacitor.Plugins.X`): orada
 * `addListener` tutamacı SÖZ DEĞİL, doğrudan döner (`native-bridge.js`
 * `cap.addListener`). Çekirdek paketin biçimi ise söz döner — ikisi de kabul.
 */
export type NativeListenerResult = NativeListenerHandle | Promise<NativeListenerHandle>;

/** Kabuğun `App` eklentisinden kullandığımız kadarı. */
export interface NativeAppPlugin {
  addListener(event: "appUrlOpen", listener: (data: { url?: string }) => void): NativeListenerResult;
  getLaunchUrl(): Promise<{ url?: string } | undefined>;
}

interface NativeBridge {
  isNativePlatform?: () => boolean;
  Plugins?: { App?: NativeAppPlugin };
}

/** Sayfa kabuğun içindeyse `App` eklentisi, değilse null. */
export function nativeAppPlugin(win: object | undefined): NativeAppPlugin | null {
  try {
    const bridge = (win as { Capacitor?: NativeBridge } | undefined)?.Capacitor;
    if (!bridge?.isNativePlatform?.()) return null;
    return bridge.Plugins?.App ?? null;
  } catch {
    return null;
  }
}

/**
 * Yerel dinleyiciyi kurar; dönen kaldırıcı her an güvenle çağrılır (tutamaç
 * henüz gelmediyse geldiğinde kaldırılır). Hiçbir yolda fırlatmaz.
 * `ready` dinleyici kurulunca (ya da kurulamayınca) çözülür.
 */
export function nativeListener(attach: () => NativeListenerResult): {
  ready: Promise<void>;
  remove: () => void;
} {
  let disposed = false;
  let handle: NativeListenerHandle | undefined;
  const drop = (h: NativeListenerHandle) => {
    try {
      void Promise.resolve(h.remove()).catch(() => {});
    } catch {
      // Kaldırılamayan dinleyici: yapılacak bir şey yok.
    }
  };
  let ready: Promise<void>;
  try {
    ready = Promise.resolve(attach()).then(
      (h) => {
        if (!h || typeof h.remove !== "function") return;
        if (disposed) drop(h);
        else handle = h;
      },
      () => {},
    );
  } catch {
    ready = Promise.resolve();
  }
  return {
    ready,
    remove: () => {
      disposed = true;
      if (handle) drop(handle);
      handle = undefined;
    },
  };
}

/**
 * Uygulamaya devredilen bağlantının (e-postadaki davet, talep adresi) WebView'de
 * açılacak adresi. Yalnız AYNI kökendeki sayfalar kabul edilir: başka köken
 * (staging bağlantısı canlı uygulamada, yabancı site) ve rota işleyicileri
 * (`/api/*`) açılmaz; zaten açık olan adres yeniden yüklenmez.
 */
export function deepLinkTarget(url: string | undefined, currentHref: string): string | null {
  if (!url) return null;
  let target: URL;
  let current: URL;
  try {
    current = new URL(currentHref);
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.origin !== current.origin) return null;
  if (/^\/(api|_next)(\/|$)/.test(target.pathname)) return null;
  if (target.href === current.href) return null;
  return target.href;
}
