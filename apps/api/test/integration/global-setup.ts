import { execSync } from "node:child_process";
import * as path from "node:path";
import { TEST_DB_URL } from "./env";

/**
 * Tek seferlik: GERÇEK migration'ları (28 dosya) izole test DB'sine uygula
 * (`migrate deploy`). Böylece lokal == CI == prod migration yolu — ayrışma yok.
 *
 * NOT: order_number_seq/listing_number_seq (0_init) ve X-CF-3 partial unique index
 * (…_pending_unique migration'ı) MIGRATION SQL'inde yaşadığından `migrate deploy`
 * bunları OTOMATİK uygular — eski `db push` + elle sequence/index dual-write'ı
 * artık GEREKMEZ (Prisma şeması ifade edemediği için gerekiyordu; migrate deploy
 * ham SQL'i uygular). Prod/dev şemasına dokunmaz (yalnız test DB URL'i, lokal).
 */
export default async function globalSetup(): Promise<void> {
  const dbDir = path.resolve(__dirname, "../../../../packages/db");
  try {
    execSync("pnpm exec prisma migrate deploy", {
      cwd: dbDir,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL },
    });
  } catch (e) {
    throw new Error(
      "Test DB'ye migrate deploy başarısız — lokal Postgres ayakta mı?\n" +
        "  docker compose -f docker-compose.test.yml up -d --wait\n" +
        String(e),
    );
  }
}
