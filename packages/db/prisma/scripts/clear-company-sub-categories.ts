/**
 * FİRMA ÜRÜN/HİZMET (ALT KATEGORİ) SEÇİMLERİNİ TEMİZLE (2026-10-29, tek
 * seferlik, idempotent).
 *
 * Sahip kararı 2026-10-29 (S1/S2): firma kategori beyanı YALNIZ SEKTÖR (L1,
 * en fazla 5) — kayıt 2. adım "Faaliyet alanı" ve Ayarlar › Firma Bilgileri ›
 * Kategoriler "Ne alırım / Ne satarım". Mevcut firmaların ürün/hizmet (L2-L4)
 * seçimleri SİLİNİR: `companies.buyerSubCategoryIds` ve
 * `companies.sellerSubCategoryIds` → `{}`.
 *
 * SEKTÖR DİZİSİ KAYIT YOLUYLA AYNI KURALLA YAZILIR (gözden geçirme 2026-10-29).
 * Yalnız alt diziyi boşaltmak, sonucu firmanın temizlikten önce kayıt yapıp
 * yapmadığına bağlı kılardı. Bu yüzden alt seçimi olan her satırda, her eksen
 * için ana dizi, yeni web'in kayıtta gönderdiği listeye getirilir
 * (`apps/web/src/lib/company/declared-sectors.ts` `declaredSectors`; API
 * `company-profile.service.ts` `ekseniIsle` bu listeyi doğrular ve alt diziyi
 * `[]` saklar). Kural:
 *  · Beyanın GÖRÜNEN hâli alınır (`visibleCompanyCategorySelection`, eksenin
 *    iki dizisi birlikte): gizli kodlar düşer; YALNIZ gizli bir seçimin atası
 *    olarak saklanmış görünür sektör de düşer (sahip kuralı 2026-10-10: çıplak
 *    segment "sektörün tamamı" demektir, firma seçmediği bir sektörün bütün
 *    duyurularını alırdı). Ör. 46101500 seçmiş firmanın 46000000'ı.
 *  · Ana dizideki her kod kendi sektörüne yuvarlanır (eski hatalı kayıt).
 *  · Görünür alt seçimlerin sektörleri eklenir: sektörü ana dizide OLMAYAN
 *    alt kod ("öksüz", eski veri izi) bugün ekranda beyanlı sektör olarak
 *    gösteriliyor ve API bir sonraki kayıtta o sektörü ana diziye ekliyor →
 *    temizlik de ekler; firma o sektördeki sert eşleşmesini kaybetmez.
 * Kayıt yolunun REDDETTİĞİ sonuç yazılmaz, satır olduğu gibi bırakılır ve
 * listelenir (elle karar): iki eksende birden sektör kalmıyor (sıfır kategori
 * kapısı), bir eksende `MAX_COMPANY_MAIN_CATEGORIES`'tan fazla sektör, ya da
 * eklenecek sektör katalogda etkin ve görünür bir segment değil.
 *
 * Prisma şema migration'ı DEĞİL: sütunlar kalır (eski web paketleri ve mobil
 * kabuklar dizi yollamaya devam edebilir). İleriye dönük kural API'de: gelen
 * alt dizi sektörüne normalize edilir (sektör ana diziye eklenir) ve `[]`
 * olarak saklanır. Bu betik yalnız GEÇMİŞ veriyi temizler. Alt seçimi OLMAYAN
 * satıra dokunmaz.
 *
 * ⚠️ ÖNCE YEDEK. Staging'de ve canlıda AYRI AYRI koşulur; her ortamda önce
 * yedek (Supabase snapshot/PITR, ya da en azından dört kategori sütununun dışa
 * aktarımı — betik `\copy` komutunu basar), sonra `--dry`, sonra gerçek koşu.
 *
 * EMNİYETLER:
 *  1. İlk satır hedef host + Supabase proje ref'i (`prepareScriptDatabase`;
 *     `ENV_FILE`ı betik okur — kabukta `source` ETME).
 *  2. Bilinmeyen host REDDEDİLİR (kuru çalışmada da): yalnız yerel
 *     (`localhost`, `127.0.0.1`, `::1`, `postgres`, `db`) ve proje ref'i
 *     okunabilen Supabase adresi (`*.pooler.supabase.com` kullanıcı adında
 *     `postgres.<ref>`, ya da `db.<ref>.supabase.co`).
 *  3. Supabase hedefine YAZMAK için `HEDEF=<proje-ref>` adresteki ref'le
 *     BİREBİR eşleşmeli (`wipe-companies` kalıbı); eşleşmezse veritabanına
 *     BAĞLANMADAN çıkış 1. Kuru çalışma ve yerel hedef HEDEF istemez.
 *  4. `--dry` yalnız sayar ve planı basar (alt seçimi olan firma, eksen başına
 *     firma ve toplam kayıt; sektör listesi değişecek satırlar; atlanacak
 *     satırlar), yazmaz.
 *  5. Yazılacak her sektör kodu gizli kategori kapısından geçer
 *     (`assertVisibleSeedCategories`, fail-loud) ve katalog sorgusu gizli
 *     süzgeci taşır (`hiddenCategoryWhere`).
 *  6. Gerçek koşu TEK işlem (`$transaction`: ya bütün satırlar ya hiçbiri).
 *     Her satırın `UPDATE`'i okunan dört diziyle koşullu: arada kayıt yapan
 *     firmanın satırı ezilmez (0 satır → listelenir, yeniden koşun). HAM SQL:
 *     Prisma `update` @updatedAt'i ilerletirdi → sitemap lastmod ve içerik
 *     çevirisi kapsam denetimi sahte "değişti" görürdü (sektör listesi değişen
 *     birkaç satırda lastmod sonraki gerçek kayda dek eski kalır — bilinçli;
 *     firma metni değişmez). Koşudan sonra atlanan
 *     satırlar dışında alt seçim taşıyan firma varsa (alt diziyi hâlâ saklayan
 *     eski API ayakta) çıkış 1.
 *  7. İdempotent: ikinci koşu yalnız atlanan satırları yeniden listeler, hiçbir
 *     şey yazmaz.
 *
 * SIRA: önce alt diziyi `[]` saklayan API dağıtılır, SONRA bu betik koşulur
 * (tersi olursa eski API eski istemcinin dizisini yeniden yazar).
 *
 * Sonra: gece ilgi tablosu (`affinity.recompute`, 03:20 İstanbul) beyan
 * skorlarını yeni hâle göre kendisi yeniden hesaplar; ayrı adım gerekmez.
 *
 *   pnpm --filter @rothern/db clear-company-sub-categories -- --dry                              # kök .env (staging), yazmaz
 *   HEDEF=tmqwyypvxxkwrxequksu pnpm --filter @rothern/db clear-company-sub-categories           # staging, yazar
 *   ENV_FILE=../../.env.prod.local pnpm --filter @rothern/db clear-company-sub-categories -- --dry
 *   ENV_FILE=../../.env.prod.local HEDEF=<canlı-ref> pnpm --filter @rothern/db clear-company-sub-categories
 */
