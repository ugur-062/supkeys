/**
 * RLS izolasyon testleri için KISITLI rol (`rothern_app`) bağlantısı. Migration
 * (20260719130000_rls_restricted_role) rolü + grant'leri kurar; parola migration'da
 * YOK → burada test-özel parola set edilir (owner client ile) + o parolayla
 * bağlanan ayrı PrismaClient. Bu client RLS'e TABİDİR (non-owner, NOBYPASSRLS) —
 * owner `prisma`'nın aksine (owner FORCE olmadan RLS'i bypass eder).
 */
import { PrismaClient } from "@rothern/db";
import { TEST_DB_URL } from "./env";

export const RLS_ROLE = "rothern_app";
export const RLS_ROLE_PW = "rls_test_pw";

/** Owner client ile kısıtlı role test parolası ver (idempotent). */
export async function ensureRestrictedRolePassword(
  owner: { $executeRawUnsafe: (sql: string) => Promise<unknown> },
): Promise<void> {
  await owner.$executeRawUnsafe(
    `ALTER ROLE ${RLS_ROLE} WITH LOGIN PASSWORD '${RLS_ROLE_PW}'`,
  );
}

/** TEST_DB_URL'in kimlik bilgisini rothern_app'e çevir + connection_limit=1. */
export function restrictedDbUrl(): string {
  // postgresql://rothern:pw@host/db?... → postgresql://rothern_app:rls_test_pw@host/db?...
  const swapped = TEST_DB_URL.replace(
    /\/\/[^:]+:[^@]+@/,
    `//${RLS_ROLE}:${RLS_ROLE_PW}@`,
  );
  // KRİTİK: connection_limit=1 — kısıtlı client çoklu-bağlantı havuzu açarsa,
  // truncateAll'ın TRUNCATE'i (AccessExclusiveLock) ile başka bağlantıdaki
  // FK/RowShareLock ters kilit sırasında 40P01 deadlock olur (CLAUDE.md'deki
  // ana-client fix'iyle AYNI kök neden). Tek bağlantı → serileşir → deadlock yok.
  if (swapped.includes("connection_limit=")) return swapped;
  return `${swapped}${swapped.includes("?") ? "&" : "?"}connection_limit=1`;
}

/** Kısıtlı rolle bağlanan PrismaClient (RLS'e tabi). $connect çağıran yapar. */
export function makeRestrictedPrisma(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: restrictedDbUrl() } },
  });
}
