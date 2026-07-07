/**
 * Birleşik sistem — hızlı test firması (Company) oluşturma.
 *
 * Kullanım:
 *   TEST_COMPANY_EMAIL=firma@demo.com TEST_COMPANY_PASSWORD=Demo1234! \
 *     pnpm --filter @rothern/db create-test-company
 *
 * company-auth signup akışını birebir taklit eder: Supabase auth.users +
 * Company + ilk CompanyUser (owner + YONETICI/SATIN_ALMACI/SATISCI).
 * Sonunda signInWithPassword ile login yolunun çalıştığını da doğrular.
 */

import { CompanyRole, PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { generateShortCode } from "@rothern/shared";

const prisma = new PrismaClient();

async function uniqueRothernId(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateShortCode();
    if ((await prisma.company.count({ where: { rothernId: code } })) === 0) {
      return code;
    }
  }
  throw new Error("rothernId üretilemedi");
}

function buildSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) {
    throw new Error(
      "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY .env'de olmalı.",
    );
  }
  return {
    admin: createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    publicClient: createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

async function findOrCreateAuthUser(
  admin: ReturnType<typeof buildSupabase>["admin"],
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const existing = data.users.find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password });
    return existing.id;
  }
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { type: "company" },
  });
  if (cErr || !created.user) throw new Error(`createUser: ${cErr?.message}`);
  return created.user.id;
}

async function main() {
  const email = (process.env.TEST_COMPANY_EMAIL ?? "firma@demo.com")
    .toLowerCase()
    .trim();
  const password = process.env.TEST_COMPANY_PASSWORD ?? "Demo1234!";
  const companyName = process.env.TEST_COMPANY_NAME ?? "Demo Firma A.Ş.";
  const firstName = process.env.TEST_COMPANY_FIRST_NAME ?? "Demo";
  const lastName = process.env.TEST_COMPANY_LAST_NAME ?? "Sahip";

  const { admin, publicClient } = buildSupabase();

  console.log(`🏢 Test firması oluşturuluyor: ${companyName} (${email})`);
  const authId = await findOrCreateAuthUser(admin, email, password);
  console.log(`  ✓ Supabase auth.users: ${authId}`);

  const existingUser = await prisma.companyUser.findUnique({
    where: { email },
    include: { company: true },
  });
  if (existingUser) {
    // rothernId yoksa backfill et (bağlantı daveti için gerekli).
    const co = existingUser.company;
    if (!co.rothernId) {
      const code = await uniqueRothernId();
      await prisma.company.update({
        where: { id: co.id },
        data: { rothernId: code },
      });
      console.log(`  🔧 rothernId backfill: ${code}`);
    }
    console.log(
      `  🔁 Zaten var: company=${existingUser.companyId} (rothernId=${co.rothernId ?? "yeni atandı"})`,
    );
  } else {
    const company = await prisma.company.create({
      data: { name: companyName, tier: "STANDARD", rothernId: await uniqueRothernId() },
    });
    const user = await prisma.companyUser.create({
      data: {
        email,
        authId,
        firstName,
        lastName,
        roles: [
          CompanyRole.YONETICI,
          CompanyRole.SATIN_ALMACI,
          CompanyRole.SATISCI,
        ],
        companyId: company.id,
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.company.update({
      where: { id: company.id },
      data: { ownerUserId: user.id },
    });
    console.log(`  ✓ Company: ${company.id} (owner=${user.id})`);
    console.log(`  ✓ Roller: ${user.roles.join(", ")}`);
  }

  // Login yolunu doğrula — signInWithPassword (verifyPassword'ın yaptığı).
  const { data: signIn, error: siErr } =
    await publicClient.auth.signInWithPassword({ email, password });
  if (siErr || !signIn.user) {
    console.error(`  ❌ signInWithPassword başarısız: ${siErr?.message}`);
    process.exit(1);
  }
  console.log(`  ✓ Login doğrulandı (signInWithPassword OK)`);

  console.log("\n🎉 Hazır:");
  console.log(`   POST /company-auth/login`);
  console.log(`   E-mail: ${email}`);
  console.log(`   Şifre:  ${password}`);
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