import { PrismaClient } from "@prisma/client";
import {
  MAX_COMPANY_MAIN_CATEGORIES,
  categorySegment,
  hiddenCategoryWhere,
  isCategoryCode,
  visibleCompanyCategorySelection,
} from "@rothern/shared";
import { assertVisibleSeedCategories, type SeedCategoryRef } from "./lib/seed-category-guard";
import { prepareScriptDatabase } from "./lib/script-env";

const SCRIPT = "clear-company-sub-categories";
const STAGING_REF = "tmqwyypvxxkwrxequksu";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres", "db"]);
/** Plan / atlama listesinde basılan en fazla satır (sayımlar her zaman tam). */
const PRINT_LIMIT = 50;

type Target = { kind: "local"; host: string } | { kind: "supabase"; host: string; ref: string };

/** Hedefi sınıflar; bilinmeyen host ya da ref'i okunamayan Supabase adresi → null (reddedilir). */
function classifyTarget(url: string): Target | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) return { kind: "local", host };
  const ref = /\.pooler\.supabase\.com$/.test(host)
    ? /^postgres\.([a-z0-9]+)$/i.exec(decodeURIComponent(u.username))?.[1]
    : /^db\.([a-z0-9]+)\.supabase\.co$/.exec(host)?.[1];
  return ref ? { kind: "supabase", host, ref: ref.toLowerCase() } : null;
}

