import { PrismaClient } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { seedTenders } from "./seed/tenders";

const prisma = new PrismaClient();

// ──────────────────────────────────────────────────────────────────────────────
// Supabase Auth bridge
//
// Seed Supabase Auth source-of-truth'a göre çalışır: domain user yaratmadan
// önce `auth.users`'a kayıt atılır, dönen UUID `authId` kolonuna yazılır.
// `passwordHash` kolonu legacy — yeni seed'de boş bırakılıyor.
//
// İdempotent: aynı e-posta ile çağrılırsa mevcut auth user'ı bulup şifresini
// senkronlar (seed `.env`'deki INITIAL_*_PASSWORD değişirse yansır).
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
    // Şifreyi senkronla (seed env değişmiş olabilir) ama log'a yazma.
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

// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding (Supabase Auth bridge)…");

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "Demo Şirket", slug: "demo" },
  });
  console.log("✅ Tenant:", tenant.slug);

  await ensureSuperAdmin();
  await ensureDemoCompanyAdmin(tenant.id);
  await ensureDemoSupplierRelation(tenant.id);
  await ensureDemoAddresses(tenant.id);

  await seedTenders(prisma);
}

async function ensureSuperAdmin() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const firstName = process.env.INITIAL_ADMIN_FIRST_NAME ?? "Supkeys";
  const lastName = process.env.INITIAL_ADMIN_LAST_NAME ?? "Admin";

  if (!email || !password) {
    console.warn(
      "⚠️  INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD .env'de yok, admin atlandı.",
    );
    return;
  }

  // Security audit O-1 — Production'da placeholder/zayıf parola ile admin
  // create etmek kritik risk.
  const WEAK_PLACEHOLDERS = ["changeme", "change_me", "admin", "password"];
  if (
    process.env.NODE_ENV === "production" &&
    WEAK_PLACEHOLDERS.includes(password.toLowerCase())
  ) {
    throw new Error(
      `🚨 Üretim ortamında INITIAL_ADMIN_PASSWORD placeholder değer olamaz ("${password}"). .env'de güçlü bir parola koy.`,
    );
  }

  const authId = await ensureAuthUser(email, password, {
    role: "platform_admin",
  });

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    // Mevcut kayıt için authId boşsa bağla; varsa olduğu gibi bırak.
    if (!existing.authId) {
      await prisma.platformAdmin.update({
        where: { id: existing.id },
        data: { authId, passwordHash: null },
      });
      console.log("🔗 Super Admin auth.users'a bağlandı:", existing.email);
    } else {
      console.log("ℹ️  Super admin zaten var:", existing.email);
    }
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

async function ensureDemoCompanyAdmin(tenantId: string) {
  const email = "ugur@demo.com";
  const password = "demo12345";

  const authId = await ensureAuthUser(email, password, {
    role: "tenant_user",
    tenant_slug: "demo",
  });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.authId) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { authId, passwordHash: null },
      });
      console.log("🔗 Demo tenant kullanıcısı auth.users'a bağlandı:", email);
    } else {
      console.log("ℹ️  Demo tenant kullanıcısı zaten var:", email);
    }
    return;
  }

  await prisma.user.create({
    data: {
      email,
      authId,
      passwordHash: null,
      firstName: "Uğur",
      lastName: "Demo",
      role: "COMPANY_ADMIN",
      tenantId,
    },
  });
  console.log("✅ Demo tenant kullanıcısı oluşturuldu:", email);
}

// CLAUDE.md test hesapları tablosu ile senkron.
const SUPPLIER_EMAIL = "demo-supplier@firma.com";
const SUPPLIER_PASSWORD = "Test1234";

