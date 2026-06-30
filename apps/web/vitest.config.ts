import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Web birim testleri — saf mantık (lib/tenders): zod form şeması, tarih/etiket
 * yardımcıları, hata çıkarımı, detay→form eşleme. DOM gerektirmez (node env).
 * Bileşen/render testleri ayrı bir iş (jsdom + testing-library).
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