// Ortam dosyası (ENV_FILE ya da kök .env) PrismaClient'tan ÖNCE yüklenir ve
// hedef ilk satırda basılır; host kapısı BAĞLANILACAK adresi denetler.
const dbUrl = prepareScriptDatabase("clear-company-sub-categories");
const target = classifyTarget(dbUrl);
if (!target) {
  console.error(
    `❌ [${SCRIPT}] Bilinmeyen hedef — yalnız yerel veritabanı ya da proje ref'i okunabilen Supabase adresi kabul edilir. Hiçbir şey okunmadı/yazılmadı.`,
  );
  process.exit(1);
}
console.log(
  target.kind === "local"
    ? `[${SCRIPT}] ortam: YEREL (${target.host})`
    : `[${SCRIPT}] ortam: Supabase projesi ${target.ref}${target.ref === STAGING_REF ? " = STAGING" : " — staging DEĞİL (canlı olabilir)"}`,
);

const dry = process.argv.includes("--dry");
// Yedek dosyası adı İstanbul takvim günüyle (UTC günü gece 00-03 arası dünü verirdi).
const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
const backupName = `company-categories-${target.kind === "supabase" ? target.ref : "local"}-${stamp}.csv`;
console.log(
  "⚠️  ÖNCE YEDEK: Supabase panel → Database → Backups (snapshot / PITR) ya da en azından etkilenen satırların dört kategori sütununu dışa aktarın:\n" +
    `    psql "<DIRECT_URL>" -c "\\copy (SELECT id, \\"buyerCategoryIds\\", \\"buyerSubCategoryIds\\", \\"sellerCategoryIds\\", \\"sellerSubCategoryIds\\" ` +
    `FROM companies WHERE cardinality(\\"buyerSubCategoryIds\\") > 0 OR cardinality(\\"sellerSubCategoryIds\\") > 0) TO '${backupName}' CSV HEADER"`,
);

// HEDEF kilidi BAĞLANMADAN önce: Supabase'e yazmak `HEDEF=<adresteki ref>` ister
// (wipe-companies kalıbı). Kuru çalışma serbest — sayımı görmek için gerekir.
if (!dry && target.kind === "supabase" && process.env.HEDEF !== target.ref) {
  console.error(
    `❌ HEDEF=${process.env.HEDEF ?? "(yok)"} ile adresteki proje ${target.ref} eşleşmiyor — bağlanılmadı, hiçbir şey yazılmadı. ` +
      `Önce \`-- --dry\`, yedekten sonra HEDEF=${target.ref} ile yeniden koşun.`,
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: dbUrl });

interface Counts {
  companies: number;
  buyerCompanies: number;
  sellerCompanies: number;
  buyerEntries: number;
  sellerEntries: number;
}

