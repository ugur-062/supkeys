/**
 * FİRMA VERİSİNİ SİLER — yayın öncesi canlı ortamı boşaltmak için.
 *
 * SİLİNEN: firmalar ve onlara bağlı HER ŞEY (kullanıcılar, talepler, teklifler,
 * siparişler, ürünler, adresler, mesajlar, bildirimler, bağlantılar…).
 * Supabase Auth hesapları da silinir (yoksa e-posta yeniden kullanılamaz).
 *
 * KORUNAN: kategori kataloğu (158k satır), döviz kurları, platform adminleri,
 * şema ve migration geçmişi.
 *
 * ÜÇ EMNİYET:
 *  1. Varsayılan KURU ÇALIŞMA — ne silineceğini yazar, dokunmaz.
 *  2. Silmek için `ONAY=EVET-SIL` şart.
 *  3. Hedef veritabanı adı ekranda gösterilir; yanlış ortamda çalıştırmayı zorlaştırır.
 *
 * Sipariş ilişkisi `onDelete: Restrict` olduğu için sıra ÖNEMLİ: önce sipariş,
 * sonra teklif/talep, en son firma.
 *
 *   npx tsx prisma/scripts/wipe-companies.ts              # kuru çalışma
 *   ONAY=EVET-SIL npx tsx prisma/scripts/wipe-companies.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const line of readFileSync(resolve(__dirname, "../../.env"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trimStart().startsWith("#")) {
    const k = line.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
}

import { PrismaClient } from "@prisma/client";

/**
 * Havuzlanmış bağlantıda (PgBouncer, 6543) hazırlanmış ifadeler yaşamaz
 * ("prepared statement s3 does not exist") → Prisma'ya havuz söylenir.
 * (Oturum modundaki 5432 bu makineden erişilebilir değil; toplu silme tek
 * batch olarak gittiği için işlem havuzu yeterli.)
 */
const rawUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
const url = rawUrl.includes("pgbouncer=")
  ? rawUrl
  : `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}pgbouncer=true&connection_limit=1`;
const prisma = new PrismaClient({ datasources: { db: { url } } });
const SIL = process.env.ONAY === "EVET-SIL";

function hedef(): string {
  const m = rawUrl.match(/postgres(?:ql)?:\/\/([^:]+):/);
  return m ? `${m[1]}@…` : "bilinmiyor";
}

async function sayim() {
  const [firma, kullanici, talep, teklif, siparis, urun, adres, mesaj, bildirim, konusma] = await Promise.all([
    prisma.company.count(),
    prisma.companyUser.count(),
    prisma.listing.count(),
    prisma.listingBid.count(),
    prisma.companyOrder.count(),
    prisma.companyItem.count(),
    prisma.companyAddress.count(),
    prisma.message.count().catch(() => -1),
    prisma.emailLog.count(),
    prisma.messageThread.count().catch(() => -1),
  ]);
  return { firma, kullanici, talep, teklif, siparis, urun, adres, mesaj, bildirim, konusma };
}

async function korunan() {
  const [kategori, kur, admin] = await Promise.all([
    prisma.category.count(),
    prisma.exchangeRate.count().catch(() => -1),
    prisma.platformAdmin.count(),
  ]);
  return { kategori, kur, admin };
}

async function supabaseSil(authIds: string[]): Promise<number> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("⚠️  SUPABASE_URL/SERVICE_ROLE_KEY yok — Auth hesapları SİLİNMEDİ.");
    return 0;
  }
  let n = 0;
  for (const id of authIds) {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/admin/users/${id}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }).catch(() => null);
    if (res?.ok) n += 1;
  }
  return n;
}

(async () => {
  console.log(`🎯 Hedef veritabanı kullanıcısı: ${hedef()}`);
  const once = await sayim();
  console.log("🗑️  SİLİNECEK:", JSON.stringify(once, null, 1));
  console.log("🛡️  KORUNACAK:", JSON.stringify(await korunan(), null, 1));

  if (!SIL) {
    console.log("\nKURU ÇALIŞMA — hiçbir şey silinmedi. Silmek için: ONAY=EVET-SIL");
    await prisma.$disconnect();
    return;
  }

  const authIds = (
    await prisma.companyUser.findMany({ where: { authId: { not: null } }, select: { authId: true } })
  ).map((u) => u.authId!) as string[];

  // Sıra ÖNEMLİ: sipariş ilişkisi Restrict, önce o gitmeli.
  console.log("\n⏳ siliniyor…");
  await prisma.$transaction([
    prisma.companyOrder.deleteMany({}),
    prisma.listingBid.deleteMany({}),
    prisma.listing.deleteMany({}),
    prisma.companyItem.deleteMany({}),
    prisma.company.deleteMany({}),
  ]);
  console.log("✅ veritabanı temizlendi");

  const silinen = await supabaseSil(authIds);
  console.log(`✅ Supabase Auth: ${silinen}/${authIds.length} hesap silindi`);
  console.log("📊 SONRASI:", JSON.stringify(await sayim(), null, 1));
  console.log("🛡️  KORUNAN:", JSON.stringify(await korunan(), null, 1));
  await prisma.$disconnect();
})();
