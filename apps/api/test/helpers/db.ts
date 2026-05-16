/**
 * Test DB helper'ı. Her dosya `beforeAll`'da `setupTestDb()` çağırır —
 * tablolar varsa truncate edip baştan başlar; yoksa Prisma client'ı şişirir.
 *
 * Veritabanı, test runner'ı başlamadan önce manuel olarak hazırlanmalıdır:
 *
 *   pnpm test:db:prepare
 *
 * Bu komut psql ile `supkeys_test` DB'sini yaratır ve `prisma migrate deploy`
 * çalıştırır. Test setup.ts erişim kontrolü yapar (yanlış DB'ye fan-out
 * yazmamak için).
 */
import { PrismaClient } from "@supkeys/db";

let prismaSingleton: PrismaClient | undefined;

export function getTestPrisma(): PrismaClient {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient({
      log: process.env.TEST_DB_DEBUG ? ["query", "warn", "error"] : ["warn", "error"],
    });
  }
  return prismaSingleton;
}

export async function disconnectTestPrisma(): Promise<void> {
  if (prismaSingleton) {
    await prismaSingleton.$disconnect();
    prismaSingleton = undefined;
  }
}

/**
 * TRUNCATE pattern — her test başında DB'yi temizle.
 * `IDENTITY RESTART CASCADE` ile FK + sequence reset.
 * Schema değişirse otomatik adapte olur (`information_schema` lookup).
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}
