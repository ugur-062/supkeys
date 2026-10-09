/**
 * STAGING DEMO HESAPLARI (2026-09-15) — ürünü baştan sona gezmek için üç hazır
 * firma: Ücretsiz · Silver · Gold. Her birinde profil DOLU, ürünler ONAYLI ve
 * vitrinde, kullanıcılar pakete göre alınabilecek her rolden.
 *
 * `seed-staging-roles`tan AYRI: o betik yetki/e2e testleri içindir (profil ve
 * ürün taşımaz, testler ona dayanır). Bu betik elle gezinti ve demo içindir.
 *
 * ROLLER PAKET KURALLARINA UYAR (CLAUDE.md "Paketler, İzinler, Koltuk"):
 *  · Satınalma yetkisi yalnız GOLD'da → Satınalmacı yalnız Gold firmada.
 *  · Kurucu Silver/Ücretsiz'de yalnız satış koltuğuyla, Gold'da iki koltukla.
 *  · Koltuk tavanı: Ücretsiz 2 · Silver 4 · Gold 6 — aşılmaz.
 *  · Ücretsiz firma DOĞRULANMAMIŞ (yeni kayıt olan firmanın doğal hâli;
 *    doğrulama → paket akışı bu hesapla denenir). Silver ve Gold doğrulanmış.
 *
 * İDEMPOTENT: kurucu e-postasıyla firma bulunur, güncellenir; ürünleri silinip
 * yeniden kurulur. Yeniden koşmak şifreyi de yeniler.
 *
 * Kullanım (root .env staging'i göstermeli):
 *   STAGING_DEMO_PASSWORD='…' pnpm --filter @rothern/db seed-staging-demo
 *
 * GÜVENLİK: DATABASE_URL staging proje referansını içermiyorsa DURUR; şifre
 * repoya yazılmaz, ortam değişkeninden okunur.
 *
 * VERİ `lib/staging-demo-data.ts`te. GİZLİ SEGMENT (2026-10-09): betik Prisma
 * ile DOĞRUDAN yazar → gizli segmentteki (`HIDDEN_SEGMENTS`) tek bir kod bile
 * varsa hiçbir şey yazmadan DURUR (`assertVisibleSeedCategories`) ve katalog
 * sorguları gizli segmenti süzer (`lib/seed-category-guard.ts`).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const line of readFileSync(resolve(__dirname, "../../.env"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trimStart().startsWith("#")) {
    const k = line.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
}

import { type Prisma, PrismaClient } from "@prisma/client";
import {
  countSeats,
  expandCompanyCategorySelection,
  foldSearchText,
  generateShortCode,
  generateSlug,
  ibanChecksumOk,
  permissionsForRoles,
  productCompletion,
  SEAT_LIMITS,
} from "@rothern/shared";
import { createClient } from "@supabase/supabase-js";
import {
  assertVisibleSeedCategories,
  existingVisiblePick,
  resolveVisibleDiscoveryCategory,
  type FindSeedCategory,
} from "./lib/seed-category-guard";
import { COMPANIES, type CompanySpec, photo, stagingDemoCategoryRefs, stagingDemoPhotoRefs } from "./lib/staging-demo-data";

const SCRIPT = "seed-staging-demo";
const STAGING_REF = "tmqwyypvxxkwrxequksu";
const MAILBOX = "uguray156";
const PASSWORD = process.env.STAGING_DEMO_PASSWORD ?? "";

const rawUrl = process.env.DATABASE_URL ?? "";
if (!rawUrl.includes(STAGING_REF)) {
  console.error("❌ DATABASE_URL staging projesini göstermiyor — bu seed yalnız staging içindir.");
  process.exit(1);
}
if (PASSWORD.length < 10) {
  console.error("❌ STAGING_DEMO_PASSWORD en az 10 karakter olmalı (şifre repoya yazılmaz).");
  process.exit(1);
}

// PgBouncer üzerinden hazırlanmış ifade hatası olmasın (CLAUDE.md staging notu).
const url = rawUrl.includes("pgbouncer=")
  ? rawUrl
  : `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}pgbouncer=true&connection_limit=1`;
const prisma = new PrismaClient({ datasources: { db: { url } } });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const demoEmail = (slug: string) => `${MAILBOX}+demo-${slug}@gmail.com`;

/* ───────────────────────── Yardımcılar ───────────────────────── */

