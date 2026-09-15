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

import {
  type CompanyActivity,
  type CompanyRole,
  type CompanyTier,
  type Prisma,
  PrismaClient,
} from "@prisma/client";
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
const photo = (segment: string) => `/categories/${segment.slice(0, 2)}000000.webp`;

/* ───────────────────────── Tanımlar ───────────────────────── */

type UserSpec = { slug: string; firstName: string; lastName: string; roles: CompanyRole[]; owner?: boolean; label: string };

type ProductSpec = {
  name: string;
  /** L3 discovery kodu ya da segment + anahtar kelime ile çözülür. */
  cat: string;
  catKw?: string;
  desc: string;
  brand?: string;
  unit: string;
  kw: string[];
  price?: number;
  tiers?: { minQty: number; unitPrice: number }[];
  moq?: number;
};

type CompanySpec = {
  key: string;
  name: string;
  legalName: string;
  tier: CompanyTier;
  verified: boolean;
  companyType: "JOINT_STOCK" | "LIMITED" | "SOLE_PROPRIETOR";
  taxNumber: string;
  city: string;
  district: string;
  industry: string;
  activities: CompanyActivity[];
  about: string;
  services: string[];
  certs: string[];
  founded: number;
  employees: string;
  /** Seçim (kullanıcının seçtiği derinlik) — ata zinciri betikte türetilir. */
  sellPicks: string[];
  buyPicks: string[];
  users: UserSpec[];
  products: ProductSpec[];
};