async function ensureDemoSupplierRelation(tenantId: string) {
  const existingRelation = await prisma.supplierTenantRelation.findFirst({
    where: { tenantId, status: "ACTIVE" },
  });

  // Supabase auth user her durumda hazırlanır (şifre senkronu).
  const authId = await ensureAuthUser(SUPPLIER_EMAIL, SUPPLIER_PASSWORD, {
    role: "supplier_user",
  });

  if (existingRelation) {
    // Mevcut SupplierUser kaydı varsa authId'yi bağla.
    const supplierUser = await prisma.supplierUser.findUnique({
      where: { email: SUPPLIER_EMAIL },
    });
    if (supplierUser && !supplierUser.authId) {
      await prisma.supplierUser.update({
        where: { id: supplierUser.id },
        data: { authId, passwordHash: null },
      });
      console.log("🔗 Tedarikçi kullanıcı auth.users'a bağlandı:", SUPPLIER_EMAIL);
    } else {
      console.log("ℹ️  Demo tenant'a bağlı ACTIVE tedarikçi zaten var");
    }
    return;
  }

  const taxNumber = "1112223334";
  const existingSupplier = await prisma.supplier.findUnique({
    where: { taxNumber },
  });
  let supplierId: string;
  if (existingSupplier) {
    supplierId = existingSupplier.id;
    const supplierUser = await prisma.supplierUser.findUnique({
      where: { email: SUPPLIER_EMAIL },
    });
    if (supplierUser && !supplierUser.authId) {
      await prisma.supplierUser.update({
        where: { id: supplierUser.id },
        data: { authId, passwordHash: null },
      });
    }
  } else {
    const supplier = await prisma.supplier.create({
      data: {
        companyName: "Demo Tedarikçi A.Ş.",
        companyType: "JOINT_STOCK",
        taxNumber,
        taxOffice: "Beşiktaş",
        taxCertUrl: "data:application/pdf;base64,JVBERi0xLjQK",
        city: "İstanbul",
        district: "Beşiktaş",
        addressLine: "Test Mah. No:1",
        membership: "STANDARD",
        users: {
          create: {
            email: SUPPLIER_EMAIL,
            authId,
            passwordHash: null,
            firstName: "Demo",
            lastName: "Tedarikçi",
            phone: null,
          },
        },
      },
    });
    supplierId = supplier.id;
    console.log(
      `✅ Örnek tedarikçi oluşturuldu: ${SUPPLIER_EMAIL} (şifre: ${SUPPLIER_PASSWORD})`,
    );
  }

  await prisma.supplierTenantRelation.upsert({
    where: { supplierId_tenantId: { supplierId, tenantId } },
    update: {},
    create: { supplierId, tenantId, status: "ACTIVE" },
  });
  console.log("✅ Demo tenant ↔ örnek tedarikçi ACTIVE ilişki kuruldu");
}

async function ensureDemoAddresses(tenantId: string) {
  const existing = await prisma.tenantAddress.count({ where: { tenantId } });
  if (existing > 0) {
    console.log(`ℹ️  Demo tenant'ta ${existing} adres zaten var, seed atlandı`);
    return;
  }

  await prisma.tenantAddress.createMany({
    data: [
      {
        tenantId,
        type: "FATURA",
        title: "Genel Merkez (Fatura)",
        country: "Türkiye",
        city: "İstanbul",
        district: "Ataşehir",
        fullAddress:
          "Barbaros Mah. Begonya Sok. No:1 K:5 D:12 Ataşehir/İstanbul",
        postalCode: "34746",
        taxOffice: "Ataşehir V.D.",
        taxNumber: "1234567890",
        contactName: "Muhasebe",
        contactPhone: "+90 216 555 00 11",
        contactEmail: "muhasebe@demo.com",
        isActive: true,
        isDefault: true,
      },
      {
        tenantId,
        type: "TESLIMAT",
        title: "Genel Merkez (Teslimat)",
        country: "Türkiye",
        city: "İstanbul",
        district: "Ataşehir",
        fullAddress:
          "Barbaros Mah. Begonya Sok. No:1 Lojistik Girişi Ataşehir/İstanbul",
        postalCode: "34746",
        contactName: "Lojistik",
        contactPhone: "+90 216 555 00 22",
        isActive: true,
        isDefault: true,
      },
      {
        tenantId,
        type: "ILETISIM",
        title: "Genel İletişim",
        country: "Türkiye",
        city: "İstanbul",
        district: "Ataşehir",
        fullAddress:
          "Barbaros Mah. Begonya Sok. No:1 Resepsiyon Ataşehir/İstanbul",
        contactName: "Resepsiyon",
        contactPhone: "+90 216 555 00 00",
        contactEmail: "info@demo.com",
        isActive: true,
        isDefault: true,
      },
    ],
  });
  console.log("✅ Demo tenant'a 3 adres eklendi (FATURA/TESLIMAT/ILETISIM)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
