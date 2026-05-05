import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL ?? "admin@supkeys.com";
  const password = process.env.INITIAL_ADMIN_PASSWORD ?? "admin12345";

  console.log(`🔐 Şifre sıfırlanıyor: ${email}`);
  console.log(`🔑 Yeni şifre: ${password}`);

  const passwordHash = await bcrypt.hash(password, 12);

  const updated = await prisma.platformAdmin.updateMany({
    where: { email: email.toLowerCase() },
    data: {
      passwordHash,
      isActive: true,
    },
  });

  if (updated.count === 0) {
    console.log("⚠️  Bu email ile admin bulunamadı. Yeni admin oluşturuluyor...");
    const created = await prisma.platformAdmin.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName: process.env.INITIAL_ADMIN_FIRST_NAME ?? "Supkeys",
        lastName: process.env.INITIAL_ADMIN_LAST_NAME ?? "Admin",
        role: "SUPER_ADMIN",
      },
    });
    console.log("✅ Oluşturuldu:", created.email);
  } else {
    console.log("✅ Şifre güncellendi ve hesap aktive edildi");
  }
}

main()
  .catch((e) => {
    console.error("❌ Hata:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
