import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { seedTenders } from "./seed/tenders";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding...");

  // Demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Demo Şirket",
      slug: "demo",
    },
  });
  console.log("✅ Tenant:", tenant.slug);

  // Initial Super Admin (varsa atlama, yoksa oluştur)
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  const adminFirstName = process.env.INITIAL_ADMIN_FIRST_NAME ?? "Supkeys";
  const adminLastName = process.env.INITIAL_ADMIN_LAST_NAME ?? "Admin";

  if (!adminEmail || !adminPassword) {
    console.warn(
      "⚠️  INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD .env'de yok, admin atlandı.",
    );
  } else {
    const existingAdmin = await prisma.platformAdmin.findUnique({
      where: { email: adminEmail.toLowerCase() },
    });
    if (existingAdmin) {
      console.log("ℹ️  Super admin zaten var:", existingAdmin.email);
    } else {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      const admin = await prisma.platformAdmin.create({
        data: {
          email: adminEmail.toLowerCase(),
          passwordHash,
          firstName: adminFirstName,
          lastName: adminLastName,
          role: "SUPER_ADMIN",
        },
      });
      console.log("✅ Super Admin oluşturuldu:", admin.email);
      console.log("   Şifre:", adminPassword, "(.env'den)");
    }
  }

  // Demo tenant'a varsayılan COMPANY_ADMIN — uygulama içi test girişi için
  await ensureDemoCompanyAdmin(tenant.id);

  // Demo tenant'a örnek bir ACTIVE tedarikçi (tender davetlerinin
  // gönderileceği target). Idempotent — varsa atlanır.
  await ensureDemoSupplierRelation(tenant.id);

  // Tender modülü için 3 dummy ihale (idempotent)
  await seedTenders(prisma);
}

async function ensureDemoCompanyAdmin(tenantId: string) {
  const email = "ugur@demo.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("ℹ️  Demo tenant kullanıcısı zaten var:", email);
    return;
  }
  const passwordHash = await bcrypt.hash("demo12345", 12);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: "Uğur",
      lastName: "Demo",
      role: "COMPANY_ADMIN",
      tenantId,
    },
  });
  console.log("✅ Demo tenant kullanıcısı oluşturuldu:", email, "(şifre: demo12345)");
}

async function ensureDemoSupplierRelation(tenantId: string) {
  const existingRelation = await prisma.supplierTenantRelation.findFirst({
    where: { tenantId, status: "ACTIVE" },
  });
  if (existingRelation) {
    console.log("ℹ️  Demo tenant'a bağlı ACTIVE tedarikçi zaten var");
    return;
  }

  const taxNumber = "1112223334";
  const existingSupplier = await prisma.supplier.findUnique({
    where: { taxNumber },
  });
  let supplierId: string;
  if (existingSupplier) {
    supplierId = existingSupplier.id;
  } else {
    const passwordHash = await bcrypt.hash("Demo1234", 12);
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
            email: "demo-supplier@firma.com",
            passwordHash,
            firstName: "Demo",
            lastName: "Tedarikçi",
            phone: null,
          },
        },
      },
    });
    supplierId = supplier.id;
    console.log(
      "✅ Örnek tedarikçi oluşturuldu: demo-supplier@firma.com (şifre: Demo1234)",
    );
  }

  await prisma.supplierTenantRelation.upsert({
    where: { supplierId_tenantId: { supplierId, tenantId } },
    update: {},
    create: { supplierId, tenantId, status: "ACTIVE" },
  });
  console.log("✅ Demo tenant ↔ örnek tedarikçi ACTIVE ilişki kuruldu");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
