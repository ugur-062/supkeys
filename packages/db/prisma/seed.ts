import { type CompanyRole, type CompanyTier, PrismaClient } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

// ──────────────────────────────────────────────────────────────────────────────
// Supabase Auth bridge — domain kullanıcı yaratmadan önce auth.users'a kayıt,
// dönen UUID authId'ye yazılır. İdempotent: aynı e-posta → mevcut auth user'ı
// bulup şifresini senkronlar.
// ──────────────────────────────────────────────────────────────────────────────

function buildSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Seed Supabase bridge çalışamaz: SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env'de ayarlı olmalı.",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const supabaseAdmin = buildSupabaseAdmin();

async function findAuthUserByEmail(email: string): Promise<string | null> {
  const normalized = email.toLowerCase();
  let page = 1;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === normalized,
    );
    if (match) return match.id;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function ensureAuthUser(
  email: string,
  password: string,
  metadata?: Record<string, unknown>,
): Promise<string> {
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existing, {
      password,
    });
    if (error) {
      console.warn(
        `⚠️  Auth user şifresi güncellenemedi (${email}): ${error.message}`,
      );
    }
    return existing;
  }
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) {
    throw new Error(`Supabase createUser failed for ${email}: ${error?.message}`);
  }
  return data.user.id;
}

// supkeysId kodu — @supkeys/shared SHORT_CODE alfabesi (karışık karakter yok).
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function genCode(): string {
  const pick = () =>
    Array.from(
      { length: 4 },
      () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join("");
  return `${pick()}-${pick()}`;
}

const ALL_ROLES: CompanyRole[] = [
  "YONETICI",
  "SATIN_ALMACI",
  "SATISCI",
  "ONAYLAYICI",
];

// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding (birleşik Company sistemi)…");

  await ensureSuperAdmin();

  const c1 = await ensureCompany("firma@demo.com", "Demo Firma A.Ş.", "PAKET");
  const c2 = await ensureCompany("firma2@demo.com", "İkinci Firma Ltd", "PAKET");
  await ensureCompany("firma3@demo.com", "Üçüncü Firma", "PAKET");

  // firma@demo ↔ firma2 ACTIVE bağlantı (ilan/teklif testleri için).
  const exists = await prisma.companyConnection.findFirst({
    where: {
      OR: [
        { inviterCompanyId: c1, inviteeCompanyId: c2 },
        { inviterCompanyId: c2, inviteeCompanyId: c1 },
      ],
    },
  });
  if (!exists) {
    const owner1 = await prisma.companyUser.findFirst({
      where: { companyId: c1 },
      select: { id: true },
    });
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: c1,
        inviteeCompanyId: c2,
        status: "ACTIVE",
        origin: "ADMIN",
        invitedById: owner1!.id,
        decidedAt: new Date(),
      },
    });
    console.log("✅ firma@demo ↔ firma2 ACTIVE bağlantı");
  }

  console.log("🌱 Seed tamam.");
}

async function ensureSuperAdmin() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const firstName = process.env.INITIAL_ADMIN_FIRST_NAME ?? "Rothern";
  const lastName = process.env.INITIAL_ADMIN_LAST_NAME ?? "Admin";

  if (!email || !password) {
    console.warn(
      "⚠️  INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD .env'de yok, admin atlandı.",
    );
    return;
  }

  const authId = await ensureAuthUser(email, password, {
    role: "platform_admin",
  });

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    if (!existing.authId) {
      await prisma.platformAdmin.update({
        where: { id: existing.id },
        data: { authId, passwordHash: null },
      });
    }
    console.log("ℹ️  Super admin hazır:", existing.email);
    return;
  }

  const admin = await prisma.platformAdmin.create({
    data: {
      email,
      authId,
      passwordHash: null,
      firstName,
      lastName,
      role: "SUPER_ADMIN",
    },
  });
  console.log("✅ Super Admin oluşturuldu:", admin.email);
}

async function ensureCompany(
  email: string,
  name: string,
  tier: CompanyTier,
): Promise<string> {
  const password = "Demo1234!";
  const authId = await ensureAuthUser(email, password, { role: "company_user" });

  const existingUser = await prisma.companyUser.findUnique({
    where: { email },
    select: { companyId: true },
  });
  if (existingUser) {
    console.log("ℹ️  Firma kullanıcısı zaten var:", email);
    return existingUser.companyId;
  }

  let code = genCode();
  while ((await prisma.company.count({ where: { supkeysId: code } })) > 0) {
    code = genCode();
  }

  const company = await prisma.company.create({
    data: { name, supkeysId: code, tier, country: "TR" },
  });
  const user = await prisma.companyUser.create({
    data: {
      email,
      authId,
      firstName: name.split(" ")[0] ?? name,
      lastName: "Demo",
      roles: ALL_ROLES,
      companyId: company.id,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.company.update({
    where: { id: company.id },
    data: { ownerUserId: user.id },
  });
  console.log(`✅ Firma: ${name} (${email}) [${code}] ${tier}`);
  return company.id;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
