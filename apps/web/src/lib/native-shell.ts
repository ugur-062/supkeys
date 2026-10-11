/**
 * Mobil kabuk (Capacitor, `mobile/`) köprüsü — saf kısım.
 *
 * Kabuk canlı siteyi kendi WebView'inde açar ve yerel köprüyü `window.Capacitor`
 * olarak sayfaya kendisi enjekte eder; web paketine Capacitor bağımlılığı
 * girmez. Tarayıcıda `window.Capacitor` yoktur ve bu dosyadaki hiçbir şey çalışmaz.
 */

/** Kabuğun `App` eklentisinden kullandığımız kadarı. */
export interface NativeAppPlugin {
  addListener(
    event: "appUrlOpen",
    listener: (data: { url?: string }) => void,
  ): Promise<{ remove: () => void | Promise<void> }>;
  getLaunchUrl(): Promise<{ url?: string } | undefined>;
}

interface NativeBridge {
  isNativePlatform?: () => boolean;
  Plugins?: { App?: NativeAppPlugin };
}

/** Sayfa kabuğun içindeyse `App` eklentisi, değilse null. */
export function nativeAppPlugin(win: object | undefined): NativeAppPlugin | null {
  const bridge = (win as { Capacitor?: NativeBridge } | undefined)?.Capacitor;
  if (!bridge?.isNativePlatform?.()) return null;
  return bridge.Plugins?.App ?? null;
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
