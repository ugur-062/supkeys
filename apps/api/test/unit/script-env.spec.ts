import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  describeDbTarget,
  loadScriptEnv,
  prepareScriptDatabase,
  scriptDatabaseUrl,
} from "../../../../packages/db/prisma/scripts/lib/script-env";

/**
 * VERİ BETİKLERİNİN HEDEF VERİTABANI (derin denetim 2026-09-29 Y-21).
 * `seed-geo-cities` / `backfill-city-ids` `ENV_FILE`'ı hiç okumuyordu →
 * runbook'un `ENV_FILE=../../.env.prod.local` canlı çağrısı Prisma'nın şema
 * env yolundaki `packages/db/.env`e (kök `.env` = STAGING) yazıp başarı
 * basıyordu. Yükleyici artık `lib/script-env` (tek kaynak).
 */
const dir = mkdtempSync(join(tmpdir(), "script-env-"));
const prodFile = join(dir, ".env.prod.local");
const stagingFile = join(dir, ".env");
writeFileSync(
  prodFile,
  [
    "# canlı",
    'DATABASE_URL="postgresql://postgres.prodref:p%40ss&x@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"',
    "DIRECT_URL=postgresql://postgres.prodref:secret@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
  ].join("\n"),
);
writeFileSync(
  stagingFile,
  "DATABASE_URL=postgresql://postgres.stagingref:s@aws-0-eu-central-1.pooler.supabase.com:6543/postgres\nDIRECT_URL=postgresql://postgres.stagingref:s@aws-0-eu-central-1.pooler.supabase.com:5432/postgres\n",
);

describe("script-env: ENV_FILE yükleyicisi", () => {
  it("ENV_FILE verilince dosya kabuktaki eski (staging) değerleri EZER; tırnaklı & korunur", () => {
    const env: NodeJS.ProcessEnv = {
      ENV_FILE: ".env.prod.local",
      DATABASE_URL: "postgresql://postgres.stagingref:s@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
    };
    const r = loadScriptEnv({ env, cwd: dir, defaultFile: stagingFile });
    expect(r).toEqual({ file: resolve(dir, ".env.prod.local"), override: true });
    expect(env.DATABASE_URL).toContain("aws-1-eu-central-1");
    expect(env.DATABASE_URL).toContain("&connection_limit=1");
    expect(scriptDatabaseUrl(env)).toContain("postgres.prodref");
    expect(scriptDatabaseUrl(env)).toContain(":5432/"); // DIRECT_URL önce
  });

  it("ENV_FILE yokken varsayılan dosya yalnız EKSİK anahtarı doldurur", () => {
    const env: NodeJS.ProcessEnv = { DIRECT_URL: "postgresql://u:p@localhost:5432/x" };
    loadScriptEnv({ env, cwd: dir, defaultFile: stagingFile });
    expect(env.DIRECT_URL).toBe("postgresql://u:p@localhost:5432/x");
    expect(env.DATABASE_URL).toContain("stagingref");
  });

  it("varsayılan dosya yoksa atlanır (konteyner); açıkça verilen ENV_FILE yoksa DÜŞER", () => {
    const env: NodeJS.ProcessEnv = {};
    expect(loadScriptEnv({ env, cwd: dir, defaultFile: join(dir, "yok.env") })).toEqual({ file: null, override: false });
    expect(() => loadScriptEnv({ env: { ENV_FILE: "yok.env" }, cwd: dir })).toThrow(/ENOENT/);
  });

  it("adres yoksa sessizce şema env'ine (staging) düşülmez", () => {
    expect(() => scriptDatabaseUrl({})).toThrow(/ENV_FILE/);
  });

  it("hedef özeti host + proje ref'i basar, parola/kullanıcı basmaz", () => {
    const s = describeDbTarget("postgresql://postgres.prodref:gizli@aws-1-eu-central-1.pooler.supabase.com:6543/postgres");
    expect(s).toBe("aws-1-eu-central-1.pooler.supabase.com:6543 (proje prodref)");
    expect(s).not.toContain("gizli");
    expect(describeDbTarget("postgresql://postgres:x@db.abcref.supabase.co:5432/postgres")).toContain("(proje abcref)");
    expect(describeDbTarget("postgresql://u:p@localhost:5432/t")).toBe("localhost:5432");
  });

  it("prepareScriptDatabase hedefi günlüğe basar ve canlı adresi döndürür", () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const url = prepareScriptDatabase("seed-geo-cities", { env: { ENV_FILE: ".env.prod.local" }, cwd: dir });
      expect(url).toContain("aws-1-eu-central-1");
      expect(log.mock.calls[0]![0]).toMatch(/\[seed-geo-cities\] hedef veritabanı: aws-1-eu-central-1\.pooler\.supabase\.com:5432 \(proje prodref\)/);
      expect(log.mock.calls[0]![0]).not.toContain("secret");
    } finally {
      log.mockRestore();
    }
  });
});

describe("script-env: kurulum betikleri bağlı", () => {
  const scripts = resolve(__dirname, "../../../../packages/db/prisma/scripts");
  it.each(["seed-geo-cities", "backfill-city-ids", "backfill-price-base"])(
    "%s PrismaClient'ı prepareScriptDatabase adresiyle kurar (ham process.env değil)",
    (name) => {
      const src = readFileSync(join(scripts, `${name}.ts`), "utf8");
      expect(src).toContain(`new PrismaClient({ datasourceUrl: prepareScriptDatabase("${name}") })`);
      expect(src).not.toMatch(/datasourceUrl:\s*process\.env/);
    },
  );
});
