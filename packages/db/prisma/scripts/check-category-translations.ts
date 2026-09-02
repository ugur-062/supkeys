/**
 * Çeviri overlay'inin KALİTE NÖBETÇİSİ — canlıya uygulamadan ÖNCE koşulur.
 *
 * En tehlikeli hata çeviri hatası değil, ÇAKIŞMA: model iki farklı kategoriye
 * aynı Türkçe adı verirse alıcı birini, satıcı diğerini seçer ve eşleşme
 * SESSİZCE bölünür (CLAUDE.md "Ad TEKİLLİĞİ"). Kaynaktaki İngilizce adlar
 * ayrıydı; çakışmayı biz üretmiş oluruz.
 *
 * Denetlenenler:
 *   1. Çakışma  — aynı TR ad birden çok kodda (kaynakta zaten çakışan adlar
 *      hariç: onlar Ariba'nın kendi tekrarı, bizim ürettiğimiz değil).
 *   2. Sahipsiz — overlay'de olup katalogda olmayan kod.
 *   3. Şüpheli  — kaynağın 2 katından uzun, boş, Latin dışı harf.
 *
 * Denetim ETKİN overlay üzerinden yapılır (üretilen + elle yazılan birlikte),
 * çünkü kullanıcı nihai adı görüyor.
 *
 * `--fix` ile çakışan grupta İLK kod (kod sırasına göre) çeviriyi korur,
 * diğerlerinin satırı ÜRETİLEN dosyadan DÜŞÜRÜLÜR → onlar İngilizce adıyla
 * kalır. Bilinçli olarak muhafazakâr: yanlış Türkçe bir ad eşleşmeyi bölerken,
 * İngilizce kalan ad yalnız çirkin durur ve elle düzeltilebilir.
 *
 * ELLE YAZILAN dosyaya `--fix` DOKUNMAZ — oradaki satırı bir insan bilerek
 * yazdı; çakışıyorsa raporlanır, kararı insan verir.
 *
 * Çalıştırma:
 *   pnpm --filter @rothern/db check-category-translations
 *   pnpm --filter @rothern/db check-category-translations -- --fix
 */
import * as fs from "fs";
import * as path from "path";
import { readTranslations } from "./lib/category-keywords";
import { CATEGORY_NAME_CHARS } from "./lib/tr-charset";

const SEEDS = path.resolve(__dirname, "../../src/seeds");
const SRC = path.join(SEEDS, "ariba-categories.tsv");
/** `--fix` yalnız BU dosyayı düzenler; elle yazılana dokunulmaz. */
const OUT = path.join(SEEDS, "category-translations.tsv");

interface Row {
  code: string;
  tr: string;
  source: string;
  lineNo: number;
  raw: string;
}

