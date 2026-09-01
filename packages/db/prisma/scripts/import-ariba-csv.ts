/**
 * Ariba kategori CSV'lerini seed TSV'sine çevirir — TEK YÖNLÜ, TEK SEFERLİK ARAÇ.
 *
 * İKİ KAYNAK, İKİ KULLANIM YERİ (2026-09-02):
 *
 *   ariba-tum-kategoriler-hiyerarsik.csv        → FİRMA kategori seçimi
 *     "hangi alandasınız" — firmanın ana/alt kategorileri. TAM katalog.
 *   ariba-discovery-tum-kategoriler-hiyerarsik.csv → TALEP ve İLAN kategorisi
 *     Ariba Discovery'nin yayımladığı alt küme.
 *
 * Her ikisi de `Kod;Seviye;Ad;Seviye1;Seviye2;Seviye3;Seviye4;TamYol`
 * (UTF-8 BOM + CRLF).
 *
 * ÖLÇÜLEN FARK (2026-09-02 dışa aktarımları): iki katalog YALNIZ L4 yaprakta
 * ayrışır. L1 (58 segment), L2 (558 aile) ve L3 (7.966 sınıf) kod ve ad olarak
 * BİREBİR aynıdır. Fark tam olarak iki şeydir:
 *   • 13 yaprak yalnız `tum`da (Plastik Kasalar, Nakış Hizmetleri, …)
 *   • 31 kodda `tum` İKİNCİ bir ad taşır (aşağıya bak)
 * Bu yüzden iki katalog tek tabloda, kod başına tek satır + `inDiscovery`
 * bayrağıyla temsil edilir; ayrı ağaç/ayrı tablo gerekmez.
 *
 * AD'LARA DOKUNULMAZ — bilinçli ürün kararı: kullanıcıya gösterilen ağaç Ariba
 * kataloğunun birebir kendisidir. Çeviri, kısaltma, tekilleştirme, gizleme YOK.
 * Script yalnız iki mekanik dönüşüm yapar:
 *   1. Kod 8 haneye sıfır-doldurulur (Ariba seviyeye göre 2/4/6/8 hane yazar;
 *      platformun `Category.id` şeması 8 hane sabit).
 *   2. Üst kod aynı koddan türetilir (segment=XX, aile=XXXX, sınıf=XXXXXX).
 *
 * ÇAKIŞAN KODLAR — `tum`da 31 kod İKİ farklı ad taşıyor ve bunlar çeviri
 * DEĞİL, kaynak verinin defekti: Ariba TR zaten dolu bir UNSPSC koduna özel
 * kategori yazmış (53131639 = "Urinary incontinence pad" / "Dil temizleyici";
 * 56131604 = "Paint color center component" / "Alışveriş Sepetleri").
 * `Category.id = kod` tekil olduğu için biri düşmek ZORUNDA.
 *
 *   KURAL: ortak kodlarda DISCOVERY'nin adı kazanır.
 *
 * Gerekçe: kazanan ad İKİ katalogda da AYNI olmak zorunda. Aksi hâlde alıcı
 * "Urinary incontinence pad" talebi açar, tedarikçi "Dil temizleyici" beyan
 * eder — aynı kod, dolayısıyla eşleştirme alakasız iki ürünü sessizce çiftler.
 * Discovery'yi taban almak talep/ilan seçicisini kaynağıyla %100 birebir
 * yapar; düşen ad `keywords` sütununa yazıldığı için arama onu yine bulur
 * (searchText'e katlanır, ETİKET olarak görünmez).
 *
 * Çalıştırma:
 *   pnpm --filter @rothern/db import-ariba-csv -- <tum-csv> <discovery-csv>
 */
import * as fs from "fs";
import * as path from "path";

const OUT_TSV = path.resolve(__dirname, "../../src/seeds/ariba-categories.tsv");
const OUT_DUPS = path.resolve(
  __dirname,
  "../../../../docs/category-duplicate-codes.md",
);

/** Ariba seviye→hane: 1=2, 2=4, 3=6, 4=8. Platform şeması 8 hane sabit. */
const pad8 = (code: string) => code.padEnd(8, "0");

interface SrcRow {
  code: string;
  level: number;
  parentCode: string;
  nameTr: string;
  /** Kaynak dosyadaki satır no — çakışma raporunda iz sürmek için. */
  lineNo: number;
}