const COMPANIES: CompanySpec[] = [
  {
    key: "gold",
    name: "Demo Gold Makina",
    legalName: "Demo Gold Makina Sanayi ve Ticaret A.Ş.",
    tier: "GOLD",
    verified: true,
    companyType: "JOINT_STOCK",
    taxNumber: "9200000011",
    city: "İstanbul",
    district: "Tuzla",
    industry: "Makine ve proses ekipmanı",
    activities: ["MANUFACTURER", "IMPORTER_EXPORTER"],
    founded: 2004,
    employees: "51-250",
    about:
      "Tuzla'daki 9 bin metrekarelik tesisimizde gıda ve kimya sanayi için paslanmaz proses ekipmanı, konveyör ve basınçlı hava sistemleri üretiyoruz. Tasarımdan devreye almaya kadar anahtar teslim çalışıyor, 22 ülkeye ihracat yapıyoruz.",
    services: ["Proje mühendisliği", "Montaj ve devreye alma", "Yedek parça ve bakım"],
    certs: ["ISO 9001", "CE", "ISO 14001"],
    sellPicks: ["24101500", "40151600"],
    buyPicks: ["31000000", "39000000"],
    users: [
      { slug: "gold-kurucu", label: "Kurucu", firstName: "Deniz", lastName: "Kurucu", roles: ["SAHIP", "SATIN_ALMACI", "SATISCI"], owner: true },
      { slug: "gold-yonetici", label: "Yönetici", firstName: "Ece", lastName: "Yönetici", roles: ["YONETICI"] },
      { slug: "gold-satinalmaci", label: "Satınalmacı", firstName: "Mert", lastName: "Satınalma", roles: ["SATIN_ALMACI"] },
      { slug: "gold-satisci", label: "Satışçı", firstName: "Selin", lastName: "Satış", roles: ["SATISCI"] },
      { slug: "gold-onaylayici", label: "Onaylayıcı", firstName: "Onur", lastName: "Onay", roles: ["ONAYLAYICI"] },
    ],
    products: [
      { name: "Modüler Bant Konveyör 600 mm", cat: "24101500", catKw: "konveyör", unit: "m", brand: "Demo Gold", kw: ["konveyör", "bant konveyör", "gıda hattı"], price: 36500, moq: 3,
        desc: "Paslanmaz çelik gövdeli, modüler plastik bantlı konveyör. 600 mm bant genişliği, frekans kontrollü tahrik ve yıkanabilir tasarım; gıda ve ambalaj hatları için metre bazında üretilir." },
      { name: "Vidalı Hava Kompresörü 22 kW 8 bar", cat: "40151600", catKw: "kompresör", unit: "adet", brand: "Demo Gold", kw: ["kompresör", "vidalı kompresör", "basınçlı hava"], price: 318000, moq: 1,
        desc: "22 kW gücünde, 8 bar çalışma basıncında, dakikada 3,6 m³ hava üreten invertörlü vidalı kompresör. Entegre kurutucu seçeneği, kurulum ve iki yıl garanti dahildir." },
      { name: "Paslanmaz Karıştırıcılı Tank 2000 L", cat: "23000000", catKw: "tank", unit: "adet", brand: "Demo Gold", kw: ["karıştırıcı tank", "paslanmaz tank", "proses"],
        desc: "AISI 316L paslanmaz çelikten 2000 litrelik ceketli karıştırıcılı tank. Isıtma ve soğutma ceketi, CIP temizleme başlığı ve seviye sensörüyle gıda ve kozmetik üretimine uygundur." },
      { name: "Endüstriyel Dişli Motor Redüktör", cat: "26000000", catKw: "redüktör", unit: "adet", brand: "Demo Gold", kw: ["redüktör", "dişli motor", "tahrik"],
        tiers: [{ minQty: 1, unitPrice: 14200 }, { minQty: 10, unitPrice: 12900 }, { minQty: 50, unitPrice: 11800 }],
        desc: "Helisel dişli, 0,75–7,5 kW aralığında motorlu redüktör. Konveyör, karıştırıcı ve vinç tahriklerinde kullanılır; yüksek verimli dişli seti ve IP55 motor koruma sınıfıyla sunulur." },
      { name: "Pnömatik Silindir Seti (ISO 15552)", cat: "40000000", catKw: "silindir", unit: "set", brand: "Demo Gold", kw: ["pnömatik silindir", "ISO 15552", "otomasyon"], price: 2450, moq: 10,
        desc: "ISO 15552 standardında çift etkili pnömatik silindir seti. 32–100 mm piston çapı, manyetik piston ve ayarlı yastıklama; otomasyon hatları için bağlantı elemanlarıyla birlikte gönderilir." },
    ],
  },
  {
    key: "silver",
    name: "Demo Silver Elektrik",
    legalName: "Demo Silver Elektrik Malzemeleri Ltd. Şti.",
    tier: "SILVER",
    verified: true,
    companyType: "LIMITED",
    taxNumber: "9200000022",
    city: "Bursa",
    district: "Nilüfer",
    industry: "Elektrik malzemeleri",
    activities: ["DISTRIBUTOR"],
    founded: 2011,
    employees: "11-50",
    about:
      "Bursa merkezli elektrik malzemeleri toptancısıyız. Kablo, pano, şalt malzemesi ve LED aydınlatmada 12 markanın yetkili bayisiyiz; projeye özel fiyat veriyor, Marmara bölgesindeki şantiyelere ertesi gün teslim ediyoruz.",
    services: ["Proje tedariki", "Şantiye teslimi", "Teknik ürün desteği"],
    certs: ["ISO 9001"],
    sellPicks: ["39121600", "26121600"],
    buyPicks: [],
    users: [
      { slug: "silver-kurucu", label: "Kurucu", firstName: "Can", lastName: "Kurucu", roles: ["SAHIP", "SATISCI"], owner: true },
      { slug: "silver-satisci", label: "Satışçı", firstName: "Buse", lastName: "Satış", roles: ["SATISCI"] },
      { slug: "silver-onaylayici", label: "Onaylayıcı", firstName: "Okan", lastName: "Onay", roles: ["ONAYLAYICI"] },
    ],
    products: [
      { name: "NYY Enerji Kablosu 3x2,5 mm²", cat: "26121600", catKw: "kablo", unit: "m", brand: "Demo Silver", kw: ["NYY kablo", "enerji kablosu", "yeraltı kablosu"],
        tiers: [{ minQty: 100, unitPrice: 48 }, { minQty: 1000, unitPrice: 43 }],
        desc: "PVC izoleli, bakır iletkenli 0,6/1 kV NYY enerji kablosu. Toprak altı, kablo kanalı ve dış ortam tesisatlarına uygundur; 100 ve 500 metrelik makaralarda stoktan sevk edilir." },
      { name: "Sıva Üstü Dağıtım Panosu 24 Modül", cat: "39121600", catKw: "pano", unit: "adet", brand: "Demo Silver", kw: ["dağıtım panosu", "sigorta kutusu", "pano"], price: 1650, moq: 5,
        desc: "IP65 koruma sınıfında, 24 modüllü sıva üstü dağıtım panosu. Şeffaf kapak, N ve PE baraları dahil; konut, dükkân ve şantiye elektrik tesisatları için hazır montaj kitiyle gelir." },
      { name: "Kaçak Akım Rölesi 4P 40A 30mA", cat: "39121600", catKw: "röle", unit: "adet", brand: "Demo Silver", kw: ["kaçak akım rölesi", "RCD", "şalt"], price: 890, moq: 10,
        desc: "Dört kutuplu, 40 amper, 30 mA hassasiyetli kaçak akım koruma rölesi. EN 61008 standardına uygun, raya montajlı; insan hayatını ve tesisatı toprak kaçaklarına karşı korur." },
      { name: "LED Endüstriyel Yüksek Tavan Armatürü 150W", cat: "39000000", catKw: "aydınlatma", unit: "adet", brand: "Demo Silver", kw: ["LED armatür", "high bay", "fabrika aydınlatma"],
        desc: "150 watt, 21.000 lümen LED yüksek tavan armatürü. Alüminyum soğutucu gövde, IP65 koruma ve beş yıl garanti; depo, fabrika ve spor salonu aydınlatmasında enerji tasarrufu sağlar." },
    ],
  },
  {
    key: "ucretsiz",
    name: "Demo Ücretsiz Tekstil",
    legalName: "Demo Ücretsiz Tekstil Ltd. Şti.",
    tier: "STANDART",
    verified: false,
    companyType: "LIMITED",
    taxNumber: "9200000033",
    city: "Denizli",
    district: "Merkezefendi",
    industry: "Ev tekstili",
    activities: ["MANUFACTURER"],
    founded: 2016,
    employees: "11-50",
    about:
      "Denizli'de pamuklu havlu, bornoz ve nevresim üretiyoruz. Kendi dokuma ve konfeksiyon atölyemizde otel, spa ve perakende markaları için özel ölçü ve nakışlı ürün hazırlıyor, küçük partilere de üretim yapıyoruz.",
    services: ["Özel nakış", "Otel tekstili", "Fason konfeksiyon"],
    certs: ["OEKO-TEX Standard 100"],
    sellPicks: ["52121700"],
    buyPicks: ["11000000"],
    users: [
      { slug: "ucretsiz-kurucu", label: "Kurucu", firstName: "Aylin", lastName: "Kurucu", roles: ["SAHIP", "SATISCI"], owner: true },
      { slug: "ucretsiz-satisci", label: "Satışçı", firstName: "Emre", lastName: "Satış", roles: ["SATISCI"] },
    ],
    products: [
      { name: "Pamuklu Otel Havlusu 70x140 cm", cat: "52121700", catKw: "havlu", unit: "adet", brand: "Demo Tekstil", kw: ["otel havlusu", "pamuklu havlu", "banyo havlusu"],
        tiers: [{ minQty: 50, unitPrice: 165 }, { minQty: 500, unitPrice: 139 }],
        desc: "Yüzde yüz pamuk, 500 gr/m² ağırlığında beyaz otel havlusu. Endüstriyel yıkamaya dayanıklı dokuma, çift kat kenar dikişi ve isteğe bağlı logo nakışıyla otel ve spa işletmelerine üretilir." },
      { name: "Waffle Bornoz Unisex", cat: "52121700", catKw: "bornoz", unit: "adet", brand: "Demo Tekstil", kw: ["bornoz", "waffle bornoz", "spa"], price: 420, moq: 20,
        desc: "Hafif waffle dokuma pamuklu bornoz, standart ve büyük beden seçenekli. Kuşaklı, iki cepli kesim; spa, otel ve hamam işletmeleri için logo nakışı ve özel renk seçeneğiyle hazırlanır." },
      { name: "Ranforce Nevresim Takımı Çift Kişilik", cat: "52121500", catKw: "nevresim", unit: "takım", brand: "Demo Tekstil", kw: ["nevresim takımı", "ranforce", "otel tekstili"],
        desc: "Yüzde yüz pamuk ranforce kumaştan çift kişilik nevresim takımı. Nevresim, çarşaf ve iki yastık kılıfından oluşur; renk haslığı yüksek boyalar ve fermuarlı kapanışla uzun ömürlü kullanım sunar." },
    ],
  },
];

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