function main() {
  const fix = process.argv.includes("--fix");
  // ETKİN overlay = üretilen + elle yazılan (elle yazılan ezer).
  const effective = readTranslations(SEEDS);
  if (effective.size === 0) {
    console.log("Çeviri overlay'i yok — denetlenecek bir şey yok.");
    return;
  }

  // Katalogdaki adlar (çeviri UYGULANMADAN önceki hâl).
  const catalog = new Map<string, string>();
  for (const line of fs.readFileSync(SRC, "utf-8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const c = line.split("\t");
    if (c[0]) catalog.set(c[0], c[4] ?? "");
  }

  const header: string[] = [];
  const rows: Row[] = [];
  const lines = fs.existsSync(OUT)
    ? fs.readFileSync(OUT, "utf-8").split("\n")
    : [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    if (line.startsWith("#")) {
      header.push(line);
      return;
    }
    const [code, tr, source] = line.split("\t");
    if (!code || !tr) return;
    rows.push({
      code: code.trim(),
      tr: tr.trim(),
      source: (source ?? "").trim(),
      lineNo: i + 1,
      raw: line,
    });
  });

  const curatedOnly = effective.size - rows.length;
  console.log(
    `📄 ${effective.size} etkin çeviri (üretilen ${rows.length} + elle ${curatedOnly})\n`,
  );

  // 1) Sahipsiz kodlar — etkin overlay üzerinden.
  const orphan = [...effective]
    .filter(([code]) => !catalog.has(code))
    .map(([code, t]) => ({ code, tr: t.tr }));
  console.log(`Sahipsiz kod (katalogda yok): ${orphan.length}`);
  orphan.slice(0, 10).forEach((r) => console.log(`   ${r.code}  ${r.tr}`));

  // 2) Şüpheli çeviriler — etkin overlay üzerinden.
  const suspicious = [...effective]
    .filter(([code, t]) => {
      const src = catalog.get(code) ?? t.source;
      if (!src) return false;
      return (
        !t.tr ||
        !CATEGORY_NAME_CHARS.test(t.tr) ||
        t.tr.length > Math.max(60, src.length * 2) ||
        t.tr.toLocaleLowerCase("tr") === src.toLocaleLowerCase("tr")
      );
    })
    .map(([code, t]) => ({ code, tr: t.tr }));
  console.log(`\nŞüpheli çeviri: ${suspicious.length}`);
  suspicious.slice(0, 10).forEach((r) =>
    console.log(`   ${r.code}  "${catalog.get(r.code) ?? "(katalogda yok)"}" → "${r.tr}"`),
  );

  // 3) ÇAKIŞMA — asıl tehlike.
  //
  // Nihai ad = çeviri varsa o, yoksa kaynak. Çakışmayı NİHAİ ad üzerinden
  // ararız: çeviri, çevrilmemiş bir kardeşin adıyla da çakışabilir.
  const finalName = new Map<string, string>();
  for (const [code, name] of catalog) finalName.set(code, name);
  for (const [code, t] of effective) {
    if (catalog.has(code)) finalName.set(code, t.tr);
  }

  // Kaynakta ZATEN çakışan adlar bizim ürettiğimiz değil — ayıklanır.
  const srcDup = new Set<string>();
  const srcSeen = new Map<string, number>();
  for (const name of catalog.values()) {
    const k = name.toLocaleLowerCase("tr");
    const n = (srcSeen.get(k) ?? 0) + 1;
    srcSeen.set(k, n);
    if (n > 1) srcDup.add(k);
  }

  const byFinal = new Map<string, string[]>();
  for (const [code, name] of finalName) {
    const k = name.toLocaleLowerCase("tr");
    if (!byFinal.has(k)) byFinal.set(k, []);
    byFinal.get(k)!.push(code);
  }
  const translated = new Set(effective.keys());
  /** `--fix` yalnız ÜRETİLEN dosyadaki satırı düşürebilir. */
  const fixable = new Set(rows.map((r) => r.code));
  /**
   * Kaynakta AYNI adı taşıyan kodlar çevrildiğinde yine aynı ada düşer; bu
   * çakışmayı çeviri ÜRETMEDİ, kaynakta zaten vardı (UNSPSC'nin kendi
   * tekrarları — bkz. CLAUDE.md "Ad TEKİLLİĞİ"). Yalnız kaynak adları
   * BİRBİRİNDEN FARKLI olan gruplar gerçek yeni çakışmadır.
   */
  const sameSource = (codes: string[]): boolean =>
    new Set(codes.map((c) => (catalog.get(c) ?? "").toLocaleLowerCase("tr")))
      .size === 1;

  const collisions = [...byFinal]
    .filter(([k, codes]) => codes.length > 1 && !srcDup.has(k))
    .filter(([, codes]) => !sameSource(codes))
    .filter(([, codes]) => codes.some((c) => translated.has(c)))
    .map(([k, codes]) => ({ name: k, codes: codes.sort() }));

  const collidingRows = collisions.reduce(
    (a, c) => a + c.codes.filter((x) => translated.has(x)).length,
    0,
  );
  console.log(
    `\n⚠️  ÇEVİRİNİN ÜRETTİĞİ ÇAKIŞMA: ${collisions.length} ad, ${collidingRows} çevrilmiş satır`,
  );
  collisions.slice(0, 15).forEach((c) => {
    console.log(`   "${c.name}"`);
    c.codes.forEach((code) =>
      console.log(
        `      ${code}  ← "${catalog.get(code)}"${translated.has(code) ? " (çeviri)" : " (kaynak)"}`,
      ),
    );
  });

  if (!fix) {
    console.log(
      collisions.length
        ? `\n→ Düzeltmek için: pnpm --filter @rothern/db check-category-translations -- --fix`
        : `\n✅ Çakışma yok.`,
    );
    if (collisions.length || orphan.length) process.exitCode = 1;
    return;
  }

  // --fix: çakışan grupta ilk kod çeviriyi korur, diğerleri overlay'den düşer.
  const drop = new Set<string>();
  for (const c of collisions) {
    let kept = false;
    for (const code of c.codes) {
      if (!translated.has(code)) {
        // Çevrilmemiş bir düğüm adı zaten "sahiplenmiş" — çeviriler çekilir.
        kept = true;
        continue;
      }
      if (!kept) {
        kept = true;
        continue;
      }
      if (!fixable.has(code)) {
        // Elle yazılmış satır — otomatik düşürülmez, insan karar versin.
        console.warn(
          `   ⚠️  ${code} elle yazılmış ve çakışıyor: "${finalName.get(code)}" — curated dosyadan elle düzeltin.`,
        );
        continue;
      }
      drop.add(code);
    }
  }
  for (const r of [...orphan, ...suspicious]) {
    if (fixable.has(r.code)) drop.add(r.code);
  }

  const keptRows = rows.filter((r) => !drop.has(r.code));
  fs.writeFileSync(
    OUT,
    [...header, "", ...keptRows.map((r) => r.raw)].join("\n") + "\n",
    "utf-8",
  );
  console.log(
    `\n✅ ${drop.size} satır overlay'den düşürüldü (o kodlar kaynak adıyla kalıyor).` +
      `\n   ${keptRows.length} çeviri kaldı → ${path.basename(OUT)}`,
  );
}

main();
