/**
 * Migration hedefi nöbetçisi — FAIL-CLOSED (2026-09-01).
 *
 * OLAY: 2026-08-31 gecesi denetim düzeltmeleri sırasında üç migration
 * (`20260831090000`, `20260901090000`, `20260901100000`) CANLI veritabanına
 * İSTENMEDEN uygulandı. Zararsızdılar (üçü de tamamen eklemeli; RLS prod'da
 * kapalı olduğu için policy'ler atıl) ve prod verisi doğrulandı — 20 firma /
 * 42 ilan / 32 teklif / 15 sipariş / 479 denetim kaydı yerinde. Ama onay
 * alınmadan gittiler.
 *
 * KÖK NEDEN SINIFI (denetim 2026-08-28 Parça 12 #7/#8): dev ve prod AYNI
 * Supabase veritabanı, `packages/db/.env` kök `.env`'e sembolik bağ ve o da
 * prod pooler'ını gösteriyor. Yani bu dizinde çalıştırılan HERHANGİ bir
 * Prisma komutunun varsayılan hedefi PRODUCTION. Hangi komutun sızdırdığını
 * kesinleştirmek yerine sınıfı kapatıyoruz: uzak hedefe migration ancak
 * AÇIK bir niyet beyanıyla uygulanabilir.
 *
 * KULLANIM: `migrate` ve `migrate:deploy` script'lerinin ÖNÜNDE koşar.
 * Uzak bir host'a yazmak gerektiğinde:
 *
 *     ALLOW_REMOTE_MIGRATION=1 pnpm --filter @rothern/db migrate:deploy
 *
 * Bu env'i kalıcı olarak `.env`'e YAZMAYIN — nöbetçinin tüm değeri, kararın
 * her seferinde bilinçli verilmesinde.
 *
 * TEK İSTİSNA — PROD KONTEYNERİ: `apps/api/docker-entrypoint.sh` bu izni
 * ÇAĞRI YERİNDE veriyor. Orası geliştirici makinesi değil; prod konteynerinin
 * başlangıcında prod veritabanına migration uygulamak yapılması GEREKEN iştir.
 *
 * ⚠️ 2026-09-01 OLAYI: bu nöbetçi eklendiğinde entrypoint güncellenmedi ve
 * `set -e` yüzünden HER Render deploy'u 17 saat boyunca exit 1 ile düştü.
 * Canlı eski kodla çalışmaya devam ettiği için sessiz kaldı — kimse fark
 * etmedi. DERS: paylaşılan bir script'e fail-closed kapı koyarken o script'i
 * ÇAĞIRAN tüm yolları (deploy, CI, entrypoint) saymak zorunludur.
 */
// Prisma CLI `.env`'i kendisi yükler; nöbetçi de AYNI dosyayı okumalı, yoksa
// hedefi göremez (ve fail-closed davranıp lokal geliştirmeyi de kilitler).
// `dotenv` bu paketin bağımlılığı DEĞİL ve yalnız bunun için eklemeye değmez —
// tek bir anahtar okuyoruz, elle ayrıştırmak yeterli.
import * as fs from "node:fs";
import * as path from "node:path";

function envFromFile(key: string): string | undefined {
  const file = path.resolve(__dirname, "../../.env");
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0 || t.slice(0, eq).trim() !== key) continue;
    // Tırnaklı ve tırnaksız biçimler.
    return t
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return undefined;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// Süreç env'i öncelikli (jest globalSetup açıkça geçiriyor), yoksa .env.
// Boş dize "tanımsız" sayılır (Prisma `env()` boş değeri kullanamaz).
function envOf(key: string): string | undefined {
  const v = process.env[key] ?? envFromFile(key);
  return v && v.trim() ? v : undefined;
}

// Derin denetim LU-09 (S047): Prisma migrate komutları datasource'taki
// `directUrl = env("DIRECT_URL")` tanımlıysa ONA bağlanır, DATABASE_URL'e
// değil. Nöbetçi yalnız DATABASE_URL'e bakınca `DATABASE_URL=localhost…`
// verilip DIRECT_URL `.env`'den (uzak) okunduğunda kapı açılıyor ve migration
// uzağa gidiyordu. Artık İKİSİ de denetlenir; biri uzaksa açık izin şart.
const targets = [
  { key: "DATABASE_URL", url: envOf("DATABASE_URL") },
  { key: "DIRECT_URL", url: envOf("DIRECT_URL") },
].filter((t): t is { key: string; url: string } => t.url !== undefined);

if (!targets.some((t) => t.key === "DATABASE_URL")) {
  console.error(
    "\n[migration-nöbetçisi] DATABASE_URL okunamadı — migration uygulanmıyor.\n",
  );
  process.exit(1);
}

const unparsable = targets.filter((t) => !hostOf(t.url));
if (unparsable.length > 0) {
  console.error(
    `\n[migration-guard] Cannot parse host of ${unparsable.map((t) => t.key).join(", ")} — not migrating.\n`,
  );
  process.exit(1);
}

const remoteHosts = [
  ...new Set(
    targets.map((t) => hostOf(t.url)!).filter((h) => !LOCAL_HOSTS.has(h)),
  ),
];
const host = remoteHosts.join(", ");

if (remoteHosts.length === 0) {
  process.exit(0); // lokal: serbest
}

if (process.env.ALLOW_REMOTE_MIGRATION === "1") {
  console.warn(
    `\n[migration-nöbetçisi] UZAK hedefe migration uygulanıyor: ${host}\n` +
      "  (ALLOW_REMOTE_MIGRATION=1 ile açıkça izin verildi)\n",
  );
  process.exit(0);
}

console.error(
  `\n[migration-nöbetçisi] DURDURULDU — hedef UZAK bir veritabanı: ${host}\n\n` +
    "  Bu dizinde `.env` kök `.env`'e bağlı ve o da PRODUCTION'ı gösteriyor;\n" +
    "  yani buradaki Prisma komutlarının varsayılan hedefi canlı veritabanı.\n" +
    "  2026-08-31'de üç migration bu yolla istenmeden canlıya gitti.\n\n" +
    "  Gerçekten canlıya uygulamak istiyorsanız:\n" +
    "    ALLOW_REMOTE_MIGRATION=1 pnpm --filter @rothern/db migrate:deploy\n\n" +
    "  Önce docs/migration-safety.md kontrol listesini okuyun (PITR + snapshot).\n",
);
process.exit(1);
