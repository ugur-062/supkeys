/**
 * Demo doluluk — 12 firma (STANDART/GOLD karışık), aralarında ACTIVE
 * bağlantılar, kalemli ihaleler (çoğu PUBLIC/herkese açık ALIM), birkaç teklif.
 * Owner'lar gerçek Supabase auth ile açılır → giriş yapılabilir (Demo1234!).
 *
 * Çalıştır:  cd packages/db && npx tsx prisma/scripts/seed-demo-fill.ts
 * Idempotent: her koşuda @demofill.local firmaları silinip yeniden kurulur.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// .env'i manuel yükle (tsx otomatik yüklemez).
for (const line of readFileSync(resolve(__dirname, "../../.env"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trimStart().startsWith("#")) {
    const k = line.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
}

import { PrismaClient, type CompanyRole, type CompanyTier } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { permissionsForRoles } from "@rothern/shared";

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const PASSWORD = "Demo1234!";
const DOMAIN = "@demofill.local";
const OWNER_ROLES: CompanyRole[] = ["SAHIP"]; // Kurucu tam yetkili, tek başına
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const genCode = () => {
  const p = () => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  return `${p()}-${p()}`;
};
const days = (n: number) => new Date(Date.now() + n * 86400_000);

async function findAuthUser(email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) return null;
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
async function ensureAuthUser(email: string): Promise<string> {
  const existing = await findAuthUser(email);
  if (existing) {
    await supabase.auth.admin.updateUserById(existing, { password: PASSWORD });
    return existing;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: { role: "company_user" },
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

// ── Firma tanımları ──
type Def = { key: string; name: string; tier: CompanyTier };
const COMPANIES: Def[] = [
  { key: "anadolu", name: "Anadolu İnşaat A.Ş.", tier: "GOLD" },
  { key: "ege", name: "Ege Tekstil San. Tic. A.Ş.", tier: "GOLD" },
  { key: "marmara", name: "Marmara Gıda Ltd. Şti.", tier: "GOLD" },
  { key: "toros", name: "Toros Kimya A.Ş.", tier: "GOLD" },
  { key: "karadeniz", name: "Karadeniz Enerji A.Ş.", tier: "GOLD" },
  { key: "baskent", name: "Başkent Medikal Ltd. Şti.", tier: "GOLD" },
  { key: "akdeniz", name: "Akdeniz Lojistik A.Ş.", tier: "GOLD" },
  { key: "metal", name: "İç Anadolu Metal San. A.Ş.", tier: "GOLD" },
  { key: "yildiz", name: "Yıldız Ofis Malzemeleri", tier: "STANDART" },
  { key: "demir", name: "Demir Hırdavat Ltd.", tier: "STANDART" },
  { key: "gunes", name: "Güneş Temizlik Hizmetleri", tier: "STANDART" },
  { key: "mavi", name: "Mavi Bilişim Çözümleri", tier: "STANDART" },
];

const CONNECTIONS: [string, string][] = [
  ["yildiz", "anadolu"], ["demir", "metal"], ["mavi", "baskent"], ["gunes", "akdeniz"],
  ["ege", "marmara"], ["toros", "karadeniz"], ["yildiz", "ege"], ["demir", "toros"],
];

// Yetki testi için: bu firmalara her rolden birer takım üyesi eklenir.
const TEAM_KEYS = ["anadolu", "baskent", "yildiz", "gunes"];
const TEAM_ROLES: { suffix: string; roles: CompanyRole[]; label: string }[] = [
  { suffix: "yonetici", roles: ["YONETICI"], label: "Yönetici" },
  { suffix: "satinalmaci", roles: ["SATIN_ALMACI"], label: "Satın Almacı" },
  { suffix: "satisci", roles: ["SATISCI"], label: "Satışçı" },
  { suffix: "onaylayici", roles: ["ONAYLAYICI"], label: "Onaylayıcı" },
];

type Item = { name: string; quantity: number; unit: string; targetPrice?: number };
type L = {
  owner: string; type: "ALIM"; visibility: "PUBLIC" | "CONNECTIONS" | "PRIVATE";
  title: string; items: Item[]; closesInDays: number;
  invite?: string[];
  // Ödeme zamanı — teminat mektubu YALNIZ "BEFORE_DELIVERY"de istenir
  // (alıcı teslimden önce öder → satıcı teslimatı garanti eder). Verilmezse
  // "AFTER_DELIVERY" (teslim sonrası ödeme, teminat yok).
  paymentTiming?: "BEFORE_DELIVERY" | "AFTER_DELIVERY";
};
const LISTINGS: L[] = [
  { owner: "anadolu", type: "ALIM", visibility: "PUBLIC", closesInDays: 14, title: "Şantiye için inşaat demiri ve çimento alımı",
    items: [{ name: "İnşaat demiri Ø12", quantity: 25000, unit: "kg", targetPrice: 26 }, { name: "Portland çimento CEM I 42.5", quantity: 800, unit: "torba", targetPrice: 210 }, { name: "Hazır beton C30/37", quantity: 120, unit: "m³", targetPrice: 2400 }] },
  { owner: "ege", type: "ALIM", visibility: "PUBLIC", closesInDays: 10, title: "Pamuk ipliği ve boya kimyasalları tedariki",
    items: [{ name: "Ne 30/1 penye pamuk ipliği", quantity: 5000, unit: "kg" }, { name: "Reaktif boya - lacivert", quantity: 400, unit: "kg" }, { name: "Fikse maddesi", quantity: 200, unit: "kg" }] },
  { owner: "marmara", type: "ALIM", visibility: "PUBLIC", closesInDays: 7, title: "Ambalaj ve gıda hammadde alımı",
    items: [{ name: "PET şişe 500 ml", quantity: 100000, unit: "adet" }, { name: "Kristal şeker", quantity: 12000, unit: "kg" }, { name: "Oluklu karton koli", quantity: 5000, unit: "adet" }] },
  { owner: "toros", type: "ALIM", visibility: "PUBLIC", closesInDays: 21, title: "Endüstriyel kimyasal tedariki",
    items: [{ name: "Kostik soda %99", quantity: 3000, unit: "kg" }, { name: "Sülfürik asit %98", quantity: 1500, unit: "L" }, { name: "Sodyum bikarbonat", quantity: 2000, unit: "kg" }] },
  { owner: "karadeniz", type: "ALIM", visibility: "PUBLIC", closesInDays: 18, title: "Trafo, kablo ve pano alımı",
    items: [{ name: "Kuru tip trafo 1000 kVA", quantity: 3, unit: "adet" }, { name: "NYY kablo 4x16", quantity: 2000, unit: "m" }, { name: "Kompanzasyon panosu", quantity: 2, unit: "adet" }] },
  { owner: "baskent", type: "ALIM", visibility: "PUBLIC", closesInDays: 12, title: "Tıbbi sarf malzeme alımı",
    items: [{ name: "Cerrahi eldiven (M)", quantity: 50000, unit: "adet" }, { name: "Enjektör 5 ml", quantity: 100000, unit: "adet" }, { name: "Antiseptik solüsyon 1 L", quantity: 800, unit: "adet" }] },
  { owner: "akdeniz", type: "ALIM", visibility: "PUBLIC", closesInDays: 9, title: "Palet ve depo ekipmanı alımı",
    items: [{ name: "Euro palet", quantity: 2000, unit: "adet" }, { name: "Manuel transpalet 2.5 t", quantity: 10, unit: "adet" }, { name: "Streç film", quantity: 1500, unit: "rulo" }] },
  // Teslim ÖNCESİ ödeme örneği → kazandırılınca satıcıdan teminat mektubu istenir.
  { owner: "metal", type: "ALIM", visibility: "PUBLIC", closesInDays: 15, title: "Sac ve profil alımı",
    paymentTiming: "BEFORE_DELIVERY",
    items: [{ name: "DKP sac 2 mm", quantity: 15000, unit: "kg" }, { name: "Kutu profil 40x40", quantity: 3000, unit: "m" }, { name: "Paslanmaz sac 304", quantity: 4000, unit: "kg" }] },
  // CONNECTIONS — yalnız bağlantılı firmalar görür
  { owner: "anadolu", type: "ALIM", visibility: "CONNECTIONS", closesInDays: 8, title: "İş güvenliği ekipmanları alımı",
    items: [{ name: "Baret", quantity: 500, unit: "adet" }, { name: "İş eldiveni", quantity: 2000, unit: "çift" }, { name: "S3 güvenlik ayakkabısı", quantity: 300, unit: "çift" }] },
  { owner: "baskent", type: "ALIM", visibility: "CONNECTIONS", closesInDays: 20, title: "Laboratuvar cihazı bakım hizmeti",
    items: [{ name: "Yıllık kalibrasyon", quantity: 12, unit: "adet" }, { name: "Yedek parça seti", quantity: 4, unit: "paket" }] },
  // PRIVATE — yalnız davetli
  { owner: "metal", type: "ALIM", visibility: "PRIVATE", closesInDays: 11, title: "Özel CNC talaşlı imalat hizmeti", invite: ["demir"],
    items: [{ name: "CNC frezeleme", quantity: 200, unit: "saat" }, { name: "Talaşlı imalat parçası", quantity: 150, unit: "adet" }] },
];

// bidder → listing (owner + title anahtarı) → tutar
const BIDS: { bidder: string; owner: string; titleIncludes: string; amount: number }[] = [
  { bidder: "yildiz", owner: "anadolu", titleIncludes: "inşaat demiri", amount: 720000 },
  { bidder: "demir", owner: "metal", titleIncludes: "Sac ve profil", amount: 540000 },
  { bidder: "mavi", owner: "baskent", titleIncludes: "Tıbbi sarf", amount: 385000 },
  { bidder: "demir", owner: "metal", titleIncludes: "CNC", amount: 96000 },
];

async function nextNumber(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('listing_number_seq') AS n`;
  return `ROT-${String(rows[0]!.n).padStart(6, "0")}`;
}

async function main() {
  console.log("🌱 Demo doluluk başlıyor…");

  // 0) Önceki demo-fill'i temizle (cascade).
  const prev = await prisma.companyUser.findMany({
    where: { email: { endsWith: DOMAIN } }, select: { companyId: true },
  });
  const prevIds = [...new Set(prev.map((u) => u.companyId))];
  if (prevIds.length) {
    await prisma.company.deleteMany({ where: { id: { in: prevIds } } });
    console.log(`🧹 ${prevIds.length} eski demo firma silindi`);
  }

  // 1) Kategori havuzu (geçerli UNSPSC kodları).
  const cats = (await prisma.category.findMany({ where: { level: 2, isActive: true }, select: { code: true }, take: 24 })).map((c) => c.code);
  if (!cats.length) throw new Error("Kategori bulunamadı — önce kategori seed'ini çalıştırın.");
  const cat = (idx: number) => cats[idx % cats.length]!;

  // 2) Firmalar + owner + auth.
  const id: Record<string, { companyId: string; ownerId: string }> = {};
  for (let i = 0; i < COMPANIES.length; i++) {
    const d = COMPANIES[i]!;
    const email = `${d.key}${DOMAIN}`;
    const authId = await ensureAuthUser(email);
    let code = genCode();
    while ((await prisma.company.count({ where: { rothernId: code } })) > 0) code = genCode();
    const buyerCats = [cat(i * 2), cat(i * 2 + 1)];
    const sellerCats = [cat(i * 2 + 2), cat(i * 2 + 3)];
    const company = await prisma.company.create({
      data: {
        name: d.name, rothernId: code, tier: d.tier, country: "TR",
        website: d.tier === "GOLD" ? `https://${d.key}.example.com` : null,
        buyerCategoryIds: buyerCats, sellerCategoryIds: sellerCats,
        onboardingCompletedAt: new Date(),
      },
    });
    const firstName = d.name.split(" ")[0] ?? d.name;
    const user = await prisma.companyUser.create({
      data: { email, authId, firstName, lastName: "Yetkili", roles: OWNER_ROLES, permissions: permissionsForRoles(OWNER_ROLES), companyId: company.id, emailVerifiedAt: new Date() },
    });
    await prisma.company.update({ where: { id: company.id }, data: { ownerUserId: user.id } });
    id[d.key] = { companyId: company.id, ownerId: user.id };
    console.log(`  🏢 ${d.name} [${d.tier}] ${email}`);
  }

  // 3) Bağlantılar (ACTIVE).
  for (const [a, b] of CONNECTIONS) {
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: id[a]!.companyId, inviteeCompanyId: id[b]!.companyId,
        status: "ACTIVE", origin: "ADMIN", invitedById: id[a]!.ownerId, decidedAt: new Date(),
      },
    });
  }
  console.log(`  🔗 ${CONNECTIONS.length} bağlantı`);

  // 3b) Takım üyeleri (rol bazlı — yetki testi için).
  let teamCount = 0;
  for (const key of TEAM_KEYS) {
    for (const t of TEAM_ROLES) {
      const email = `${t.suffix}.${key}${DOMAIN}`;
      const authId = await ensureAuthUser(email);
      await prisma.companyUser.upsert({
        where: { email },
        update: { authId, roles: t.roles, companyId: id[key]!.companyId, isActive: true, deletedAt: null },
        create: {
          email, authId, firstName: t.label, lastName: COMPANIES.find((c) => c.key === key)!.name,
          roles: t.roles, companyId: id[key]!.companyId, emailVerifiedAt: new Date(),
        },
      });
      teamCount++;
    }
  }
  console.log(`  👥 ${teamCount} rol-bazlı takım üyesi`);

  // 4) İhaleler + kalemler + davetler.
  const listingRef: { owner: string; title: string; listingId: string }[] = [];
  for (const l of LISTINGS) {
    const o = id[l.owner]!;
    const number = await nextNumber();
    const listing = await prisma.listing.create({
      data: {
        number, companyId: o.companyId, createdById: o.ownerId,
        type: l.type, format: "RFQ",
        visibility: l.visibility, title: l.title, status: "OPEN", publishedAt: new Date(),
        closesAt: days(l.closesInDays), primaryCurrency: "TRY",
        paymentTiming: l.paymentTiming ?? "AFTER_DELIVERY",
        categoryIds: [cat(Math.floor(Math.random() * cats.length))],
      },
    });
    for (let i = 0; i < l.items.length; i++) {
      const it = l.items[i]!;
      await prisma.listingItem.create({
        data: { listingId: listing.id, lineNo: i + 1, name: it.name, quantity: it.quantity, unit: it.unit, targetPrice: it.targetPrice ?? null },
      });
    }
    if (l.invite?.length) {
      await prisma.listingInvitation.createMany({
        data: l.invite.map((k) => ({ listingId: listing.id, invitedCompanyId: id[k]!.companyId, invitedById: o.ownerId })),
        skipDuplicates: true,
      });
    }
    listingRef.push({ owner: l.owner, title: l.title, listingId: listing.id });
  }
  console.log(`  📋 ${LISTINGS.length} ihale (${LISTINGS.filter((l) => l.visibility === "PUBLIC").length} herkese açık)`);

  // 5) Birkaç teklif.
  let bidCount = 0;
  for (const b of BIDS) {
    const ref = listingRef.find((r) => r.owner === b.owner && r.title.includes(b.titleIncludes));
    if (!ref) continue;
    await prisma.listingBid.create({
      data: {
        listingId: ref.listingId, bidderCompanyId: id[b.bidder]!.companyId, createdById: id[b.bidder]!.ownerId,
        amount: b.amount, currency: "TRY", status: "SUBMITTED", submittedAt: new Date(), deliveryDate: days(20),
      },
    });
    bidCount++;
  }
  console.log(`  💰 ${bidCount} teklif`);

  console.log("\n✅ Demo doluluk tamam. Giriş: şifre hepsi 'Demo1234!'");
  console.log("   Sahip (tam yetki): anadolu@demofill.local (GOLD), yildiz@demofill.local (STANDART)");
  console.log("   Rol testi kullanıcıları (her firmada aynı desen):");
  for (const key of TEAM_KEYS) {
    const tier = COMPANIES.find((c) => c.key === key)!.tier;
    console.log(`   • ${key} [${tier}]: ${TEAM_ROLES.map((t) => `${t.suffix}.${key}@demofill.local (${t.label})`).join(", ")}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("HATA:", e);
  await prisma.$disconnect();
  process.exit(1);
});
