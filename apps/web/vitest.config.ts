import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Web birim + bileşen testleri.
 *  - Saf mantık (lib/tenders): node env (varsayılan).
 *  - Bileşen testleri (*.test.tsx): dosya başında `// @vitest-environment jsdom`
 *    ile jsdom'a geçer (React Testing Library).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    // Bileşen testleri userEvent ile karakter-karakter yazıyor; tüm suite'ler
    // paralel koşarken CPU rekabeti tekil testi 5sn varsayılanının üstüne
    // itiyor (izole ~2.4sn). Zaman aşımını yükselterek flaky-timeout'u keser —
    // gerçek assertion hataları yine anında düşer.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
