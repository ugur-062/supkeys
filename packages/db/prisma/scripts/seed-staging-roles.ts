/**
 * STAGING ROL HESAPLARI (2026-09-11) — yayın öncesi rol rol manuel tur ve
 * Playwright akışları için hazır firmalar + kullanıcılar. İdempotent: yeniden
 * koşmak parolayı yeniler, kayıtları çoğaltmaz.
 *
 * Kullanım (root .env staging'i göstermeli):
 *   pnpm --filter @rothern/db seed-staging-roles
 *   STAGING_QA_PASSWORD='...' pnpm --filter @rothern/db seed-staging-roles
 *
 * GÜVENLİK: DATABASE_URL staging proje referansını içermiyorsa DURUR
 * (ALLOW_ANY_DB=1 ile bilinçli aşılır). Canlıda sabit parolalı QA hesabı
 * açılmasın diye.
 *
 * E-postalar Gmail artı-adresleme ile TEK gerçek kutuya düşer
 * (uguray156+qa-…@gmail.com): staging bildirimleri gerçek bir kutuya gider,
 * var olmayan alan adına gönderip Resend itibarını bozmayız.
 */
import { type CompanyRole, type CompanyTier, PrismaClient } from "@prisma/client";
import { VIEWER_PRESET, permissionsForRoles, generateShortCode } from "@rothern/shared";
import { createClient } from "@supabase/supabase-js";

const STAGING_REF = "tmqwyypvxxkwrxequksu";
const MAILBOX = "uguray156";
const PASSWORD = process.env.STAGING_QA_PASSWORD ?? "Staging1234!";

const dbUrl = process.env.DATABASE_URL ?? "";
if (!dbUrl.includes(STAGING_REF) && process.env.ALLOW_ANY_DB !== "1") {
  console.error(
    "❌ DATABASE_URL staging projesini göstermiyor — bu seed yalnız staging içindir (ALLOW_ANY_DB=1 ile aşılır).",
  );
  process.exit(1);
}

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const qaEmail = (slug: string) => `${MAILBOX}+qa-${slug}@gmail.com`;

async function ensureAuthUser(email: string): Promise<string> {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) {
      await supabase.auth.admin.updateUserById(hit.id, { password: PASSWORD });
      return hit.id;
    }
    if (data.users.length < 200) break;
    page++;
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

async function uniqueRothernId(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateShortCode();
    if ((await prisma.company.count({ where: { rothernId: code } })) === 0) return code;
  }
  throw new Error("rothernId üretilemedi");
}

type UserSpec = {
  slug: string;
  firstName: string;
  lastName: string;
  roles: CompanyRole[];
  /** roles boşsa (Görüntüleyici) verilir. */
  permissions?: readonly string[];
  owner?: boolean;
};

type CompanySpec = {
  key: string;
  name: string;
  tier: CompanyTier;
  verified: boolean;
  /** Tekil (unique) — doğrulanmış firmalarda dolu. */
  taxNumber?: string;
  city: string;
  industry: string;
  users: UserSpec[];
};

const COMPANIES: CompanySpec[] = [
  {
    key: "alici",
    name: "QA Alıcı Sanayi A.Ş.",
    tier: "GOLD",
    verified: true,
    taxNumber: "9100000001",
    city: "İstanbul",
    industry: "Makine İmalatı",
    users: [
      { slug: "alici-kurucu", firstName: "Kurucu", lastName: "Alıcı", roles: ["SAHIP", "SATIN_ALMACI", "SATISCI"], owner: true },
      { slug: "alici-yonetici", firstName: "Yönetici", lastName: "Alıcı", roles: ["YONETICI"] },
      { slug: "alici-satinalmaci", firstName: "Satın", lastName: "Almacı", roles: ["SATIN_ALMACI"] },
      { slug: "alici-satisci", firstName: "Satış", lastName: "Alıcı", roles: ["SATISCI"] },
      { slug: "alici-onaylayici", firstName: "Onay", lastName: "Alıcı", roles: ["ONAYLAYICI"] },
      { slug: "alici-goruntuleyici", firstName: "Görüntü", lastName: "Alıcı", roles: [], permissions: VIEWER_PRESET },
    ],
  },
  {
    key: "tedarikci",
    name: "QA Tedarikçi Ltd. Şti.",
    tier: "SILVER",
    verified: true,
    taxNumber: "9100000002",
    city: "Bursa",
    industry: "Elektrik Malzemeleri",
    users: [
      { slug: "tedarikci-kurucu", firstName: "Kurucu", lastName: "Tedarikçi", roles: ["SAHIP", "SATIN_ALMACI", "SATISCI"], owner: true },
      { slug: "tedarikci-satisci", firstName: "Satış", lastName: "Tedarikçi", roles: ["SATISCI"] },
      { slug: "tedarikci-goruntuleyici", firstName: "Görüntü", lastName: "Tedarikçi", roles: [], permissions: VIEWER_PRESET },
    ],
  },
  {
    // İKİNCİ tedarikçi: kapalı zarf ve çok-teklifli akış tek firmayla
    // doğrulanamaz (rakip teklifi görmemeli kuralı iki AYRI firma ister).
    key: "tedarikci2",
    name: "QA Tedarikçi 2 A.Ş.",
    tier: "SILVER",
    verified: true,
    taxNumber: "9100000003",
    city: "Kocaeli",
    industry: "Metal İşleme",
    users: [
      { slug: "tedarikci2-kurucu", firstName: "Kurucu", lastName: "Tedarikçi2", roles: ["SAHIP", "SATIN_ALMACI", "SATISCI"], owner: true },
      { slug: "tedarikci2-satisci", firstName: "Satış", lastName: "Tedarikçi2", roles: ["SATISCI"] },
    ],
  },
  {
    key: "ucretsiz",
    name: "QA Ücretsiz Firma",
    tier: "STANDART",
    verified: false,
    city: "İzmir",
    industry: "Ambalaj",
    users: [
      { slug: "ucretsiz-kurucu", firstName: "Kurucu", lastName: "Ücretsiz", roles: ["SAHIP", "SATIN_ALMACI", "SATISCI"], owner: true },
    ],
  },
];

