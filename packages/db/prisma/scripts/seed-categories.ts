/**
 * Kategori seed — Ariba kataloğu, BİREBİR.
 *
 * Kaynak: packages/db/src/seeds/ariba-categories.tsv (158.018 kategori)
 *   `<kod8> ⇥ <seviye> ⇥ <üstKod8> ⇥ <segmentHarfi> ⇥ <ad> ⇥ <inDiscovery> ⇥ <altAdlar>`
 *   Üreten: prisma/scripts/import-ariba-csv.ts — ADLARA DOKUNULMAZ.
 *
 * İKİ KATALOG, TEK TABLO (2026-09-02): Ariba'nın iki dışa aktarımı var —
 * tam katalog (firma "hangi alandasınız" seçimi) ve Discovery alt kümesi
 * (talep/ilan kategorisi). Ölçüldü: yalnız L4 yaprakta ayrışıyorlar, L1/L2/L3
 * birebir aynı, fark 13 yaprak. O yüzden ayrı tablo değil, kod başına tek
 * satır + `inDiscovery` bayrağı. Süzme kapısı BACKEND'de
 * (`company-listings.service.ts` talep/ilan için `inDiscovery: true` şart
 * koşar; `category-selection.helper.ts` firma için koşmaz).
 *
 * ÜRÜN KARARI (2026-09-01): firma kategori seçiminde gösterilen ağaç, Ariba
 * kataloğunun birebir kendisidir. Daha önce burada üç kaynak birleşiyordu
 * (UNGM UNSPSC çıkarımı + elle küratörlü x99 boşluklar + AI-üretilmiş
 * yapraklar) ve `cleanup-categories` sonradan 20 segmenti gizleyip 24'ünü
 * yeniden adlandırıyordu. İkisi de KALDIRILDI: kaynak tek, ad tek, gizleme
 * yok. Katalog artık 22.106 yerine 158.018 kategori, 16.867 yerine hepsi
 * aktif.
 *
 *   ⚠️ `cleanup-categories` bu akışın PARÇASI DEĞİL. Koşarsa segment gizler
 *   ve adları değiştirir — yani birebir garantisini bozar.
 *
 * Hiyerarşi 8 haneli koddan türer (segment=XX000000, aile=XXXX0000,
 * sınıf=XXXXXX00, emtia=XXXXXXXX). Category.id = kod (stabil + parent çözümü
 * bedava). Idempotent: eski kategorileri siler, yeniden kurar.
 *
 * Çalıştırma: `pnpm --filter @rothern/db seed-categories`
 */
import { PrismaClient } from "@prisma/client";
import { foldSearchText } from "@rothern/shared";
import * as fs from "fs";
import * as path from "path";
import { buildKeywordsByCode } from "./lib/category-keywords";

/**
 * UZUN İŞLEM → DIRECT_URL (session mode, 5432).
 *
 * DATABASE_URL Supavisor'un TRANSACTION modundaki havuzu (6543) ve
 * `pool_timeout=20` ile geliyor. 158 bin satırlık sil+kur işlemi orada tek
 * sunucu bağlantısını dakikalarca tutar; havuz baskısı altında işlem
 * ortasında kopabilir. Session modunda böyle bir yarış yok.
 */
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

interface Cat {
  code: string;
  level: number;
  parentCode: string | null;
  segmentLetter: string | null;
  nameTr: string;
  /** Discovery alt kümesinde de var mı — talep/ilan seçimi bunu süzer. */
  inDiscovery: boolean;
  /**
   * Kaynakta aynı kodu paylaşan DİĞER adlar (31 kod). Etiket olarak
   * gösterilmezler ama `keywords`'e katlandıkları için arama onları bulur —
   * "Hazır Beton" yazan kullanıcı 30111505'e ulaşır. Gerekçe:
   * docs/category-duplicate-codes.md.
   */
  altNames: string;
}

