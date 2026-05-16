/**
 * Jest global setup. Her test dosyasından önce yüklenir.
 *
 * - `.env.test`'i process.env'e yükler (jest setupFilesAfterEnv aşaması, ConfigModule'den önce).
 * - Test helper'ları beklenen DATABASE_URL'in `supkeys_test`'i göstermesini bekler.
 *
 * Test DB'nin oluşturulması ve migration'ın uygulanması ayrı bir komutla
 * (`pnpm test:db:prepare`) yapılır — her test run'ı için tekrar deploy etmek
 * gereksiz yavaşlık.
 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

const envTestPath = resolve(__dirname, "../.env.test");
if (existsSync(envTestPath)) {
  loadEnv({ path: envTestPath });
}

// Sağlamlık: yanlış DB'ye yazma riskine karşı erken fail.
if (!process.env.DATABASE_URL?.includes("supkeys_test")) {
  throw new Error(
    `[test setup] DATABASE_URL test DB'sini göstermiyor: ${
      process.env.DATABASE_URL
    } — apps/api/.env.test kontrol et`,
  );
}

// Test timeout (jest config'inde de var, defansif tekrar).
jest.setTimeout(30_000);
