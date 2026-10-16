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

/**
 * Kabuğun kullanıcı aracısı eki (`mobile/capacitor.config.ts` `appendUserAgent`).
 * Köprü (`window.Capacitor`) henüz enjekte edilmemişken de kabuk tanınır.
 */
export const SHELL_USER_AGENT_MARK = "RothernApp/";

/** Sayfa mobil kabuğun (Capacitor WebView) içinde mi? Tarayıcıda false. */
export function isNativeShell(win: object | undefined): boolean {
  try {
    const w = win as { Capacitor?: NativeBridge; navigator?: { userAgent?: string } } | undefined;
    if (w?.Capacitor?.isNativePlatform?.()) return true;
    return (w?.navigator?.userAgent ?? "").includes(SHELL_USER_AGENT_MARK);
  } catch {
    return false;
  }
}

/** Kabuğun `Browser` eklentisinden (uygulama içi tarayıcı) kullandığımız kadarı. */
export interface NativeBrowserPlugin {
  open(options: { url: string }): Promise<void> | void;
}

/** Sayfa kabuğun içindeyse ve kabuk `Browser` eklentisini taşıyorsa eklenti, değilse null. */
export function nativeBrowserPlugin(win: object | undefined): NativeBrowserPlugin | null {
  try {
    const bridge = (win as { Capacitor?: NativeBridge & { Plugins?: { Browser?: NativeBrowserPlugin } } } | undefined)
      ?.Capacitor;
    if (!bridge?.isNativePlatform?.()) return null;
    const browser = bridge.Plugins?.Browser;
    return browser && typeof browser.open === "function" ? browser : null;
  } catch {
    return null;
  }
}

/**
 * Bu öznitelikle işaretli yeni sekme bağlantısı kabukta WebView'de DEĞİL
 * uygulama içi tarayıcıda açılır: yarım kalmış formun üstünde okunacak
 * herkese açık belge (kayıt ve davet kabulündeki sözleşme bağlantıları) —
 * WebView'de açılsaydı form (şifreler dahil) kaybolurdu.
 */
export const SHELL_BROWSER_ATTR = "data-shell-browser";

