/**
 * reset-accounts.ts — TEHLİKELİ: tüm alıcı (tenant) + tedarikçi (supplier) +
 * ihale (tender) verisini ve bunların Supabase auth.users kayıtlarını + log'ları
 * siler. KORUNANLAR: kategoriler (UNSPSC), platform admin'leri, döviz kurları.
 *
 * Kullanım:
 *   pnpm --filter @supkeys/db reset-accounts            # KURU ÇALIŞMA (sadece sayım)
 *   pnpm --filter @supkeys/db reset-accounts --confirm  # GERÇEKTEN SİL
 *
 * Güvenlik: NODE_ENV=production ise reddeder.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

// --- .env'i manuel yükle (tsx otomatik yüklemez) ---
function loadEnv() {
  for (const p of [
    resolve(__dirname, "../../.env"),
    resolve(__dirname, "../../../../.env"),
  ]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
loadEnv();

const prisma = new PrismaClient();

async function main() {
  const confirm = process.argv.includes("--confirm");

  if (process.env.NODE_ENV === "production") {
    console.error("❌ NODE_ENV=production — reset reddedildi.");
    process.exit(1);
  }

  // Mevcut durum
  const [tenants, suppliers, tenders, users, supplierUsers] = await Promise.all(
    [
      prisma.tenant.count(),
      prisma.supplier.count(),
      prisma.tender.count(),
      prisma.user.count(),
      prisma.supplierUser.count(),
    ],
  );

  console.log("📊 Mevcut veri:");
  console.log(`   Alıcı (tenant)      : ${tenants}`);
  console.log(`   Tedarikçi (supplier): ${suppliers}`);
  console.log(`   İhale (tender)      : ${tenders}`);
  console.log(`   Tenant kullanıcı    : ${users}`);
  console.log(`   Tedarikçi kullanıcı : ${supplierUsers}`);

  // Silinecek Supabase auth.users kimlikleri (admin HARİÇ)
  const authIds = [
    ...(
      await prisma.user.findMany({
        where: { authId: { not: null } },
        select: { authId: true },
      })
    ).map((u) => u.authId as string),
    ...(
      await prisma.supplierUser.findMany({
        where: { authId: { not: null } },
        select: { authId: true },
      })
    ).map((u) => u.authId as string),
  ];
  console.log(`   Silinecek auth.users: ${authIds.length}`);

  if (!confirm) {
    console.log(
      "\n🟡 KURU ÇALIŞMA — hiçbir şey silinmedi. Gerçekten silmek için: --confirm",
    );
    return;
  }

  console.log("\n🔴 SİLİNİYOR…");

  // DB silme — FK kısıtlarını ihlal etmeyecek sırayla, tek transaction.
  await prisma.$transaction([
    // Sipariş + teklif (cascade'siz parent FK'leri var → önce)
    prisma.order.deleteMany({}),
    prisma.bid.deleteMany({}),
    // Davetler (supplier'a cascade'siz)
    prisma.tenderInvitation.deleteMany({}),
    prisma.supplierInvitation.deleteMany({}),
    // İhale (items/categories/attachments/approval cascade)
    prisma.tender.deleteMany({}),
    // Kayıt boru hattı
    prisma.supplierApplication.deleteMany({}),
    prisma.buyerApplication.deleteMany({}),
    prisma.demoRequest.deleteMany({}),
    // Paylaşılan (tenant/supplier'a cascade ama önce temizle)
    prisma.messageThread.deleteMany({}),
    prisma.supplierReview.deleteMany({}),
    prisma.attachment.deleteMany({}),
    // Ana hesaplar (users/addresses/categories/banks… cascade)
    prisma.tenant.deleteMany({}),
    prisma.supplier.deleteMany({}),
    // Artık oturum/token
    prisma.twoFactorChallenge.deleteMany({}),
    prisma.passwordResetToken.deleteMany({}),
    // Loglar (tam temizlik)
    prisma.emailEvent.deleteMany({}),
    prisma.emailLog.deleteMany({}),
    prisma.auditLog.deleteMany({}),
  ]);
  console.log("✓ DB satırları silindi (kategoriler + admin'ler korundu).");

  // Supabase auth.users temizliği
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.warn(
      "⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY yok — auth.users silinemedi.",
    );
  } else if (authIds.length > 0) {
    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let ok = 0;
    let fail = 0;
    for (const authId of authIds) {
      const { error } = await supabase.auth.admin.deleteUser(authId);
      if (error) fail++;
      else ok++;
    }
    console.log(`✓ Supabase auth.users: ${ok} silindi, ${fail} hata/atlandı.`);
  }

  // Doğrulama
  const after = await Promise.all([
    prisma.tenant.count(),
    prisma.supplier.count(),
    prisma.tender.count(),
    prisma.category.count(),
    prisma.platformAdmin.count(),
  ]);
  console.log("\n✅ Reset tamam. Kalan:");
  console.log(`   Alıcı: ${after[0]} · Tedarikçi: ${after[1]} · İhale: ${after[2]}`);
  console.log(`   (korundu) Kategori: ${after[3]} · Admin: ${after[4]}`);
}

main()
  .catch((e) => {
    console.error("HATA:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