async function ensureAuthUser(email: string): Promise<string> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) {
      const { error: upErr } = await supabase.auth.admin.updateUserById(hit.id, { password: PASSWORD, email_confirm: true });
      if (upErr) throw new Error(`updateUser ${email}: ${upErr.message}`);
      return hit.id;
    }
    if (data.users.length < 200) break;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { type: "company" },
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

/** Geçerli (mod-97) TR IBAN üretir: TR + kontrol + 5 banka + 0 + 16 hesap. */
function trIban(bank: string, account: string): string {
  const bban = `${bank}0${account}`;
  const numeric = `${bban}292700`; // "TR00" → T=29, R=27, 00
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  const check = String(98 - rem).padStart(2, "0");
  const iban = `TR${check}${bban}`;
  if (!ibanChecksumOk(iban)) throw new Error(`IBAN üretilemedi: ${iban}`);
  return iban;
}

/**
 * Betiğin TEK katalog sorgusu. `where` her zaman `lib/seed-category-guard`dan
 * gelir ve gizli segment süzgecini (`hiddenCategoryWhere()`) taşır — anahtar
 * kelime yedeği ("tank", "redüktör", "silindir") gizli segmente düşemez.
 */
const findCat: FindSeedCategory = (where) => prisma.category.findFirst({ where, select: { id: true }, orderBy: { id: "asc" } });
const catCache = new Map<string, string>();
/** Kod geçerli L3+ discovery ise onu; değilse anahtar kelimeyle GÖRÜNÜR katalogda en yakın L3. */
async function resolveCat(code: string, kw?: string): Promise<string> {
  const key = `${code}|${kw ?? ""}`;
  const cached = catCache.get(key);
  if (cached) return cached;
  const id = await resolveVisibleDiscoveryCategory(findCat, SCRIPT, code, kw);
  catCache.set(key, id);
  return id;
}

/** Seçim kodu katalogda yoksa segmentine düşer (beyan boş kalmasın); gizli kod DURDURUR. */
const existingPick = (code: string) => existingVisiblePick(findCat, SCRIPT, code);

function assertSpecs(): void {
  const problems: string[] = [];
  for (const c of COMPANIES) {
    const seats = countSeats(
      c.users.map((u) => ({ isOwner: !!u.owner, roles: u.roles, permissions: permissionsForRoles(u.roles) })),
    ).total;
    const limit = SEAT_LIMITS[c.tier];
    if (limit != null && seats > limit) problems.push(`${c.name}: ${seats} koltuk > ${limit}`);
    if (c.tier !== "GOLD" && c.users.some((u) => u.roles.includes("SATIN_ALMACI"))) {
      problems.push(`${c.name}: satınalma yetkisi yalnız GOLD'da verilebilir`);
    }
    for (const p of c.products) {
      if (p.desc.length < 100) problems.push(`${p.name}: açıklama < 100 karakter (yayın kapısı)`);
      if (!existsSync(resolve(__dirname, "../../../../apps/web/public", photo(p.cat).slice(1)))) {
        problems.push(`${p.name}: kategori fotoğrafı yok (${photo(p.cat)})`);
      }
    }
  }
  if (problems.length) throw new Error(`Demo tanımları kurallara uymuyor:\n  ${problems.join("\n  ")}`);
}

/* ───────────────────────── Ana akış ───────────────────────── */

