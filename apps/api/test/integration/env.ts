import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Kök .env'i yükle (Jest otomatik yüklemez). Yalnızca tanımsız anahtarları set
 * eder — CI'da gerçek env önceliklidir.
 */
function loadRootEnv(): void {
  const envPath = path.resolve(__dirname, "../../../../.env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadRootEnv();

export const TEST_SCHEMA = "supkeys_test";

/** Bağlantı URL'ine `schema=supkeys_test` ekler (varsa eskisini değiştirir). */
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

export const TEST_DB_URL = withTestSchema(base);

// GÜVENLİK: test bağlantısı MUTLAKA izole şemada olmalı; asla public (dev) değil.
if (!TEST_DB_URL.includes(`schema=${TEST_SCHEMA}`)) {
  throw new Error("Test DB şema guard'ı başarısız — public veriye dokunma riski.");
}