/**
 * createMany chunk'ı. Satır başına 10 kolon → 5.000 × 10 = 50.000 parametre,
 * Postgres'in 65.535 tavanının altında. 158 bin satır = ~32 tur (2.000'lik
 * chunk'ta 80 tur olurdu; uzak Supabase'de tur başına ~215 ms gecikme).
 */
const CHUNK = 5000;

async function main() {
  console.log("🌱 Ariba kategori seed başlıyor...\n");

  const filePath = path.resolve(
    __dirname,
    "../../src/seeds/ariba-categories.tsv",
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Dosya bulunamadı: ${filePath}\n` +
        `Üretmek için: pnpm --filter @rothern/db import-ariba-csv -- <tum-csv> <discovery-csv>`,
    );
  }

  // Eşanlamlılar + çakışmadan düşen adlar — searchText'e katlanarak girer, ADI
  // DEĞİŞTİRMEZ. Bileşim TEK KAYNAKTAN (`lib/category-keywords.ts`) geliyor:
  // `apply-category-keywords` de aynı fonksiyonu çağırıyor, çünkü o script
  // kolonu REPLACE ediyor — iki bileşim ayrışsaydı apply koşumu seed'in
  // yazdığının bir kısmını sessizce silerdi.
  // Ariba kataloğunda karşılığı olmayan kodlar sessizce düşer: sözlük kataloğu
  // genişletemez, yalnız aramayı besler.
  const { byCode: keywordsByCode, generated, curated, altNames } =
    buildKeywordsByCode(path.resolve(__dirname, "../../src/seeds"));

  const cats: Cat[] = [];
  const seen = new Set<string>();
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [code, levelStr, parentCode, segmentLetter, nameTr, discFlag, altNames] =
      line.split("\t");
    const level = Number(levelStr);
    if (!code || !/^\d{8}$/.test(code) || level < 1 || level > 4 || !nameTr) {
      console.warn(`⚠️  Atlanan satır: ${line.slice(0, 40)}`);
      continue;
    }
    if (seen.has(code)) {
      console.warn(`⚠️  Yinelenen kod atlandı: ${code} (${nameTr.slice(0, 30)})`);
      continue;
    }
    seen.add(code);
    cats.push({
      code,
      level,
      parentCode: parentCode || null,
      segmentLetter: segmentLetter || null,
      nameTr: nameTr.trim(),
      // Sütun YOKSA `true` — eski 5 sütunlu bir TSV ile koşulursa katalog
      // daralmasın; discovery kapısı fazladan kod SIZDIRMAZ, yalnız 13
      // yaprağı da talep/ilan seçimine açar (fail-open, bilinçli: alternatifi
      // tüm kataloğu talep seçiminden düşürmek olurdu).
      inDiscovery: discFlag === undefined ? true : discFlag.trim() !== "0",
      altNames: (altNames ?? "").split("|").join(" ").trim(),
    });
  }

  // Öksüz düğüm ağaçta ERİŞİLEMEZ olur — baştan yakalanır.
  for (const c of cats) {
    if (c.parentCode && !seen.has(c.parentCode)) {
      throw new Error(
        `Kırık hiyerarşi: ${c.code} (${c.nameTr}) parent'ı ${c.parentCode} sette yok`,
      );
    }
  }

  const byLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const c of cats) byLevel[c.level] = (byLevel[c.level] ?? 0) + 1;
  const discCount = cats.filter((c) => c.inDiscovery).length;
  const altCount = cats.filter((c) => c.altNames).length;

  console.log(`📄 ${cats.length} kategori okundu`);
  console.log(`   Segment:   ${byLevel[1]}`);
  console.log(`   Family:    ${byLevel[2]}`);
  console.log(`   Class:     ${byLevel[3]}`);
  console.log(`   Commodity: ${byLevel[4]}`);
  console.log(
    `   Discovery alt kümesi (talep/ilan): ${discCount} — yalnız firma seçiminde: ${cats.length - discCount}`,
  );
  console.log(
    `   Arama sözlüğü: ${keywordsByCode.size} kod (üretilen ${generated} + elle ${curated} + düşen ad ${altNames})`,
  );
  console.log(`   TSV'de alternatif ad taşıyan kod: ${altCount}\n`);

  // Sil + yeniden kur TEK İŞLEMDE.
  //
  // Neden: bu script CANLI veritabanına koşuyor (dev ve prod aynı Supabase).
  // İşlem dışında yapıldığında, `deleteMany` ile son `createMany` arasında
  // kopan bir bağlantı kategori tablosunu BOŞ ya da yarım bırakır — kategori
  // seçimi, arama ve ilan eşleştirmesi o anda çöker ve script yeniden koşana
  // kadar öyle kalır. İşlem içinde aynı hata sessizce geri sarılır, eski ağaç
  // yerinde durur.
  //
  // Sil+kur (upsert değil) BİLİNÇLİ: kaldırılan kategoriler de temizlenmeli.
  // Güvenli olmasının sebebi FK olmaması — firma/ilan seçimleri `categoryIds`
  // String[] olarak KOD saklıyor ve Category.id = kod sabit (CLAUDE.md).
  console.log("🧹+💾 Kategoriler tek işlemde yeniden kuruluyor...");
  const startedAt = Date.now();
  let inserted = 0;
  await prisma.$transaction(
    async (tx) => {
      await tx.category.deleteMany({});
      for (let level = 1; level <= 4; level++) {
        const levelCats = cats
          .filter((c) => c.level === level)
          .sort((a, b) => a.code.localeCompare(b.code));

        for (let i = 0; i < levelCats.length; i += CHUNK) {
          const chunk = levelCats.slice(i, i + CHUNK);
          await tx.category.createMany({
            data: chunk.map((c, idx) => {
              // Küratörlü sözlük + kaynakta düşen alternatif adlar (ikisi de
              // `buildKeywordsByCode` içinde birleşti). YALNIZ aramayı besler
              // (searchText); etiket `nameTr` kalır.
              const kw = keywordsByCode.get(c.code) ?? "";
              return {
                id: c.code,
                code: c.code,
                nameTr: c.nameTr,
                keywords: kw,
                searchText: foldSearchText(`${c.nameTr} ${kw}`),
                level: c.level,
                parentId: c.parentCode,
                segmentLetter: c.segmentLetter,
                sortOrder: i + idx,
                isActive: true,
                inDiscovery: c.inDiscovery,
              };
            }),
          });
          inserted += chunk.length;
          console.log(
            `   L${level}: ${inserted}/${cats.length} yazıldı (${Math.round((Date.now() - startedAt) / 1000)} sn)...`,
          );
        }
      }
    },
    // 158 bin satır / 5.000'lik gruplar = ~32 tur; uzak Supabase'de tur başına
    // ~215 ms gecikme + yazma maliyeti. Ölçülen ~2-4 dk; tavan geniş tutuldu
    // çünkü işlem yarıda kesilirse tablo geri sarılır ve TÜM koşum boşa gider.
    { timeout: 900_000, maxWait: 60_000 },
  );

  const [totalDb, segDb, famDb, clsDb, comDb, discDb] = await Promise.all([
    prisma.category.count(),
    prisma.category.count({ where: { level: 1 } }),
    prisma.category.count({ where: { level: 2 } }),
    prisma.category.count({ where: { level: 3 } }),
    prisma.category.count({ where: { level: 4 } }),
    prisma.category.count({ where: { inDiscovery: true } }),
  ]);

  console.log(`\n✅ Seed tamamlandı (${Math.round((Date.now() - startedAt) / 1000)} sn):`);
  console.log(`   Toplam:    ${totalDb}`);
  console.log(`   Segment:   ${segDb}`);
  console.log(`   Family:    ${famDb}`);
  console.log(`   Class:     ${clsDb}`);
  console.log(`   Commodity: ${comDb}`);
  console.log(`   Discovery (talep/ilan seçimi): ${discDb}`);
  console.log(`   Yalnız firma seçiminde:        ${totalDb - discDb}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed hatası:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