/** Bağlantı tıklamasının kararı için gereken alanlar (`MouseEvent` uyar). */
export interface ShellLinkClick {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

/**
 * Kabukta yeni pencere bağlantısının akıbeti:
 * - `same-window`: aynı kökendeki sayfa — WebView'de açılır (`path` = ham
 *   yol + sorgu + çapa; dil ön eki zaten içinde, yeniden eklenmez);
 * - `in-app-browser`: `SHELL_BROWSER_ATTR` işaretli aynı köken sayfası.
 */
export type ShellLinkAction =
  | { kind: "same-window"; href: string; path: string }
  | { kind: "in-app-browser"; href: string };

/** Sayfa olmayan aynı köken adresi (rota işleyicisi, Next varlığı, dosya). */
function isAppPagePath(pathname: string): boolean {
  if (/^\/(api|_next)(\/|$)/.test(pathname)) return false;
  if (pathname.startsWith("/.well-known/")) return false;
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  return !/\.[a-z0-9]{1,8}$/i.test(last);
}

/**
 * MOBİL KABUKTA YENİ PENCERE BAĞLANTISI (mobil denetim 2026-10 g05): iOS
 * kabuğu `target="_blank"` bağlantıyı Safari'de açar (Capacitor
 * `createWebViewWith` → `UIApplication.open`) — orada panel oturumu yoktur,
 * kullanıcı giriş sayfasına düşer; Android aynı adresi WebView'de baştan
 * yükler (liste konumu kaybolur). Aynı kökendeki sayfa bağlantısı kabukta
 * aynı WebView'de açılır; dış köken (`_blank` → işletim sisteminin
 * tarayıcısı), rota işleyicisi / dosya, indirme, değiştirici tuşlu ya da
 * başka bir dinleyicinin işlediği tıklama DOKUNULMADAN geçer (null).
 */
export function shellLinkAction(click: ShellLinkClick, currentHref: string): ShellLinkAction | null {
  if (click.defaultPrevented || click.button !== 0) return null;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null;
  const start = click.target as { closest?: (selector: string) => Element | null } | null;
  const anchor = typeof start?.closest === "function" ? start.closest("a[href]") : null;
  if (!anchor || anchor.hasAttribute("download")) return null;
  const target = (anchor.getAttribute("target") ?? "").trim().toLowerCase();
  if (target === "" || target === "_self" || target === "_top" || target === "_parent") return null;
  let url: URL;
  let current: URL;
  try {
    current = new URL(currentHref);
    url = new URL(anchor.getAttribute("href") ?? "", current);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin !== current.origin || !isAppPagePath(url.pathname)) return null;
  if (anchor.hasAttribute(SHELL_BROWSER_ATTR)) return { kind: "in-app-browser", href: url.href };
  return { kind: "same-window", href: url.href, path: url.pathname + url.search + url.hash };
}

/**
 * Kabuğun `<html>`e yazdığı güvenli alan değişkenleri (Capacitor Android
 * SystemBars `insetsHandling: "css"` → `document.documentElement.style
 * .setProperty("--safe-area-inset-top", "47px")` …). `globals.css`
 * `--safe-top/right/bottom/left` önce bunları, yoksa `env()`i okur.
 */
export const SAFE_AREA_INSET_PROPS = [
  "--safe-area-inset-top",
  "--safe-area-inset-right",
  "--safe-area-inset-bottom",
  "--safe-area-inset-left",
] as const;

/** Korunan kökler — kök başına tek gözlemci (çağrı tekrarlanabilir). */
const insetGuards = new WeakSet<object>();

/**
 * GÜVENLİ ALAN PAYINI KORU (mobil denetim smoke-public#new0). Bulunamayan
 * sayfada (`notFound()`) sunucu Next'in `<html id="__next_error__">` kabuğunu
 * gönderir; React kökü istemcide YENİDEN kurar ve `<html>` tekilini alırken
 * ÜZERİNDEKİ BÜTÜN ÖZNİTELİKLERİ siler (`style` dahil) — kabuğun hidrasyondan
 * önce yazdığı `--safe-area-inset-*` gider, `--safe-top` 0'a düşer, 404
 * sayfasının üst çubuğu çentiğin altında kalır. Android kabuğu değeri yalnız
 * sayfa görünür olduğunda ve pay DEĞİŞİNCE yeniden yazar: silinen değer
 * kendiliğinden geri gelmez.
 *
 * Kural: kökteki son bilinen değerler tutulur (çağrı anında okunur, sonra her
 * `style` değişiminde güncellenir); bir değer kökten kaybolursa son bilineni
 * geri yazılır. Kabuk değer SİLMEZ, yalnız yazar — kaybolan değer her zaman
 * React'in öznitelik temizliğidir. Gözlemci yalnız `<html>`in `style`
 * özniteliğine bakar; değer hiç görülmediyse (tarayıcı, masaüstü) hiçbir şey
 * yazmaz. Geri yazma mikro görevde: işleme biter bitmez, boyamadan önce.
 *
 * Modül değerlendirilirken çağrılır (`NativeShellBridge`): istemci bileşeninin
 * modülü React onu çizmeden önce yüklenir, yani silmeden ÖNCE — kabuk değeri
 * daha önce yazdıysa okunur, sonra yazarsa gözlemci görür.
 */
export function keepSafeAreaInsets(root: HTMLElement | null | undefined): void {
  try {
    if (!root || insetGuards.has(root)) return;
    const MO = (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver;
    if (typeof MO !== "function" || !root.style) return;
    insetGuards.add(root);
    const last = new Map<string, string>();
    const remember = () => {
      for (const prop of SAFE_AREA_INSET_PROPS) {
        const value = root.style.getPropertyValue(prop).trim();
        if (value) last.set(prop, value);
      }
    };
    const restore = () => {
      for (const [prop, value] of last) {
        if (!root.style.getPropertyValue(prop).trim()) root.style.setProperty(prop, value);
      }
    };
    remember();
    new MO(() => {
      restore();
      remember();
    }).observe(root, { attributes: true, attributeFilter: ["style"] });
  } catch {
    /* gözlemci kurulamadı — pay `env()`e düşer (eski davranış) */
  }
}