interface Parsed {
  /** Kod → o kodun DOSYADAKİ İLK satırı. */
  first: Map<string, SrcRow>;
  /** Kod → o kodun tüm satırları (çakışmaları görebilmek için). */
  all: Map<string, SrcRow[]>;
  /** Dosya sırasını koruyan tekil kod listesi. */
  order: string[];
  skipped: number;
}

function parseCsv(csvPath: string): Parsed {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV bulunamadı: ${csvPath}`);
  }
  let raw = fs.readFileSync(csvPath, "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // BOM
  const lines = raw.split(/\r?\n/);

  const header = lines[0]?.trim();
  if (!header?.startsWith("Kod;Seviye;Ad;")) {
    throw new Error(
      `Beklenmeyen başlık satırı (${path.basename(csvPath)}): ${header?.slice(0, 80)}`,
    );
  }

  const first = new Map<string, SrcRow>();
  const all = new Map<string, SrcRow[]>();
  const order: string[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.trim()) continue;
    const f = line.split(";");
    const rawCode = f[0]?.trim() ?? "";
    const level = Number(f[1]);
    const nameTr = f[2]?.trim() ?? "";

    // Fail-loud değil fail-visible: bozuk satır sayılır ve sonda raporlanır.
    if (
      !/^\d+$/.test(rawCode) ||
      !(level >= 1 && level <= 4) ||
      rawCode.length !== level * 2 ||
      !nameTr
    ) {
      skipped++;
      continue;
    }

    const code = pad8(rawCode);
    const row: SrcRow = {
      code,
      level,
      parentCode: level === 1 ? "" : pad8(rawCode.slice(0, (level - 1) * 2)),
      nameTr,
      lineNo: i + 1,
    };

    if (!all.has(code)) all.set(code, []);
    all.get(code)!.push(row);
    if (!first.has(code)) {
      first.set(code, row);
      order.push(code);
    }
  }

  return { first, all, order, skipped };
}

/**
 * İki dosyanın üst katmanlarının (L1-L3) AYNI olduğunu doğrular.
 *
 * Bugün aynılar ve tüm tasarım buna dayanıyor: ağacın gezinilebilir omurgası
 * tek, yalnız yapraklar süzülüyor. İleride bir dışa aktarım omurgada ayrışırsa
 * sessizce birleştirmek iki kataloğu da bozar — o yüzden burada DURULUR.
 */
function assertSameSpine(tum: Parsed, disc: Parsed) {
  for (const level of [1, 2, 3]) {
    const sig = (p: Parsed) =>
      [...p.first.values()]
        .filter((r) => r.level === level)
        .map((r) => `${r.code}=${r.nameTr}`)
        .sort()
        .join("\n");
    const a = sig(tum);
    const b = sig(disc);
    if (a !== b) {
      const setA = new Set(a.split("\n"));
      const setB = new Set(b.split("\n"));
      const onlyTum = [...setA].filter((x) => !setB.has(x)).slice(0, 5);
      const onlyDisc = [...setB].filter((x) => !setA.has(x)).slice(0, 5);
      throw new Error(
        `İki katalog L${level} katmanında AYRIŞIYOR — tek omurga varsayımı bozuldu.\n` +
          `  yalnız tum : ${onlyTum.join(" | ") || "-"}\n` +
          `  yalnız disc: ${onlyDisc.join(" | ") || "-"}\n` +
          `Bu tasarım (tek tablo + inDiscovery bayrağı) yalnız L4'te ayrışmaya göre kurulu.`,
      );
    }
  }
}