const catCache = new Map<string, string>();
/** Kod geçerli L3+ discovery ise onu; değilse anahtar kelimeyle segmentte en yakın L3. */
async function resolveCat(code: string, kw?: string): Promise<string> {
  const key = `${code}|${kw ?? ""}`;
  const cached = catCache.get(key);
  if (cached) return cached;
  let found = await prisma.category.findFirst({ where: { id: code, inDiscovery: true, level: { gte: 3 } }, select: { id: true } });
  if (!found && kw) {
    found =
      (await prisma.category.findFirst({
        where: { inDiscovery: true, level: 3, id: { startsWith: code.slice(0, 2) }, nameTr: { contains: kw, mode: "insensitive" } },
        select: { id: true },
        orderBy: { id: "asc" },
      })) ??
      (await prisma.category.findFirst({
        where: { inDiscovery: true, level: 3, nameTr: { contains: kw, mode: "insensitive" } },
        select: { id: true },
        orderBy: { id: "asc" },
      }));
  }
  if (!found) {
    found = await prisma.category.findFirst({
      where: { inDiscovery: true, level: 3, id: { startsWith: code.slice(0, 2) } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
  }
  if (!found) throw new Error(`Kategori çözülemedi: ${code} (${kw ?? "-"})`);
  catCache.set(key, found.id);
  return found.id;
}

/** Seçim kodu katalogda yoksa segmentine düşer (beyan boş kalmasın). */
async function existingPick(code: string): Promise<string | null> {
  if (await prisma.category.findFirst({ where: { id: code }, select: { id: true } })) return code;
  const seg = `${code.slice(0, 2)}000000`;
  return (await prisma.category.findFirst({ where: { id: seg }, select: { id: true } })) ? seg : null;
}

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
