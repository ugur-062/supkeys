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
  },
});