function main() {
  const [tumPath, discPath] = process.argv.slice(2);
  if (!tumPath || !discPath) {
    throw new Error(
      "Kullanım: pnpm --filter @rothern/db import-ariba-csv -- <tum-csv> <discovery-csv>",
    );
  }

  const tum = parseCsv(tumPath);
  const disc = parseCsv(discPath);

  assertSameSpine(tum, disc);

  // Discovery, tam kataloğun ALT KÜMESİ olmalı — değilse talep/ilan seçicisi
  // firma kataloğunda karşılığı olmayan bir kod üretebilir ve o kod hiçbir
  // firmayla eşleşemez.
  const notInTum = disc.order.filter((c) => !tum.first.has(c));
  if (notInTum.length > 0) {
    throw new Error(
      `Discovery'de olup tam katalogda olmayan ${notInTum.length} kod var ` +
        `(ör. ${notInTum.slice(0, 5).join(", ")}). Discovery alt küme olmalı.`,
    );
  }

  // ── Birleştirme: kod başına TEK satır. Ad = discovery'ninki (varsa). ──
  const rows: Array<
    SrcRow & { inDiscovery: boolean; altNames: string[] }
  > = [];
  const dropped: Array<{
    code: string;
    kept: string;
    droppedName: string;
    lineNo: number;
    keptFrom: "discovery" | "tum";
  }> = [];

  for (const code of tum.order) {
    const inDiscovery = disc.first.has(code);
    const chosen = inDiscovery ? disc.first.get(code)! : tum.first.get(code)!;

    // Kaynaklardaki DİĞER adlar — kaybolmasınlar diye keywords'e taşınır.
    const seenNames = new Set([chosen.nameTr]);
    const altNames: string[] = [];
    for (const r of [...(tum.all.get(code) ?? []), ...(disc.all.get(code) ?? [])]) {
      if (seenNames.has(r.nameTr)) continue;
      seenNames.add(r.nameTr);
      altNames.push(r.nameTr);
      dropped.push({
        code,
        kept: chosen.nameTr,
        droppedName: r.nameTr,
        lineNo: r.lineNo,
        keptFrom: inDiscovery ? "discovery" : "tum",
      });
    }

    rows.push({ ...chosen, code, inDiscovery, altNames });
  }

  // Hiyerarşi bütünlüğü — öksüz düğüm ağaçta ERİŞİLEMEZ olur, sessiz kalmasın.
  const byCode = new Set(rows.map((r) => r.code));
  const orphans = rows.filter((r) => r.parentCode && !byCode.has(r.parentCode));
  if (orphans.length > 0) {
    throw new Error(
      `Kırık hiyerarşi: ${orphans.length} düğümün üstü sette yok (ör. ${orphans[0]?.code} → ${orphans[0]?.parentCode})`,
    );
  }

  // Discovery yaprağının ÜSTÜ de discovery'de olmalı; omurga ortak olduğu için
  // bu bugün otomatik sağlanıyor ama bayrak elle bozulursa erken yakalansın.
  // (Set ile — 158 bin satırda `rows.find` iç içe taramaya dönerdi.)
  const discCodes = new Set(rows.filter((r) => r.inDiscovery).map((r) => r.code));
  const brokenDisc = rows.filter(
    (r) => r.inDiscovery && r.parentCode && !discCodes.has(r.parentCode),
  );
  if (brokenDisc.length > 0) {
    throw new Error(
      `Discovery ağacında kopuk dal: ${brokenDisc.length} düğümün üstü discovery dışı (ör. ${brokenDisc[0]?.code})`,
    );
  }

  // segmentLetter: UI rozeti (A, B, C…). Kod sırasına göre benzersiz.
  // 58 segment > 26 harf → 27.'den itibaren iki harf (AA, AB…).
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const letterByCode = new Map<string, string>();
  rows
    .filter((r) => r.level === 1)
    .sort((a, b) => a.code.localeCompare(b.code))
    .forEach((seg, idx) => {
      letterByCode.set(
        seg.code,
        idx < alphabet.length
          ? alphabet.charAt(idx)
          : alphabet.charAt(Math.floor(idx / alphabet.length) - 1) +
            alphabet.charAt(idx % alphabet.length),
      );
    });

  const byLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const discByLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of rows) {
    byLevel[r.level] = (byLevel[r.level] ?? 0) + 1;
    if (r.inDiscovery) discByLevel[r.level] = (discByLevel[r.level] ?? 0) + 1;
  }
  const discOnlyOut = rows.filter((r) => !r.inDiscovery);

  const out: string[] = [
    `# Ariba kategori kataloğu — İKİ dışa aktarımdan ÜRETİLDİ, elle düzenlenmez.`,
    `#   tam (firma kategori seçimi) : ${path.basename(tumPath)}`,
    `#   discovery (talep/ilan)      : ${path.basename(discPath)}`,
    `# Üretici: prisma/scripts/import-ariba-csv.ts · ADLAR BİREBİR.`,
    `# Biçim: <kod8> ⇥ <seviye> ⇥ <üstKod8> ⇥ <segmentHarfi> ⇥ <ad> ⇥ <inDiscovery 1|0> ⇥ <altAdlar |-ayrık>`,
    `# ${rows.length} kategori — L1:${byLevel[1]} L2:${byLevel[2]} L3:${byLevel[3]} L4:${byLevel[4]}`,
    `# Discovery alt kümesi: ${rows.length - discOnlyOut.length} — L1:${discByLevel[1]} L2:${discByLevel[2]} L3:${discByLevel[3]} L4:${discByLevel[4]}`,
  ];
  for (const r of rows) {
    out.push(
      [
        r.code,
        String(r.level),
        r.parentCode,
        letterByCode.get(r.code) ?? "",
        r.nameTr,
        r.inDiscovery ? "1" : "0",
        r.altNames.join("|"),
      ].join("\t"),
    );
  }
  fs.writeFileSync(OUT_TSV, out.join("\n") + "\n", "utf-8");

  // ── Rapor: düşen adlar + discovery dışı yapraklar ──
  const md: string[] = [
    "# Ariba kataloğunda çakışan kodlar ve katalog farkı",
    "",
    "Üretim: `import-ariba-csv.ts` — bu dosya ELLE düzenlenmez.",
    "",
    `| Kaynak | Dosya |`,
    `| --- | --- |`,
    `| Firma kategori seçimi (tam) | \`${path.basename(tumPath)}\` |`,
    `| Talep/ilan kategorisi (discovery) | \`${path.basename(discPath)}\` |`,
    "",
    "## Katalog farkı",
    "",
    "İki dışa aktarım **yalnız L4 yaprakta** ayrışır — L1/L2/L3 kod ve ad olarak",
    "birebir aynıdır. Bu yüzden tek tabloda, kod başına tek satır + `inDiscovery`",
    "bayrağıyla tutuluyorlar.",
    "",
    `- Tam katalog: **${rows.length}** kategori (L1:${byLevel[1]} · L2:${byLevel[2]} · L3:${byLevel[3]} · L4:${byLevel[4]})`,
    `- Discovery alt kümesi: **${rows.length - discOnlyOut.length}**`,
    `- Yalnız tam katalogda: **${discOnlyOut.length}** yaprak (talep/ilan açarken seçilemez, firma beyan edebilir)`,
    "",
    "| Kod | Seviye | Ad |",
    "| --- | --- | --- |",
    ...discOnlyOut.map((r) => `| \`${r.code}\` | L${r.level} | ${r.nameTr} |`),
    "",
    "## Çakışan kodlar",
    "",
    "Kaynakta aynı 8 haneli kodu paylaşan farklı adlar var. Bunlar çeviri",
    "**değil**: Ariba TR zaten dolu bir UNSPSC koduna özel kategori yazmış",
    "(`53131639` = *Urinary incontinence pad* / *Dil temizleyici*). `Category.id =",
    "kod` tekil olduğu için biri düşmek zorunda.",
    "",
    "**Kural: ortak kodlarda discovery'nin adı kazanır.** Kazanan ad iki katalogda",
    "da aynı olmalı — aksi hâlde alıcı bir ürünü, tedarikçi bambaşka bir ürünü",
    "beyan eder ve eşleştirme aynı kod üzerinden ikisini sessizce çiftler.",
    "",
    "Düşen ad kaybolmuyor: `keywords` sütununa yazılıyor, `searchText`'e katlanıyor.",
    "Yani **arama düşen adı yine bulur**, yalnız etiket olarak görünmez.",
    "",
    `Toplam ${dropped.length} ad düştü.`,
    "",
    "| Kod | Kalan ad | Düşen ad (aramada bulunur) | Kaynak satır |",
    "| --- | --- | --- | --- |",
    ...dropped.map(
      (d) =>
        `| \`${d.code}\` | ${d.kept} | ${d.droppedName} | ${d.lineNo} |`,
    ),
  ];
  fs.writeFileSync(OUT_DUPS, md.join("\n") + "\n", "utf-8");

  console.log(`✅ ${rows.length} kategori yazıldı → ${OUT_TSV}`);
  console.log(
    `   Segment: ${byLevel[1]} · Aile: ${byLevel[2]} · Sınıf: ${byLevel[3]} · Yaprak: ${byLevel[4]}`,
  );
  console.log(
    `   Discovery alt kümesi: ${rows.length - discOnlyOut.length} (yalnız tam katalogda ${discOnlyOut.length} yaprak)`,
  );
  console.log(`⚠️  ${dropped.length} çakışan ad keywords'e taşındı → ${OUT_DUPS}`);
  if (tum.skipped > 0) console.log(`⚠️  tum: ${tum.skipped} bozuk satır atlandı`);
  if (disc.skipped > 0) console.log(`⚠️  disc: ${disc.skipped} bozuk satır atlandı`);
}

try {
  main();
} catch (e) {
  console.error("❌ İçe aktarma hatası:", e);
  process.exit(1);
}
