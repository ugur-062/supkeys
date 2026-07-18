import { PrismaClient } from "@rothern/db";
import { TEST_DB_URL, TEST_SCHEMA } from "./env";

/** İzole test şemasına bağlı tek PrismaClient. */
export const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});

/** Test şemasındaki tüm tabloları temizle (testler arası izolasyon).
 *  `_prisma_migrations` HARİÇ: silinirse sonraki jest çağrısının globalSetup
 *  migrate deploy'u migration'ları mevcut tablolara YENİDEN uygulamaya çalışır
 *  ("relation already exists" → globalSetup patlar). Migration geçmişi korunur. */
export async function truncateAll(): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables
       WHERE schemaname = $1 AND tablename <> '_prisma_migrations'`,
    TEST_SCHEMA,
  );
  if (rows.length === 0) return;
  const list = rows
    .map((r) => `"${TEST_SCHEMA}"."${r.tablename}"`)
    .join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}
