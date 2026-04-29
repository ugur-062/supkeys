import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

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

  // Initial Super Admin
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  const adminFirstName = process.env.INITIAL_ADMIN_FIRST_NAME ?? "Supkeys";
  const adminLastName = process.env.INITIAL_ADMIN_LAST_NAME ?? "Admin";

  if (!adminEmail || !adminPassword) {
    console.warn("⚠️  INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD .env'de yok, admin oluşturulmadı.");
    return;
  }

  const existingAdmin = await prisma.platformAdmin.findUnique({
    where: { email: adminEmail.toLowerCase() },
  });

  if (existingAdmin) {
    console.log("ℹ️  Super admin zaten var:", existingAdmin.email);
    return;
  }

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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
