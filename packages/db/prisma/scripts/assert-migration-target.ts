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
 */
// Prisma CLI `.env`'i kendisi yükler; nöbetçi de AYNI dosyayı okumalı,
// yoksa hedefi göremez (ve fail-closed davranıp lokal geliştirmeyi kilitler).
import { config as loadEnv } from "dotenv";
import * as path from "node:path";

loadEnv({ path: path.resolve(__dirname, "../../.env") });

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const url = process.env.DATABASE_URL;
const host = hostOf(url);

if (!host) {
  console.error(
    "\n[migration-nöbetçisi] DATABASE_URL okunamadı — migration uygulanmıyor.\n",
  );
  process.exit(1);
}

if (LOCAL_HOSTS.has(host)) {
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
