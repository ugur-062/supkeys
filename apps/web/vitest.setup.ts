// jest-dom DOM matcher'larını vitest expect'ine ekler (toBeInTheDocument vb.).
import "@testing-library/jest-dom/vitest";

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
