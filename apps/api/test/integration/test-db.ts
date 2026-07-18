import { PrismaClient } from "@rothern/db";
import { TEST_DB_URL, TEST_SCHEMA } from "./env";

/**
 * İzole test şemasına bağlı tek PrismaClient.
 *
 * `connection_limit=1` — DEADLOCK KÖK ÇÖZÜMÜ. Varsayılan Prisma havuzu (~10 bağlantı)
 * ile: `truncateAll`'ın TRUNCATE'i (AccessExclusiveLock) bir bağlantıda koşarken,
 * bir önceki testten sızan fire-and-forget yazım (bildirim/FX insert → FK RowShareLock)
 * BAŞKA bir havuz bağlantısında ters kilit sırası tutunca 40P01 deadlock oluşuyordu
 * (maxWorkers:1 bunu çözmez — sorun jest paralelliği değil, havuzdaki çoklu bağlantı).
 * Tek bağlantı → tüm sorgular serileşir → TRUNCATE hiçbir yazımla yarışamaz → deadlock
 * yapısal olarak imkânsız. Testler zaten seri (maxWorkers:1) → performans etkisi yok.
 */
const CLIENT_URL = TEST_DB_URL.includes("connection_limit=")
  ? TEST_DB_URL
  : `${TEST_DB_URL}${TEST_DB_URL.includes("?") ? "&" : "?"}connection_limit=1`;

export const prisma = new PrismaClient({
  datasources: { db: { url: CLIENT_URL } },
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
