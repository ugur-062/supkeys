/**
 * PAZAR YERİ DEMO DOLULUĞU (2026-09-04) — herkese açık vitrin "dolu" görünsün:
 * 20 firma (paketli, doğrulanmış, herkese açık profil, kapak görselli, kategori
 * ve faaliyet beyanlı), ~56 yayında ürün (görselli, fiyatlı/kademeli/teklifle),
 * 16 herkese açık ALIM talebi (kalemli, 5–25 gün açık),
 * bağlantılar ve birkaç teklif.
 *
 * `seed-demo-fill.ts`in yerine geçer (aynı `@demofill.local` işareti): her
 * koşuda önce o işaretli firmalar silinir (cascade) → idempotent, geri alınabilir.
 * Kaldırmak için: `npx tsx prisma/scripts/cleanup-marketplace-demo.ts`.
 *
 * ⚠ dev ve prod AYNI Supabase DB — bu veri canlıda da görünür (kullanıcı
 * kararı, 2026-09-04). Görseller repodaki CC0 kategori fotoğrafı havuzundan
 * (`segmentPhoto`, 2026-09-07); logo yok (baş harf yedeği).
 *
 * VERİ `lib/marketplace-demo-data.ts`te (firmalar, ürünler, talepler, teklifler):
 * betik içe aktarılınca yazmaya başladığı için testler veriyi oradan okur.
 *
 * GİZLİ SEGMENT (2026-10-09): betik Prisma ile DOĞRUDAN yazar, uygulamanın
 * doğrulama kapılarından geçmez → gizli segmentteki (`HIDDEN_SEGMENTS`) tek bir
 * kod bile varsa hiçbir şey yazmadan DURUR (`assertVisibleSeedCategories`,
 * `assertAttrs` yanında) ve katalog sorguları gizli segmenti süzer
 * (`lib/seed-category-guard.ts`).
 *
 * Çalıştır:  cd packages/db && npx tsx prisma/scripts/seed-marketplace-demo.ts
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient, type Prisma } from "@prisma/client";
import { prepareScriptDatabase } from "./lib/script-env";
import { createClient } from "@supabase/supabase-js";
import { foldSearchText, generateSlug, permissionsForRoles, productCompletion } from "@rothern/shared";
import {
  BIDS,
  COMPANIES,
  CONNECTIONS,
  LISTINGS,
  PRODUCTS,
  companyCoverPhoto,
  demoAttrProblems,
  marketplaceDemoCategoryRefs,
  marketplaceDemoPhotoRefs,
  marketplaceDemoPhotos,
} from "./lib/marketplace-demo-data";
import {
  assertVisibleSeedCategories,
  resolveVisibleDiscoveryCategory,
  visibleSegmentOf,
  type FindSeedCategory,
} from "./lib/seed-category-guard";

const SCRIPT = "seed-marketplace-demo";

const prisma = new PrismaClient({ datasourceUrl: prepareScriptDatabase("seed-marketplace-demo") });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "Demo1234!";
const DOMAIN = "@demofill.local";
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const genCode = () => {
  const p = () => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  return `${p()}-${p()}`;
};
const days = (n: number) => new Date(Date.now() + n * 86400_000);
// Kayıt akışı üç zorunlu onayı birden yazar; demo hesaplar da onaylı doğar,
// yoksa panel onay penceresi açılır (derin denetim MU-04).
const ACCEPTED = () => {
  const now = new Date();
  return { termsAcceptedAt: now, mediationAcceptedAt: now, kvkkAcceptedAt: now };
};

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

/* ───────────────────────── Yardımcılar ───────────────────────── */
async function nextNumber(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('listing_number_seq') AS n`;
  return `ROT-${String(rows[0]!.n).padStart(6, "0")}`;
}
/**
 * Betiğin TEK katalog sorgusu. `where` her zaman `lib/seed-category-guard`dan
 * gelir ve gizli segment süzgecini (`hiddenCategoryWhere()`) taşır — anahtar
 * kelime yedeği gizli segmente düşemez ("masa" → 42192000, "gümrük" → 93171700).
 */
const findCat: FindSeedCategory = (where) => prisma.category.findFirst({ where, select: { id: true }, orderBy: { id: "asc" } });
const catCache = new Map<string, string>();
/** Kod geçerliyse (discovery, L3+) onu; değilse anahtar kelimeyle en yakın GÖRÜNÜR L3'ü; o da yoksa kodun segmentindeki ilk L3. */
async function resolveCat(code: string, kw?: string): Promise<string> {
  const key = `${code}|${kw ?? ""}`;
  if (catCache.has(key)) return catCache.get(key)!;
  const id = await resolveVisibleDiscoveryCategory(findCat, SCRIPT, code, kw);
  catCache.set(key, id);
  return id;
}
const segmentCode = (code: string) => visibleSegmentOf(findCat, SCRIPT, code);

/* ───────────────────────── Ana akış ───────────────────────── */
/**
 * GÖRSEL DENETİMİ — fail-loud. Demo görselleri repodaki kategori havuzundan
 * geliyor; dosyası olmayan bir koda işaret etmek "kırık görsel" demektir ve
 * kırık görseli kullanıcı canlıda bulmuştu. Koşum başında yakalanır.
 */
function assertPhotos(): void {
  const missing = marketplaceDemoPhotos().filter(
    (src) => !existsSync(resolve(__dirname, "../../../../apps/web/public", src.replace(/^\//, ""))),
  );
  if (missing.length) throw new Error(`Kategori fotoğrafı bulunamadı: ${missing.join(", ")}`);
}

/**
 * NİTELİK DENETİMİ — fail-loud. Kural ve gerekçe `demoAttrProblems`ta
 * (`lib/marketplace-demo-data.ts`); test de aynı işlevi koşar.
 */
function assertAttrs(): void {
  const bad = demoAttrProblems(PRODUCTS);
  if (bad.length) throw new Error(`Demo nitelikleri matrisle uyuşmuyor:\n  ${bad.join("\n  ")}`);
}

async function main() {
  assertPhotos();
  assertAttrs();
  // GİZLİ SEGMENT KAPISI — ilk yazımdan (auth kullanıcısı dahil) ÖNCE.
  // Kodlar VE görseller: gizli segmentin fotoğrafı da o kategoriyi gösterir.
  assertVisibleSeedCategories(SCRIPT, [...marketplaceDemoCategoryRefs(), ...marketplaceDemoPhotoRefs()]);
  console.log("🌱 Pazar yeri demo doluluğu…");
  // İDEMPOTENT: eski demo firmaları SİLİNMEZ (siparişleri var — FK). Sahip
  // e-postası eşleşen firma GÜNCELLENİR, yoksa oluşturulur. Ürünler ve açık
  // ilanlar her koşuda yeniden kurulur (teklifsiz olanlar).
  const id: Record<string, { companyId: string; ownerId: string; slug: string }> = {};
  let lock = 100;
  for (const d of COMPANIES) {
    const email = `${d.key}${DOMAIN}`;
    const authId = await ensureAuthUser(email);
    const sellerCats = (await Promise.all(d.sell.map(segmentCode))).filter((c): c is string => !!c);
    const buyerCats = (await Promise.all(d.buy.map(segmentCode))).filter((c): c is string => !!c);
    const publicProfile = d.publicProfile ?? true;
    const existingUser = await prisma.companyUser.findUnique({ where: { email }, select: { id: true, companyId: true, company: { select: { slug: true } } } });
    const data = {
      name: d.name, tier: d.tier, country: "TR", city: d.city, industry: d.industry,
      activities: d.activities, publicEnabled: publicProfile, publicListingsEnabled: true,
      aboutText: d.about, services: d.services, certifications: d.certs, photos: [companyCoverPhoto(d)],
      coverImageUrl: companyCoverPhoto(d),
      foundedYear: d.founded, employeeCount: d.employees,
      website: `https://${d.key.replace(/-/g, "")}.example.com`,
      companyVerificationStatus: ((d.verified ?? true) ? "VERIFIED" : "UNVERIFIED") as "VERIFIED" | "UNVERIFIED",
      buyerCategoryIds: buyerCats, sellerCategoryIds: sellerCats,
      onboardingCompletedAt: new Date(), isActive: true, isBlocked: false, membershipEndAt: null,
    };
    lock += 10;
    let companyId: string; let ownerId: string; let slug: string;
    if (existingUser) {
      slug = existingUser.company.slug ?? generateSlug(d.name);
      while ((await prisma.company.count({ where: { slug, id: { not: existingUser.companyId } } })) > 0) slug = `${slug}-${Math.floor(Math.random() * 90 + 10)}`;
      await prisma.company.update({ where: { id: existingUser.companyId }, data: { ...data, slug } });
      await prisma.companyUser.update({ where: { id: existingUser.id }, data: { authId, roles: ["SAHIP"], permissions: permissionsForRoles(["SAHIP"]), isActive: true, deletedAt: null, emailVerifiedAt: new Date(), ...ACCEPTED() } });
      companyId = existingUser.companyId; ownerId = existingUser.id;
    } else {
      let code = genCode();
      while ((await prisma.company.count({ where: { rothernId: code } })) > 0) code = genCode();
      slug = generateSlug(d.name);
      while ((await prisma.company.count({ where: { slug } })) > 0) slug = `${slug}-${Math.floor(Math.random() * 90 + 10)}`;
      const company = await prisma.company.create({ data: { ...data, rothernId: code, slug } });
      const firstName = d.name.split(" ")[0] ?? d.name;
      const user = await prisma.companyUser.create({
        data: { email, authId, firstName, lastName: "Yetkili", roles: ["SAHIP"], permissions: permissionsForRoles(["SAHIP"]), companyId: company.id, emailVerifiedAt: new Date(), ...ACCEPTED() },
      });
      await prisma.company.update({ where: { id: company.id }, data: { ownerUserId: user.id } });
      companyId = company.id; ownerId = user.id;
    }
    // Eski demo ürünleri ve TEKLİFSİZ açık ilanları temizle (yeniden kurulacak).
    await prisma.companyItem.deleteMany({ where: { companyId } });
    // Demo teklifleri de sil (hepsi demo firmalardan) — yoksa teklifli ilan
    // kalır ve yeniden oluşturulan ilanla ÇİFTLENİR (2026-09-04'te yaşandı).
    await prisma.listingBid.deleteMany({ where: { listing: { companyId, status: "OPEN", orders: { none: {} } } } });
    await prisma.listing.deleteMany({ where: { companyId, status: "OPEN", orders: { none: {} } } });
    id[d.key] = { companyId, ownerId, slug };
    console.log(`  🏢 ${existingUser ? "güncellendi" : "oluşturuldu"} ${d.name} [${d.tier}] /firma/${slug}`);
  }

  for (const [a, b] of CONNECTIONS) {
    const exists = await prisma.companyConnection.findFirst({
      where: { OR: [{ inviterCompanyId: id[a]!.companyId, inviteeCompanyId: id[b]!.companyId }, { inviterCompanyId: id[b]!.companyId, inviteeCompanyId: id[a]!.companyId }] },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.companyConnection.create({
      data: { inviterCompanyId: id[a]!.companyId, inviteeCompanyId: id[b]!.companyId, status: "ACTIVE", origin: "ADMIN", invitedById: id[a]!.ownerId, decidedAt: new Date() },
    });
  }
  console.log(`  🔗 ${CONNECTIONS.length} bağlantı`);

  let productCount = 0;
  for (const p of PRODUCTS) {
    const o = id[p.owner]!;
    const categoryId = await resolveCat(p.cat, p.catKw);
    let slug = generateSlug(p.name);
    while ((await prisma.companyItem.count({ where: { companyId: o.companyId, slug } })) > 0) slug = `${slug}-2`;
    const priceMode = p.tiers ? "TIERED" : p.price != null ? "FIXED" : "ON_REQUEST";
    const like = {
      name: p.name, categoryId, description: p.desc, images: [p.img], keywords: p.kw,
      priceMode: priceMode as "FIXED" | "TIERED" | "ON_REQUEST", priceAmount: p.price ?? null, priceTiers: p.tiers ?? null, moq: p.moq ?? null, attributes: p.attrs ?? null,
    };
    const score = productCompletion(like).score;
    await prisma.companyItem.create({
      data: {
        companyId: o.companyId, createdById: o.ownerId, name: p.name, description: p.desc, specification: p.spec ?? null,
        brand: p.brand ?? null, mpn: p.mpn ?? null, unit: p.unit, categoryId, keywords: p.kw, images: like.images,
        priceMode, priceAmount: p.price ?? null, priceTiers: (p.tiers ?? undefined) as Prisma.InputJsonValue | undefined,
        priceCurrency: p.cur ?? "TRY", moq: p.moq ?? null, isPublic: true, publishedAt: new Date(Date.now() - Math.floor(Math.random() * 60 * 24) * 3_600_000),
        // Nitelikler `like`ta hesaba katılıyordu ama KAYDA yazılmıyordu:
        // ürün sayfasında Özellikler sekmesi ve karttaki özellik satırı
        // boş kalıyordu (2026-09-07'de yakalandı, veri doğrulamasıyla).
        attributes: (p.attrs ?? undefined) as Prisma.InputJsonValue | undefined,
        slug, completionScore: score, searchText: foldSearchText([p.name, p.brand ?? "", p.mpn ?? "", ...p.kw].join(" ")),
      },
    });
    productCount++;
  }
  console.log(`  📦 ${productCount} ürün (yayında)`);

  const listingRef: { owner: string; title: string; listingId: string }[] = [];
  for (const l of LISTINGS) {
    const o = id[l.owner]!;
    const number = await nextNumber();
    const categoryId = await resolveCat(l.cat, l.catKw);
    const listing = await prisma.listing.create({
      data: {
        number, companyId: o.companyId, createdById: o.ownerId, type: l.type, format: "RFQ",
        visibility: "PUBLIC", title: l.title, description: l.desc, status: "OPEN", publishedAt: days(-Math.floor(Math.random() * 5)),
        closesAt: days(l.closesInDays), primaryCurrency: "TRY", paymentTiming: "AFTER_DELIVERY",
        categoryIds: [categoryId], keywords: l.keywords ?? [], isInternational: l.intl ?? false,
        deliveryTerm: l.deliveryTerm ?? null, requireAllItems: l.requireAll ?? false, publicIndexable: true,
      },
    });
    for (let i = 0; i < l.items.length; i++) {
      const it = l.items[i]!;
      await prisma.listingItem.create({
        data: {
          listingId: listing.id, lineNo: i + 1, name: it.name, quantity: it.quantity, unit: it.unit,
          targetPrice: it.targetPrice ?? null, images: [],
        },
      });
    }
    listingRef.push({ owner: l.owner, title: l.title, listingId: listing.id });
  }
  console.log(`  📋 ${LISTINGS.length} alım talebi`);

  let bidCount = 0;
  for (const b of BIDS) {
    const ref = listingRef.find((r) => r.owner === b.owner && r.title.includes(b.titleIncludes));
    if (!ref) continue;
    await prisma.listingBid.create({
      data: { listingId: ref.listingId, bidderCompanyId: id[b.bidder]!.companyId, createdById: id[b.bidder]!.ownerId, amount: b.amount, currency: "TRY", status: "SUBMITTED", submittedAt: new Date(), deliveryDate: days(20) },
    });
    bidCount++;
  }
  console.log(`  💰 ${bidCount} teklif`);
  console.log("\n✅ Tamam. Giriş: <key>@demofill.local / Demo1234! (ör. anadolu@demofill.local)");
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error("HATA:", e);
  await prisma.$disconnect();
  process.exit(1);
});