async function counts(): Promise<Counts> {
  const [r] = await prisma.$queryRaw<
    Array<{ companies: bigint; buyer_companies: bigint; seller_companies: bigint; buyer_entries: bigint; seller_entries: bigint }>
  >`
    SELECT
      count(*) FILTER (WHERE cardinality("buyerSubCategoryIds") > 0 OR cardinality("sellerSubCategoryIds") > 0)::bigint AS companies,
      count(*) FILTER (WHERE cardinality("buyerSubCategoryIds") > 0)::bigint AS buyer_companies,
      count(*) FILTER (WHERE cardinality("sellerSubCategoryIds") > 0)::bigint AS seller_companies,
      coalesce(sum(cardinality("buyerSubCategoryIds")), 0)::bigint AS buyer_entries,
      coalesce(sum(cardinality("sellerSubCategoryIds")), 0)::bigint AS seller_entries
    FROM "companies"`;
  return {
    companies: Number(r!.companies),
    buyerCompanies: Number(r!.buyer_companies),
    sellerCompanies: Number(r!.seller_companies),
    buyerEntries: Number(r!.buyer_entries),
    sellerEntries: Number(r!.seller_entries),
  };
}

interface Row {
  id: string;
  buyerCategoryIds: string[];
  buyerSubCategoryIds: string[];
  sellerCategoryIds: string[];
  sellerSubCategoryIds: string[];
}

interface AxisPlan {
  main: string[];
  dropped: string[];
  added: string[];
}

interface Plan {
  row: Row;
  buyer: AxisPlan;
  seller: AxisPlan;
  /** Doluysa satır YAZILMAZ (kayıt yolunun reddedeceği sonuç); sebep basılır. */
  skip: string[];
}

/**
 * Bir eksenin temizlikten sonraki sektör listesi — web `declaredSectors` ile
 * BİREBİR aynı kural (yeni web her kategori kaydında bu listeyi gönderir).
 * Sıra: önce görünen ana kodlar (sektörüne yuvarlanmış), sonra görünür alt
 * seçimlerden gelen yeni sektörler; tekrar yok.
 */
function sectorsAfterCleanup(main: readonly string[], sub: readonly string[]): string[] {
  const visible = visibleCompanyCategorySelection(main, sub);
  const out = new Set<string>();
  for (const id of visible.mainIds) out.add(categorySegment(id) ?? id);
  for (const id of visible.subIds) {
    const sector = categorySegment(id);
    if (sector) out.add(sector);
  }
  return [...out];
}

