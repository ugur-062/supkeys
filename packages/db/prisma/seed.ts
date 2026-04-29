import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding...");

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Demo Şirket",
      slug: "demo",
    },
  });

  console.log("✅ Tenant:", tenant.slug);
  console.log("ℹ️  Kullanıcı eklemek için auth modülü kurulduktan sonra seed'i genişleteceğiz.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