async function ensureCompany(spec: CompanySpec, idx: number) {
  const owner = spec.users.find((u) => u.owner)!;
  const ownerEmail = demoEmail(owner.slug);

  const sellPicks = (await Promise.all(spec.sellPicks.map(existingPick))).filter((c): c is string => !!c);
  const buyPicks = (await Promise.all(spec.buyPicks.map(existingPick))).filter((c): c is string => !!c);
  const sell = expandCompanyCategorySelection(sellPicks, sellPicks.filter((c) => c.endsWith("000000")));
  const buy = expandCompanyCategorySelection(buyPicks, buyPicks.filter((c) => c.endsWith("000000")));

  const now = new Date();
  const iban = trIban("00062", `${String(idx + 1).padStart(4, "0")}123456789012`);
  const docStatus = spec.verified ? "APPROVED" : undefined;
  const data = {
    name: spec.name,
    legalName: spec.legalName,
    companyType: spec.companyType,
    taxNumber: spec.taxNumber,
    taxOffice: `${spec.city} Vergi Dairesi`,
    country: "TR",
    city: spec.city,
    district: spec.district,
    addressLine: `${spec.district} Organize Sanayi Bölgesi, Demo Cad. No:${idx + 10}`,
    postalCode: "34000",
    industry: spec.industry,
    activities: spec.activities,
    website: `https://${spec.key}.demo.rothern.com`,
    mersisNo: `0${spec.taxNumber}00015`,
    tradeRegistryNo: `${spec.city.slice(0, 3).toUpperCase()}-${100000 + idx}`,
    iban,
    ibanHolder: spec.legalName,
    billingTitle: spec.legalName,
    buyerCategoryIds: buy.mainIds,
    buyerSubCategoryIds: buy.subIds,
    sellerCategoryIds: sell.mainIds,
    sellerSubCategoryIds: sell.subIds,
    tier: spec.tier,
    membershipEndAt: spec.tier === "STANDART" ? null : new Date(now.getTime() + 365 * 86400_000),
    companyVerificationStatus: spec.verified ? ("VERIFIED" as const) : ("UNVERIFIED" as const),
    companyVerifiedAt: spec.verified ? now : null,
    ...(docStatus
      ? {
          docTaxPlateStatus: docStatus,
          docTradeRegistryStatus: docStatus,
          docSignatureCircularStatus: docStatus,
          docActivityCertStatus: docStatus,
          docIdFrontStatus: docStatus,
          docIdBackStatus: docStatus,
        }
      : {}),
    onboardingCompletedAt: now,
    publicEnabled: true,
    publicListingsEnabled: true,
    aboutText: spec.about,
    coverImageUrl: photo(spec.sellPicks[0] ?? "81000000"),
    services: spec.services,
    certifications: spec.certs,
    foundedYear: spec.founded,
    employeeCount: spec.employees,
    isActive: true,
    isBlocked: false,
  } satisfies Prisma.CompanyUncheckedUpdateInput;

  const existing = await prisma.companyUser.findUnique({ where: { email: ownerEmail }, select: { companyId: true } });
  let companyId: string;
  let slug: string;
  if (existing) {
    companyId = existing.companyId;
    const cur = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { slug: true } });
    slug = cur.slug ?? generateSlug(spec.name);
    await prisma.company.update({ where: { id: companyId }, data: { ...data, slug } });
  } else {
    // Vergi no tekil: başka bir kayıtta varsa (eski koşum kalıntısı) düşürülür.
    await prisma.company.updateMany({ where: { taxNumber: spec.taxNumber }, data: { taxNumber: null } });
    let rothernId = generateShortCode();
    while ((await prisma.company.count({ where: { rothernId } })) > 0) rothernId = generateShortCode();
    slug = generateSlug(spec.name);
    while ((await prisma.company.count({ where: { slug } })) > 0) slug = `${slug}-${Math.floor(Math.random() * 90 + 10)}`;
    const co = await prisma.company.create({ data: { ...data, rothernId, slug } });
    companyId = co.id;
  }

  const userIds: Record<string, string> = {};
  for (const u of spec.users) {
    const email = demoEmail(u.slug);
    const authId = await ensureAuthUser(email);
    const permissions = permissionsForRoles(u.roles);
    const row = await prisma.companyUser.upsert({
      where: { email },
      create: {
        email,
        authId,
        firstName: u.firstName,
        lastName: u.lastName,
        roles: u.roles,
        permissions,
        companyId,
        isActive: true,
        emailVerifiedAt: now,
        termsAcceptedAt: now,
        kvkkAcceptedAt: now,
        mediationAcceptedAt: now,
      },
      update: {
        authId,
        firstName: u.firstName,
        lastName: u.lastName,
        roles: u.roles,
        permissions,
        companyId,
        isActive: true,
        deletedAt: null,
        emailVerifiedAt: now,
      },
    });
    userIds[u.slug] = row.id;
  }
  const ownerId = userIds[owner.slug]!;
  await prisma.company.update({ where: { id: companyId }, data: { ownerUserId: ownerId } });

  // Ürünler: sil + yeniden kur (onaylı, vitrinde).
  await prisma.companyItem.deleteMany({ where: { companyId } });
  for (const p of spec.products) {
    const categoryId = await resolveCat(p.cat, p.catKw);
    const images = [photo(p.cat)];
    const priceMode = p.tiers ? "TIERED" : p.price != null ? "FIXED" : "ON_REQUEST";
    let pslug = generateSlug(p.name);
    while ((await prisma.companyItem.count({ where: { companyId, slug: pslug } })) > 0) pslug = `${pslug}-2`;
    const score = productCompletion({
      name: p.name,
      categoryId,
      description: p.desc,
      images,
      keywords: p.kw,
      priceMode,
      priceAmount: p.price ?? null,
      priceTiers: p.tiers ?? null,
      moq: p.moq ?? null,
      attributes: null,
    }).score;
    const publishedAt = new Date(now.getTime() - Math.floor(Math.random() * 20 * 24) * 3_600_000);
    await prisma.companyItem.create({
      data: {
        companyId,
        createdById: ownerId,
        name: p.name,
        description: p.desc,
        brand: p.brand ?? null,
        unit: p.unit,
        categoryId,
        keywords: p.kw,
        images,
        priceMode,
        priceAmount: p.price ?? null,
        priceTiers: (p.tiers ?? undefined) as Prisma.InputJsonValue | undefined,
        priceCurrency: "TRY",
        moq: p.moq ?? null,
        isPublic: true,
        publishedAt,
        reviewStatus: "APPROVED",
        submittedAt: publishedAt,
        reviewedAt: publishedAt,
        slug: pslug,
        completionScore: score,
        searchText: foldSearchText([p.name, p.brand ?? "", ...p.kw].join(" ")),
      },
    });
  }

  return { companyId, ownerId, slug };
}

