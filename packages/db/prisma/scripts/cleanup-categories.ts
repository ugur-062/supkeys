/**
 * ⛔ TARİHSEL — HİÇBİR AKIŞIN PARÇASI DEĞİL. Veritabanına YAZMAZ (2026-10-09).
 *
 * Bu betik 2026-09-01'e kadar segment GİZLEYEN (`isActive=false`) ve 36 segmenti
 * yeniden ADLANDIRAN araçtı (V2-6.5, KOBİ inşaat/elektrik odaklı eski 22.106'lık
 * katalog). İki işin de bugün TEK kaynağı başka yerde:
 *
 *   · HANGİ DAL GİZLİ → `@rothern/shared` `category-catalog.ts`:
 *     `HIDDEN_SEGMENTS` (tümüyle gizli segmentler) + `HIDDEN_BRANCH_PREFIXES`
 *     (görünür segmentin gizli aileleri / sınıfları; 2026-10-10: 46 açık,
 *     silah ve kolluk dalları gizli). Gizleme bir VERİTABANI durumu DEĞİL:
 *     satırlar `isActive=true` kalır, kategori gösteren her okuma o listelerden
 *     süzer (`isHiddenCategory`). Geri almak = listeden çıkarmak.
 *   · SEGMENT ADLARI → `src/seeds/category-translations.curated.tsv` (TR) ve
 *     `category-names.i18n.tsv` (EN/RU); `apply-category-translations` ve
 *     `apply-category-names-i18n` yazar.
 *
 * Betiğin kendi HIDE / RENAME listeleri bu yüzden SİLİNDİ: ikinci ve çelişen
 * bir kaynaktı. `--apply` ile koşulsaydı görünür 20, 21, 71 ve 95'i kapatır,
 * `HIDDEN_SEGMENTS`in gizlediği segmentlerin çoğunu açık bırakır, 78000000'i
 * "Nakliye ve Lojistik Hizmetleri" yapar (bugünkü ad: "Lojistik") ve
 * `searchText`i yeniden kurmadan ad değiştirirdi.
 *
 * Kalan iş SALT OKUNUR bir sapma raporu:
 *   1. segment başına gizlilik durumu (görünür segmentte gizli dalların
 *      önekleri) ve tablodaki pasif satır sayısı (pasif satır = bu betiğin eski
 *      bir `--apply` koşumunun izi; düzeltmesi `seed-categories`),
 *   2. görünür dallarda çıkmaz sokak denetimi (sınıfsız aile, yapraksız sınıf).
 *
 * Kullanım:
 *   pnpm --filter @rothern/db cleanup-categories              # rapor
 *   pnpm --filter @rothern/db cleanup-categories -- --apply   # REDDEDİLİR (çıkış 1)
 */
import { PrismaClient } from "@prisma/client";
import { HIDDEN_BRANCH_PREFIXES, HIDDEN_SEGMENTS, hiddenPrefixesUnder, isHiddenCategory } from "@rothern/shared";
import { prepareScriptDatabase } from "./lib/script-env";

if (process.argv.includes("--apply")) {
  console.error(
    "cleanup-categories: --apply is disabled. This script is historical and never writes. " +
      "Hidden categories live in HIDDEN_SEGMENTS and HIDDEN_BRANCH_PREFIXES (@rothern/shared, category-catalog.ts); " +
      "segment names live in the TSV overlays (apply-category-translations, apply-category-names-i18n).",
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: prepareScriptDatabase("cleanup-categories") });

async function main() {
  console.log("READ-ONLY report (historical script; nothing is written).");
  console.log(`HIDDEN_SEGMENTS (single source, ${HIDDEN_SEGMENTS.length} segments): ${HIDDEN_SEGMENTS.join(" ")}`);
  console.log(
    `HIDDEN_BRANCH_PREFIXES (hidden families / classes under visible segments, ${HIDDEN_BRANCH_PREFIXES.length}): ` +
      `${HIDDEN_BRANCH_PREFIXES.join(" ")}\n`,
  );

  const all = await prisma.category.findMany({
    select: { id: true, code: true, level: true, parentId: true, isActive: true, nameTr: true },
    orderBy: { code: "asc" },
  });

  // 1) Segment başına durum: gizlilik koddan (isHiddenCategory), pasiflik tablodan.
  const inactiveBySegment = new Map<string, number>();
  for (const c of all) {
    if (!c.isActive) inactiveBySegment.set(c.code.slice(0, 2), (inactiveBySegment.get(c.code.slice(0, 2)) ?? 0) + 1);
  }
  let visibleSegments = 0;
  let driftRows = 0;
  console.log("[1/2] Segments (code, hidden state, hidden branches, inactive rows in the table):");
  for (const seg of all.filter((c) => c.level === 1)) {
    const hidden = isHiddenCategory(seg.code);
    const inactive = inactiveBySegment.get(seg.code.slice(0, 2)) ?? 0;
    if (!hidden) visibleSegments++;
    if (inactive > 0) driftRows += inactive;
    const flag = inactive > 0 ? `  <-- ${inactive} inactive row(s)` : "";
    // Görünür segmentin gizli dalları yalnız ÖNEKLE basılır (46: 4610 4611 …).
    const branches = hidden ? [] : hiddenPrefixesUnder(seg.code);
    const branchNote = branches.length > 0 ? `  [hidden branches: ${branches.join(" ")}]` : "";
    // Gizli segmentin ADI basılmaz (kod yeter): gizli kategori adı hiçbir çıktıya yazılmaz.
    console.log(`  ${seg.code}  ${hidden ? "hidden " : "visible"}  ${hidden ? "" : seg.nameTr.slice(0, 60)}${branchNote}${flag}`);
  }
  console.log(`\n  visible segments: ${visibleSegments} · hidden: ${all.filter((c) => c.level === 1).length - visibleSegments}`);
  if (driftRows > 0) {
    console.log(
      `  WARNING: ${driftRows} row(s) have isActive=false. Hiding is not a database state; ` +
        "these come from an old --apply run. seed-categories rebuilds the table with every row active.",
    );
  } else {
    console.log("  no inactive rows (expected: hiding is not a database state).");
  }

  // 2) ÇIKMAZ SOKAK DENETİMİ — görünür dallarda, "iki sıfır" ölçütü.
  //
  // Ağaçta görünüp altında hiçbir şey olmayan bir düğüm, kullanıcı için kırık
  // bir bağlantıdır: tıklar, boş ekran görür. 2026-09-01'de 45 aile bu
  // durumdaydı ve KİMSE fark etmemişti, çünkü hiçbir yerde ölçülmüyordu.
  const shown = all.filter((c) => c.isActive && !isHiddenCategory(c.code));
  const childCount = new Map<string, number>();
  for (const c of shown) {
    if (c.parentId) childCount.set(c.parentId, (childCount.get(c.parentId) ?? 0) + 1);
  }
  const emptyFam = shown.filter((c) => c.level === 2 && !childCount.get(c.id));
  const emptyCls = shown.filter((c) => c.level === 3 && !childCount.get(c.id));
  console.log("\n[2/2] Dead-end check (visible categories only):");
  console.log(`  families without a class : ${emptyFam.length}`);
  console.log(`  classes without a leaf   : ${emptyCls.length}`);
  for (const c of [...emptyFam, ...emptyCls].slice(0, 10)) {
    console.log(`    ${c.code} ${c.nameTr.slice(0, 48)}`);
  }
}

main()
  .catch((e) => {
    console.error("cleanup-categories failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