function planAxis(main: string[], sub: string[]): AxisPlan {
  const next = sectorsAfterCleanup(main, sub);
  return {
    main: next,
    dropped: main.filter((code) => !next.includes(code)),
    added: next.filter((code) => !main.includes(code)),
  };
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((code, i) => code === b[i]);

async function buildPlans(): Promise<Plan[]> {
  const rows: Row[] = await prisma.company.findMany({
    where: { OR: [{ buyerSubCategoryIds: { isEmpty: false } }, { sellerSubCategoryIds: { isEmpty: false } }] },
    select: { id: true, buyerCategoryIds: true, buyerSubCategoryIds: true, sellerCategoryIds: true, sellerSubCategoryIds: true },
    orderBy: { id: "asc" },
  });
  // EKLENECEK sektör katalogda etkin, görünür bir segment olmalı (API eklenen
  // kodu `validateIds({ exactLevel: 1 })` ile doğrular). Kayıtta zaten duran
  // sektör yeniden doğrulanmaz — dokunulmayan eksende API de doğrulamaz.
  const activeSectors = new Set(
    (await prisma.category.findMany({ where: { level: 1, isActive: true, ...hiddenCategoryWhere() }, select: { id: true } })).map(
      (c) => c.id,
    ),
  );
  return rows.map((row) => {
    const buyer = planAxis(row.buyerCategoryIds, row.buyerSubCategoryIds);
    const seller = planAxis(row.sellerCategoryIds, row.sellerSubCategoryIds);
    const skip: string[] = [];
    if (buyer.main.length === 0 && seller.main.length === 0) {
      skip.push("iki eksende de sektör kalmıyor (beyanın tamamı gizli dalda)");
    }
    for (const [label, axis] of [
      ["alım", buyer],
      ["satış", seller],
    ] as const) {
      if (axis.main.length > MAX_COMPANY_MAIN_CATEGORIES) {
        skip.push(`${label} ekseninde ${axis.main.length} sektör > ${MAX_COMPANY_MAIN_CATEGORIES}`);
      }
      const invalid = axis.added.filter((code) => !activeSectors.has(code));
      if (invalid.length > 0) skip.push(`${label} ekseninde eklenecek sektör katalogda etkin değil: ${invalid.join(", ")}`);
    }
    return { row, buyer, seller, skip };
  });
}

function printCounts(label: string, c: Counts): void {
  console.log(
    `${label}: alt seçimi olan firma ${c.companies} (alım ${c.buyerCompanies} · satış ${c.sellerCompanies}) · ` +
      `toplam kayıt ${c.buyerEntries + c.sellerEntries} (alım ${c.buyerEntries} · satış ${c.sellerEntries})`,
  );
}

function axisChange(label: string, axis: AxisPlan): string | null {
  if (axis.dropped.length === 0 && axis.added.length === 0) return null;
  const parts = [...axis.dropped.map((c) => `−${c}`), ...axis.added.map((c) => `+${c}`)];
  return `${label} ${parts.join(" ")} → [${axis.main.join(", ")}]`;
}

function printPlan(plans: Plan[]): void {
  const writable = plans.filter((p) => p.skip.length === 0);
  const changing = writable.filter((p) => axisChange("", p.buyer) || axisChange("", p.seller));
  const dropped = changing.reduce((n, p) => n + p.buyer.dropped.length + p.seller.dropped.length, 0);
  const added = changing.reduce((n, p) => n + p.buyer.added.length + p.seller.added.length, 0);
  console.log(
    `plan: ${writable.length} firma yazılacak (alt diziler → {}) · sektör listesi değişen ${changing.length} firma ` +
      `(düşen kod ${dropped} · eklenen sektör ${added}) · atlanacak ${plans.length - writable.length} firma`,
  );
  if (changing.length > 0) {
    console.warn(
      "⚠️  Sektör listesi değişen firmalar (kayıt yolunun kuralı: yalnız gizli bir seçimin atası olan ya da gizli sektör DÜŞER, " +
        "sektörü ana dizide olmayan alt kodun sektörü EKLENİR, sektör altı ana kod sektörüne yuvarlanır):",
    );
    for (const p of changing.slice(0, PRINT_LIMIT)) {
      const parts = [axisChange("alım", p.buyer), axisChange("satış", p.seller)].filter(Boolean);
      console.warn(`    ${p.row.id}  ${parts.join(" · ")}`);
    }
    if (changing.length > PRINT_LIMIT) console.warn(`    … ve ${changing.length - PRINT_LIMIT} firma daha`);
  }
  const skipped = plans.filter((p) => p.skip.length > 0);
  if (skipped.length > 0) {
    console.warn(
      `⚠️  ATLANACAK (yazılmaz, alt seçimler yerinde kalır — elle karar): ${skipped.length} firma. ` +
        "Kayıt yolu bu sonucu reddederdi; firmayla konuşulup sektörü Ayarlar › Kategoriler'den seçilir ya da sahip karar verir:",
    );
    for (const p of skipped.slice(0, PRINT_LIMIT)) console.warn(`    ${p.row.id}  ${p.skip.join(" · ")}`);
    if (skipped.length > PRINT_LIMIT) console.warn(`    … ve ${skipped.length - PRINT_LIMIT} firma daha`);
  }
}

async function main() {
  const before = await counts();
  printCounts(dry ? "(kuru çalışma — yazılmayacak) önce" : "önce", before);
  const plans = await buildPlans();
  printPlan(plans);
  const writable = plans.filter((p) => p.skip.length === 0);
  const skippedIds = new Set(plans.filter((p) => p.skip.length > 0).map((p) => p.row.id));

  // Gizli kategori kapısı (fail-loud): görünür beyandan türediği için gizli
  // kod çıkmamalı; çıkarsa hiçbir şey yazılmadan durulur.
  const refs: SeedCategoryRef[] = writable.flatMap((p) => [
    ...p.buyer.main.filter(isCategoryCode).map((code) => ({ source: `company ${p.row.id} buyerCategoryIds`, code })),
    ...p.seller.main.filter(isCategoryCode).map((code) => ({ source: `company ${p.row.id} sellerCategoryIds`, code })),
  ]);
  assertVisibleSeedCategories(SCRIPT, refs);

  if (dry) {
    console.log("KURU ÇALIŞMA — hiçbir şey yazılmadı.");
    return;
  }
  if (writable.length === 0) {
    console.log(
      skippedIds.size > 0
        ? `✅ Yazılacak firma yok; yalnız elle karar bekleyen ${skippedIds.size} firma var (yukarıda).`
        : "✅ Alt seçimi olan firma yok — yapılacak iş yok (idempotent).",
    );
    return;
  }

  // TEK işlem: ya bütün satırlar ya hiçbiri. Her UPDATE okunan dört diziyle
  // koşullu → arada kaydedilmiş satır ezilmez (0 satır döner). Ham SQL,
  // @updatedAt'e dokunmaz.
  const results = await prisma.$transaction(
    writable.map(
      ({ row, buyer, seller }) => prisma.$executeRaw`
        UPDATE "companies"
        SET "buyerCategoryIds" = ${buyer.main}::text[],
            "sellerCategoryIds" = ${seller.main}::text[],
            "buyerSubCategoryIds" = '{}',
            "sellerSubCategoryIds" = '{}'
        WHERE "id" = ${row.id}
          AND "buyerCategoryIds" = ${row.buyerCategoryIds}::text[]
          AND "buyerSubCategoryIds" = ${row.buyerSubCategoryIds}::text[]
          AND "sellerCategoryIds" = ${row.sellerCategoryIds}::text[]
          AND "sellerSubCategoryIds" = ${row.sellerSubCategoryIds}::text[]`,
    ),
  );
  const raced = writable.filter((_, i) => results[i] !== 1).map((p) => p.row.id);
  const done = writable.length - raced.length;
  const mainChanged = writable.filter(
    (p, i) => results[i] === 1 && (!sameList(p.buyer.main, p.row.buyerCategoryIds) || !sameList(p.seller.main, p.row.sellerCategoryIds)),
  ).length;
  console.log(`✅ ${done} firmanın alt seçimleri temizlendi; ${mainChanged} firmanın sektör listesi kayıt kuralına getirildi.`);
  if (raced.length > 0) {
    console.error(
      `❌ ${raced.length} firma koşu sırasında değişti, yazılmadı (yeniden koşun — betik idempotent): ${raced.slice(0, PRINT_LIMIT).join(", ")}`,
    );
    process.exitCode = 1;
  }

  const after = await counts();
  printCounts("sonra", after);
  const leftover = (
    await prisma.company.findMany({
      where: { OR: [{ buyerSubCategoryIds: { isEmpty: false } }, { sellerSubCategoryIds: { isEmpty: false } }] },
      select: { id: true },
    })
  ).filter((c) => !skippedIds.has(c.id));
  if (skippedIds.size > 0) console.warn(`⚠️  Elle karar bekleyen ${skippedIds.size} firmanın alt seçimleri yerinde (yukarıdaki liste).`);
  if (leftover.length > 0) {
    // Atlanan satırlar dışında alt seçim var: koşu sırasında yazıldı (alt
    // diziyi hâlâ saklayan eski API sürümü ayakta) ya da satır yarıştı.
    console.error(
      `❌ Koşudan sonra atlananlar dışında ${leftover.length} firma yine alt seçim taşıyor — API sürümünü denetleyip yeniden koşun.`,
    );
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
