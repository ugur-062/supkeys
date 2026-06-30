import { execSync } from "node:child_process";
import * as path from "node:path";
import { PrismaClient } from "@supkeys/db";
import { TEST_DB_URL, TEST_SCHEMA } from "./env";

/**
 * Tek seferlik: model şemasını izole `supkeys_test` şemasına push et + custom
 * SQL sequence'leri (db push türetmez) oluştur. Public (dev) şemasına dokunmaz.
 */
export default async function globalSetup(): Promise<void> {
  const dbDir = path.resolve(__dirname, "../../../../packages/db");
  // Modelleri test şemasına yansıt (yalnızca schema=supkeys_test bağlantısı).
  execSync("pnpm exec prisma db push --skip-generate", {
    cwd: dbDir,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL },
  });

  // order_number_seq / listing_number_seq custom SQL ile gelir → test şemasında
  // elle oluştur (service unqualified nextval çağırır, search_path = test şeması).
  const p = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  try {
    await p.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS "${TEST_SCHEMA}"."order_number_seq" START 1`,
    );
    await p.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS "${TEST_SCHEMA}"."listing_number_seq" START 1`,
    );
  } finally {
    await p.$disconnect();
  }
}
