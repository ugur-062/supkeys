// jest-dom DOM matcher'larını vitest expect'ine ekler (toBeInTheDocument vb.).
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom'da ResizeObserver yok — Headless UI Listbox (FilterSelect) kapanırken
// çağırıyor ve "3 unhandled errors" üretiyordu; no-op stub yeter.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom'da `matchMedia` yok — `CountUp` (sayı şeridi) `prefers-reduced-motion`
// sorar ve sayfa testleri patlıyordu. Varsayılan "hareket kısıtlaması YOK"
// (matches: false): bileşenler tam yolu koşsun, test gerçek davranışı görsün.
if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// IntersectionObserver da yok: yapışkan eylem şeridi ve `CountUp` nöbetçiyle
// çalışır. No-op stub → gözlem hiç tetiklenmez, yani şerit gizli kalır
// (bileşenlerin JS'siz/gözlemsiz davranışıyla aynı).
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  } as unknown as typeof IntersectionObserver;
}

// ---------------------------------------------------------------------------
// i18n Faz 0 — next-intl SAHTESİ (docs/plan-i18n.md). Testler Türkçe kaynak
// katalogla, sağlayıcı sarmalamadan koşar: `useTranslations`/`getTranslations`
// gerçek use-intl çevirmenini (ICU dahil) TR mesajlarla kurar. Böylece 139
// test dosyasındaki Türkçe metin beklentileri değişmeden geçerli kalır.
// ---------------------------------------------------------------------------
vi.mock("next-intl", async () => {
  const { createFormatter, createTranslator } = await import("use-intl/core");
  const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
  const MESSAGES = messagesFor("tr", WEB_NAMESPACES);
  const TZ = "Europe/Istanbul";
  const makeT = (namespace?: string) =>
    createTranslator({
      locale: "tr",
      messages: MESSAGES,
      namespace: namespace as never,
      timeZone: TZ,
      onError: () => {},
      getMessageFallback: ({ namespace: ns, key }) => (ns ? `${ns}.${key}` : key),
    });
  return {
    useTranslations: (namespace?: string) => makeT(namespace),
    useLocale: () => "tr",
    useMessages: () => MESSAGES,
    useFormatter: () => createFormatter({ locale: "tr", timeZone: TZ }),
    useNow: () => new Date(),
    useTimeZone: () => TZ,
    hasLocale: (locales: readonly string[], candidate: unknown) =>
      typeof candidate === "string" && locales.includes(candidate),
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("next-intl/server", async () => {
  const { createFormatter, createTranslator } = await import("use-intl/core");
  const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
  const MESSAGES = messagesFor("tr", WEB_NAMESPACES);
  const TZ = "Europe/Istanbul";
  const makeT = (namespace?: string) =>
    createTranslator({
      locale: "tr",
      messages: MESSAGES,
      namespace: namespace as never,
      timeZone: TZ,
      onError: () => {},
      getMessageFallback: ({ namespace: ns, key }) => (ns ? `${ns}.${key}` : key),
    });
  return {
    getTranslations: async (arg?: string | { namespace?: string }) =>
      makeT(typeof arg === "string" ? arg : arg?.namespace),
    getLocale: async () => "tr",
    getMessages: async () => MESSAGES,
    getFormatter: async () => createFormatter({ locale: "tr", timeZone: TZ }),
    getNow: async () => new Date(),
    getTimeZone: async () => TZ,
    setRequestLocale: () => {},
    getRequestConfig: (fn: unknown) => fn,
  };
});
