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
    // Security audit O-1 — Production'da placeholder/zayıf parola ile admin
    // create etmek kritik risk. .env.example "changeme" değeri dev için
    // tasarlandı; prod deploy'unda yanlışlıkla bırakılırsa burada fail.
    const WEAK_PLACEHOLDERS = ["changeme", "change_me", "admin", "password"];
    if (
      process.env.NODE_ENV === "production" &&
      WEAK_PLACEHOLDERS.includes(adminPassword.toLowerCase())
    ) {
      throw new Error(
        `🚨 Üretim ortamında INITIAL_ADMIN_PASSWORD placeholder değer olamaz ("${adminPassword}"). .env'de güçlü bir parola koy.`,
      );
    }
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
      // Security audit K-1 — parola log'a yazılmıyor (production stdout +
      // CI artifact'larında sızıntı riski). Parola .env'deki INITIAL_ADMIN_PASSWORD
      // değeridir; geliştirici oradan bakar.
      console.log("   Şifre: .env içindeki INITIAL_ADMIN_PASSWORD değeri");
    }
  }

  // Demo tenant'a varsayılan COMPANY_ADMIN — uygulama içi test girişi için
  await ensureDemoCompanyAdmin(tenant.id);

  // Demo tenant'a örnek bir ACTIVE tedarikçi (tender davetlerinin
  // gönderileceği target). Idempotent — varsa atlanır.
  await ensureDemoSupplierRelation(tenant.id);

  // Tedarikçi şifresini her seed'de senkronla (relation idempotency'sini
  // bozmadan, mevcut user'ın bcrypt hash'ini doğru parolaya çevir).
  await syncDemoSupplierUserPassword();

  // E.7.B — Demo tenant adresleri (FATURA + TESLIMAT + ILETISIM)
  await ensureDemoAddresses(tenant.id);

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
  // Security audit K-1 — parola CLAUDE.md "Test Hesapları" tablosunda;
  // seed log'a yazılmıyor (CI/prod stdout sızıntısı önlemi).
  console.log("✅ Demo tenant kullanıcısı oluşturuldu:", email);
}

// CLAUDE.md test hesapları tablosu ile senkron — geliştirici onboarding için tek doğruluk kaynağı.
const SUPPLIER_PASSWORD = "Test1234";

async function syncDemoSupplierUserPassword() {
  // Bug #4 fix: relation zaten varsa bile supplier user şifresinin
  // her seed çağrısında doğru hash ile güncellenmesini garantile.
  const user = await prisma.supplierUser.findUnique({
    where: { email: "demo-supplier@firma.com" },
  });
  if (!user) return; // İlk seed çağrısı — ensureDemoSupplierRelation oluşturacak
  const passwordHash = await bcrypt.hash(SUPPLIER_PASSWORD, 12);
  await prisma.supplierUser.update({
    where: { id: user.id },
    data: { passwordHash },
  });
  console.log(
    `🔁 Tedarikçi şifresi senkronlandı: demo-supplier@firma.com (şifre: ${SUPPLIER_PASSWORD})`,
  );
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
  const passwordHash = await bcrypt.hash(SUPPLIER_PASSWORD, 12);

  const existingSupplier = await prisma.supplier.findUnique({
    where: { taxNumber },
  });
  let supplierId: string;
  if (existingSupplier) {
    supplierId = existingSupplier.id;
    // Şifre senkronu zaten ayrı bir adım (`syncDemoSupplierUserPassword`)
    // tarafından her seed çağrısında çalıştırılıyor.
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
      `✅ Örnek tedarikçi oluşturuldu: demo-supplier@firma.com (şifre: ${SUPPLIER_PASSWORD})`,
    );
  }

  await prisma.supplierTenantRelation.upsert({
    where: { supplierId_tenantId: { supplierId, tenantId } },
    update: {},
    create: { supplierId, tenantId, status: "ACTIVE" },
  });
  console.log("✅ Demo tenant ↔ örnek tedarikçi ACTIVE ilişki kuruldu");
}

// E.7.B — Demo tenant adresleri. Her tipte 1 default + active.
// Idempotent: tenant'ın herhangi bir adresi varsa skip.
async function ensureDemoAddresses(tenantId: string) {
  const existing = await prisma.tenantAddress.count({
    where: { tenantId },
  });
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