async function ensureCompany(spec: CompanySpec): Promise<string> {
  const ownerSpec = spec.users.find((u) => u.owner)!;
  const ownerEmail = qaEmail(ownerSpec.slug);
  const existing = await prisma.companyUser.findUnique({ where: { email: ownerEmail }, select: { companyId: true } });
  let companyId: string;
  if (existing) {
    companyId = existing.companyId;
    await prisma.company.update({
      where: { id: companyId },
      data: {
        tier: spec.tier,
        companyVerificationStatus: spec.verified ? "VERIFIED" : "UNVERIFIED",
        onboardingCompletedAt: new Date(),
      },
    });
    console.log(`ℹ️  Firma var: ${spec.name}`);
  } else {
    const co = await prisma.company.create({
      data: {
        name: spec.name,
        legalName: spec.name,
        rothernId: await uniqueRothernId(),
        tier: spec.tier,
        country: "TR",
        city: spec.city,
        industry: spec.industry,
        publicEnabled: true,
        onboardingCompletedAt: new Date(),
        companyVerificationStatus: spec.verified ? "VERIFIED" : "UNVERIFIED",
      },
    });
    companyId = co.id;
    console.log(`✅ Firma: ${spec.name} [${co.rothernId}] ${spec.tier}${spec.verified ? " VERIFIED" : ""}`);
  }

  for (const u of spec.users) {
    const email = qaEmail(u.slug);
    const authId = await ensureAuthUser(email);
    const perms = u.roles.length > 0 ? permissionsForRoles(u.roles) : [...(u.permissions ?? VIEWER_PRESET)];
    const now = new Date();
    const user = await prisma.companyUser.upsert({
      where: { email },
      create: {
        email,
        authId,
        firstName: u.firstName,
        lastName: u.lastName,
        roles: u.roles,
        permissions: perms,
        companyId,
        isActive: true,
        emailVerifiedAt: now,
        termsAcceptedAt: now,
        kvkkAcceptedAt: now,
        mediationAcceptedAt: now,
      },
      update: { authId, roles: u.roles, permissions: perms, isActive: true, companyId },
    });
    if (u.owner) {
      await prisma.company.update({ where: { id: companyId }, data: { ownerUserId: user.id } });
    }
    console.log(`   👤 ${email} — ${u.roles.join("+") || "Görüntüleyici"}`);
  }
  // Doğrulama bekleyen kimlik alanları (Firma Bilgileri kilit senaryosu için).
  if (spec.verified && spec.taxNumber) {
    await prisma.company.update({
      where: { id: companyId },
      data: { taxNumber: spec.taxNumber, taxOffice: `${spec.city} VD`, companyType: "LIMITED" },
    });
  }
  return companyId;
}

async function ensureConnection(a: string, b: string) {
  const exists = await prisma.companyConnection.findFirst({
    where: { OR: [{ inviterCompanyId: a, inviteeCompanyId: b }, { inviterCompanyId: b, inviteeCompanyId: a }] },
  });
  if (exists) return;
  const owner = await prisma.companyUser.findFirst({ where: { companyId: a }, select: { id: true } });
  await prisma.companyConnection.create({
    data: {
      inviterCompanyId: a,
      inviteeCompanyId: b,
      status: "ACTIVE",
      origin: "ADMIN",
      invitedById: owner!.id,
      decidedAt: new Date(),
    },
  });
  console.log("🔗 Bağlantı kuruldu");
}

async function main() {
  console.log(`🌱 Staging rol hesapları (parola: ${PASSWORD === "Staging1234!" ? "varsayılan" : "STAGING_QA_PASSWORD"})`);
  const ids: Record<string, string> = {};
  for (const c of COMPANIES) ids[c.key] = await ensureCompany(c);
  await ensureConnection(ids.alici!, ids.tedarikci!);
  console.log("🌱 Tamam. Giriş: uguray156+qa-<slug>@gmail.com / parola yukarıdaki.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
