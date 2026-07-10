// jest-dom DOM matcher'larını vitest expect'ine ekler (toBeInTheDocument vb.).
import "@testing-library/jest-dom/vitest";

// Headless UI Menu (kebab dropdown) jsdom'da ResizeObserver ister — no-op polyfill.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}
