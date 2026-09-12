import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * Staging veritabanına DOĞRUDAN erişim — yalnız kayıt turu için.
 *
 * Neden gerekli: e-posta doğrulama kodu veritabanında HASH'li duruyor
 * (`sha256(code)`, tuzsuz) ve posta kutusunu okuyan bir test kırılgan olur.
 * Kod uzayı 10^6 olduğu için hash saniyeden kısa sürede geri çevrilir; test
 * gerçek kullanıcı yolunu (form → kod → onboarding) aynen yürür.
 *
 * NOT: tuzsuz hash, veritabanı sızarsa kodun anlamsızlaştığı anlamına gelir
 * ama kod kısa ömürlü + denemesi sınırlı olduğu için risk düşük; yine de
 * kayda değer (docs/qa-punchlist.md).
 */
let client: PrismaClient | null = null;

export function db(): PrismaClient {
  if (!client) {
    const raw = process.env.E2E_DATABASE_URL;
    if (!raw) throw new Error("E2E_DATABASE_URL yok (scripts/e2e-staging.sh .env.staging'den geçirir)");
    // Staging bağlantısı PgBouncer (işlem havuzu) üzerinden geliyor: hazırlanmış
    // ifadeler orada yaşamaz → "prepared statement s3 does not exist". Prisma'ya
    // havuzu söylemek şart.
    const url = raw.includes("pgbouncer=") ? raw : `${raw}${raw.includes("?") ? "&" : "?"}pgbouncer=true&connection_limit=1`;
    client = new PrismaClient({ datasources: { db: { url } } });
  }
  return client;
}

export async function closeDb(): Promise<void> {
  await client?.$disconnect();
  client = null;
}

/** Hash'li 6 haneli kodu geri çevirir (000000–999999). */
export async function verificationCodeFor(email: string): Promise<string> {
  const user = await db().companyUser.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`kullanıcı yok: ${email}`);
  const rec = await db().emailVerificationCode.findFirst({
    where: { companyUserId: user.id, usedAt: null },
    orderBy: { createdAt: "desc" },
    select: { codeHash: true },
  });
  if (!rec) throw new Error(`doğrulama kodu kaydı yok: ${email}`);
  for (let i = 0; i < 1_000_000; i++) {
    const candidate = String(i).padStart(6, "0");
    if (createHash("sha256").update(candidate).digest("hex") === rec.codeHash) return candidate;
  }
  throw new Error("kod çözülemedi");
}

/** Kayıt turunun bıraktığı firmayı, kullanıcıyı ve Supabase hesabını siler. */
export async function cleanupSignup(email: string): Promise<void> {
  const user = await db().companyUser.findUnique({
    where: { email },
    select: { id: true, companyId: true, authId: true },
  });
  if (!user) return;
  if (user.companyId) {
    await db().company.delete({ where: { id: user.companyId } }).catch(() => undefined);
  }
  await db().companyUser.delete({ where: { id: user.id } }).catch(() => undefined);

  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_SERVICE_KEY;
  if (user.authId && url && key) {
    await fetch(`${url.replace(/\/$/, "")}/auth/v1/admin/users/${user.authId}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }).catch(() => undefined);
  }
}
