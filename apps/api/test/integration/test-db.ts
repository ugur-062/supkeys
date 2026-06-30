import { PrismaClient } from "@supkeys/db";
import { TEST_DB_URL, TEST_SCHEMA } from "./env";

/** İzole test şemasına bağlı tek PrismaClient. */
export const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});

/** Test şemasındaki tüm tabloları temizle (testler arası izolasyon). */
export async function truncateAll(): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = $1`,
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
