/**
 * Hızlı test user oluşturma scripti.
 *
 * Kullanım:
 *   TEST_USER_EMAIL=ben@gmail.com TEST_USER_PASSWORD=Deneme1234 \
 *     pnpm --filter @supkeys/db create-test-user
 *
 * Demo tenant'a COMPANY_ADMIN olarak ekler. Hem Supabase auth.users'a
 * hem Prisma users tablosuna yazar. Var olan e-postaysa şifresini günceller.
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";

const prisma = new PrismaClient();

function buildSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY .env'de olmalı.",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findOrCreateAuthUser(
  supabaseAdmin: ReturnType<typeof buildSupabaseAdmin>,
  email: string,
  password: string,
): Promise<{ authId: string; created: boolean }> {
  // Mevcut user var mı bak
  const { data, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);
  const existing = data.users.find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (existing) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password,
    });
    if (error) throw new Error(`updateUser failed: ${error.message}`);
    return { authId: existing.id, created: false };
  }
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`createUser failed: ${createErr?.message}`);
  }
  return { authId: created.user.id, created: true };
}

async function main() {
  const email = (process.env.TEST_USER_EMAIL ?? "").toLowerCase().trim();
  const password =
    process.env.TEST_USER_PASSWORD ?? `Test${crypto.randomBytes(4).toString("hex")}!`;
  const firstName = process.env.TEST_USER_FIRST_NAME ?? "Test";
  const lastName = process.env.TEST_USER_LAST_NAME ?? "User";

  if (!email) {
    console.error("TEST_USER_EMAIL env değişkeni gerekli.");
    process.exit(1);
  }

  const supabaseAdmin = buildSupabaseAdmin();

  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
  if (!tenant) {
    throw new Error("Demo tenant yok — önce `pnpm seed` çalıştır.");
  }

  console.log(`👤 Test user oluşturuluyor: ${email}`);
  const { authId, created: authCreated } = await findOrCreateAuthUser(
    supabaseAdmin,
    email,
    password,
  );
  console.log(
    `  ${authCreated ? "✅" : "🔁"} Supabase auth.users: ${authId}`,
  );

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { authId, passwordHash: null, isActive: true, deletedAt: null },
    });
    console.log(`  🔁 Prisma user güncellendi: ${existing.id}`);
  } else {
    const user = await prisma.user.create({
      data: {
        email,
        authId,
        passwordHash: null,
        firstName,
        lastName,
        role: "COMPANY_ADMIN",
        tenantId: tenant.id,
        isActive: true,
      },
    });
    console.log(`  ✅ Prisma user oluşturuldu: ${user.id}`);
  }

  console.log("\n🎉 Hazır. Aşağıdaki bilgilerle giriş yapabilirsin:");
  console.log(`   URL:    http://localhost:3000/login`);
  console.log(`   E-mail: ${email}`);
  console.log(`   Şifre:  ${password}`);
  console.log(
    `\nNot: /forgot-password ile bu adrese reset linki göndererek kendi şifreni de kurabilirsin.\n`,
  );
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