async function ensureConnection(a: { companyId: string; ownerId: string }, b: { companyId: string }) {
  const exists = await prisma.companyConnection.findFirst({
    where: {
      OR: [
        { inviterCompanyId: a.companyId, inviteeCompanyId: b.companyId },
        { inviterCompanyId: b.companyId, inviteeCompanyId: a.companyId },
      ],
    },
    select: { id: true },
  });
  if (exists) return;
  await prisma.companyConnection.create({
    data: {
      inviterCompanyId: a.companyId,
      inviteeCompanyId: b.companyId,
      status: "ACTIVE",
      origin: "ADMIN",
      invitedById: a.ownerId,
      decidedAt: new Date(),
    },
  });
}

async function main() {
  assertSpecs();
  // GİZLİ SEGMENT KAPISI — ilk yazımdan (auth kullanıcısı dahil) ÖNCE.
  // Kodlar VE görseller: gizli segmentin fotoğrafı da o kategoriyi gösterir.
  assertVisibleSeedCategories(SCRIPT, [...stagingDemoCategoryRefs(), ...stagingDemoPhotoRefs()]);
  const ids: Record<string, { companyId: string; ownerId: string; slug: string }> = {};
  for (const [i, c] of COMPANIES.entries()) {
    ids[c.key] = await ensureCompany(c, i);
    console.log(`🏢 ${c.name} [${c.tier}${c.verified ? " · doğrulanmış" : " · doğrulanmamış"}] /firma/${ids[c.key]!.slug} — ${c.products.length} ürün`);
    for (const u of c.users) console.log(`   ${u.label.padEnd(12)} ${demoEmail(u.slug)}`);
  }
  // Gold alıcı iki tedarikçiyle bağlı: ücretsiz firma davetli/bağlantılı
  // taleplere teklif verebilsin, Silver da bağlantı listesini dolu görsün.
  await ensureConnection(ids.gold!, ids.silver!);
  await ensureConnection(ids.gold!, ids.ucretsiz!);
  console.log("🔗 Gold ↔ Silver, Gold ↔ Ücretsiz bağlantıları hazır");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
