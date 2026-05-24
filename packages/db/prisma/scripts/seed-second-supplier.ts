/**
 * İkinci demo tedarikçi (giriş yapabilir) — açık eksiltme çok-tedarikçili test için.
 *   E-posta: demo-supplier2@firma.com  Şifre: Test1234
 * Demo tenant ile ACTIVE ilişki kurar.
 * Kullanım: pnpm --filter @supkeys/db tsx prisma/scripts/seed-second-supplier.ts
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();
const EMAIL = "demo-supplier2@firma.com";
const PASSWORD = "Test1234";

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL + SERVICE_ROLE_KEY gerekli");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findOrCreateAuth(email: string, password: string) {
  const admin = supa();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = data.users.find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password });
    return existing.id;
  }
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "supplier_user" },
  });
  if (error || !created.user) throw new Error(error?.message ?? "createUser fail");
  return created.user.id;
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
  if (!tenant) throw new Error("demo tenant yok");

  const authId = await findOrCreateAuth(EMAIL, PASSWORD);

  // Supplier (taxNumber unique) — varsa bul
  let supplier = await prisma.supplier.findUnique({
    where: { taxNumber: "2222222222" },
  });
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: {
        companyName: "Demo Tedarikçi 2 A.Ş.",
        companyType: "JOINT_STOCK",
        taxNumber: "2222222222",
        taxOffice: "Kadıköy",
        taxCertUrl: "https://example.com/cert2.pdf",
        city: "İstanbul",
        district: "Kadıköy",
        addressLine: "Test Mah. No:2",
        membership: "STANDARD",
      },
    });
  }

  const existingUser = await prisma.supplierUser.findUnique({
    where: { email: EMAIL },
  });
  if (existingUser) {
    await prisma.supplierUser.update({
      where: { id: existingUser.id },
      data: { authId, passwordHash: null, isActive: true, supplierId: supplier.id },
    });
  } else {
    await prisma.supplierUser.create({
      data: {
        email: EMAIL,
        authId,
        firstName: "Demo2",
        lastName: "Tedarikçi",
        supplierId: supplier.id,
      },
    });
  }

  await prisma.supplierTenantRelation.upsert({
    where: { supplierId_tenantId: { supplierId: supplier.id, tenantId: tenant.id } },
    create: { supplierId: supplier.id, tenantId: tenant.id, status: "ACTIVE" },
    update: { status: "ACTIVE" },
  });

  console.log("✓ 2. tedarikçi:", EMAIL, "/", PASSWORD, "| supplierId:", supplier.id);
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
