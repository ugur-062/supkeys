import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Bir .env dosyasını yükle (Jest otomatik yüklemez). YALNIZCA tanımsız anahtarları
 * set eder → öncelik: process.env (CI) > önce yüklenen dosya > sonra yüklenen.
 */
function loadEnvFile(relPath: string): void {
  const envPath = path.resolve(__dirname, relPath);
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
// Lokal test DB'si (apps/api/.env.test) ÖNCE — buradaki DATABASE_URL/DIRECT_URL
// kök .env'in Supabase URL'ini EZER (only-undefined; .env.test önce set eder).
// Kök .env yalnız KALAN tanımsız anahtarları doldurur; prod/dev'e dokunulmaz.
// CI kendi env'ini process.env'e koyduğundan (öncelikli) ikisini de override eder.
loadEnvFile("../../.env.test");
loadEnvFile("../../../../.env");

export const TEST_SCHEMA = "rothern_test";

/** Bağlantı URL'ine `schema=rothern_test` ekler (varsa eskisini değiştirir). */
function withTestSchema(url: string): string {
  let u = url
    .replace(/([?&])schema=[^&]*/, "$1")
    .replace(/[?&]$/, "")
    .replace(/\?&/, "?")
    .replace(/&&/, "&");
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}schema=${TEST_SCHEMA}`;
}

const base = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!base) {
  throw new Error(
    "Test DB için DIRECT_URL/DATABASE_URL bulunamadı (.env yüklenemedi).",
  );
}

// FAIL-FAST: integration testleri LOKAL Postgres'e koşar, remote Supabase'e ASLA
// (paylaşımlı instance = yavaş + 40P01 TRUNCATE deadlock — 56 dk hang kaynağı).
// apps/api/.env.test lokal DB'yi tanımlar; silinmiş/ezilmişse remote'a düşmeyelim.
if (/supabase\.(co|com)|pooler\.supabase/.test(base)) {
  throw new Error(
    "Integration testleri lokal Postgres'e koşar, remote Supabase'e DEĞİL.\n" +
      "  docker compose -f docker-compose.test.yml up -d --wait\n" +
      "(apps/api/.env.test lokal DB URL'ini tanımlar — silinmiş/ezilmiş olabilir.)",
  );
}

export const TEST_DB_URL = withTestSchema(base);

// GÜVENLİK: test bağlantısı MUTLAKA izole şemada olmalı; asla public (dev) değil.
if (!TEST_DB_URL.includes(`schema=${TEST_SCHEMA}`)) {
  throw new Error("Test DB şema guard'ı başarısız — public veriye dokunma riski.");
}
