/**
 * Veri betikleri için ORTAM DOSYASI yükleyicisi ve hedef veritabanı seçimi —
 * TEK KAYNAK (derin denetim 2026-09-29 Y-21).
 *
 * `ENV_FILE` verilirse O dosya okunur ve değerleri EZER (kabukta kalan eski
 * `DATABASE_URL` canlı koşumu staging'e çeviremesin). Verilmezse kök `.env`
 * yalnız EKSİK anahtarları doldurur (kabukta `DATABASE_URL` ya da `DIRECT_URL`
 * varsa ikisi de dosyadan ALINMAZ — çift birlikte kabuktan gelir); dosya yoksa (API konteyneri/Render
 * kabuğu: yalnız ortam değişkenleri) atlanır. Açıkça verilen `ENV_FILE`
 * yoksa düşer — sessizce varsayılana dönmek tam da kapatılan hata sınıfı.
 *
 * NEDEN: 2026-09-15 olayı (kabukta `set -a; . .env.prod.local` tırnaksız `&`
 * yüzünden değişkeni kurmadı, "canlı" kuru çalışma staging'i listeledi) ve
 * 2026-09-29 denetimi: `seed-geo-cities` / `backfill-city-ids` `ENV_FILE`'ı
 * hiç okumuyordu → runbook'un `ENV_FILE=../../.env.prod.local` çağrısı Prisma'nın
 * şema env yolundaki `packages/db/.env`e (kök `.env` = STAGING) yazıyordu ve
 * başarı basıyordu. Betik başında hedef host/proje ref'i basılır.
 *
 * Kullanım — `new PrismaClient` KURULMADAN önce:
 *
 *   const prisma = new PrismaClient({ datasourceUrl: prepareScriptDatabase("betik-adı") });
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ScriptEnvOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** `ENV_FILE` yokken okunacak dosya (varsayılan: `packages/db/.env` → kök `.env`). */
  defaultFile?: string;
}

export interface ScriptEnvResult {
  /** Okunan dosyanın mutlak yolu; hiçbir dosya okunmadıysa null. */
  file: string | null;
  /** `ENV_FILE` verildi → dosya değerleri mevcut ortamı ezdi. */
  override: boolean;
}

const DB_URL_KEYS = new Set(["DATABASE_URL", "DIRECT_URL"]);

export function loadScriptEnv(opts: ScriptEnvOptions = {}): ScriptEnvResult {
  const env = opts.env ?? process.env;
  const override = !!env.ENV_FILE;
  const file = env.ENV_FILE
    ? resolve(opts.cwd ?? process.cwd(), env.ENV_FILE)
    : (opts.defaultFile ?? resolve(__dirname, "../../../.env"));
  if (!override && !existsSync(file)) return { file: null, override };
  // DATABASE_URL + DIRECT_URL TEK ÇİFT (boşluk taraması GA1 inceleme): kabuk
  // yalnız `DATABASE_URL=...localhost...` verdiğinde dosya eksik `DIRECT_URL`i
  // (kök `.env` = STAGING) doldurursa `scriptDatabaseUrl` onu öne alır ve betik
  // staging'e yazar. Kabukta çiftin biri varsa dosyadan ikisi de alınmaz.
  const shellHasDb = !override && !!(env.DATABASE_URL || env.DIRECT_URL);
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trimStart().startsWith("#")) {
      const k = line.slice(0, i).trim();
      if (shellHasDb && DB_URL_KEYS.has(k)) continue;
      if (override || !env[k]) env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
    }
  }
  return { file, override };
}

/**
 * Betiğin bağlanacağı adres: `DIRECT_URL` (PgBouncer'sız) yoksa `DATABASE_URL`.
 * İkisi de yoksa DÜŞER — `datasourceUrl: undefined` Prisma'yı şemanın env
 * yoluna (`packages/db/.env` → kök `.env`, staging) düşürürdü.
 */
export function scriptDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DIRECT_URL || env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL / DATABASE_URL tanımlı değil — ENV_FILE=<dosya> verin");
  return url;
}

/** Günlük için hedef özeti: host + Supabase proje ref'i; parola/kullanıcı BASILMAZ. */
export function describeDbTarget(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "(ayrıştırılamayan adres)";
  }
  const ref =
    /^postgres\.([a-z0-9]+)$/i.exec(decodeURIComponent(u.username))?.[1] ??
    /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(u.hostname)?.[1];
  return `${u.hostname}${u.port ? `:${u.port}` : ""}${ref ? ` (proje ${ref})` : ""}`;
}

/** Yükle + hedefi bas + adresi döndür: betiklerin tek satırlık girişi. */
export function prepareScriptDatabase(label: string, opts: ScriptEnvOptions = {}): string {
  const env = opts.env ?? process.env;
  const { file } = loadScriptEnv(opts);
  const url = scriptDatabaseUrl(env);
  console.log(`[${label}] hedef veritabanı: ${describeDbTarget(url)} · ortam dosyası: ${file ?? "(yok — süreç ortamı)"}`);
  return url;
}
