import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Admin birim + bileşen testleri. Bileşen testleri (*.test.tsx) dosya başında
 * `// @vitest-environment jsdom` ile jsdom'a geçer (React Testing Library).
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
    // Bkz. web/vitest.config.ts — paralel yükte userEvent yavaşlar; zaman
    // aşımını yükseltip flaky-timeout'u keser, gerçek hatalar anında düşer.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
