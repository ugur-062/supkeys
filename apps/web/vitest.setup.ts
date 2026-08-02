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
