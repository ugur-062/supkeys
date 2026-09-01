/**
 * Kategori adlarındaki İngilizce artığı Türkçeye çevirir — ÇEVRİMDIŞI, AI'lı.
 *
 * NEDEN VAR: katalog Ariba TR dışa aktarımı ama çevirisi yarım — 158.018 adın
 * ~141.000'i hâlâ İngilizce. 9 SEGMENT adı bile İngilizce ("Food and Beverage
 * Products"), yani kategori seçicisinin ilk ekranı yarı yabancı.
 *
 * KAYNAK DOSYA EZİLMEZ. Çıktı ayrı bir OVERLAY katmanıdır:
 *   src/seeds/category-translations.tsv  →  `<kod> ⇥ <TR ad> ⇥ <kaynak ad>`
 * `ariba-categories.tsv` birebir kalır (provenance korunur); `seed-categories`
 * overlay'i üstüne uygular. Böylece kötü bir çeviri AI'yı yeniden koşmadan
 * ELLE düzeltilebilir ve diff'te görünür.
 *
 * KAYNAK AD KAYBOLMAZ: seed onu `keywords`'e katlar → "ball bearing" arayan
 * "Bilyalı rulman"ı bulmaya devam eder.
 *
 * ÇEVİRİLMEYECEKLER (model boş döndürür, satır yazılmaz):
 *   · zaten Türkçe olanlar
 *   · ilaç etken madde adı (INN): Milrinone, Clemizole
 *   · Latince tür adı: mylossoma aureum
 *   · kimyasal formül / bileşim: "Chlorobutanol/edta/polyvinyl alcohol"
 *   · marka, model kodu, ölçü standardı
 *
 * ÜST YOL BAĞLAM VERİR ve şarttır: "Bars" diş hekimliği altında "bar",
 * metalurji altında "çubuk". Bağlamsız çeviri bu ayrımı kaybeder.
 *
 * ÇALIŞMA ZAMANI DEĞİL: firma AI bütçesine dokunmaz, AiUsage yazmaz.
 *
 * Çalıştırma:
 *   pnpm --filter @rothern/db gen-category-translations                  # Faz 1
 *   pnpm --filter @rothern/db gen-category-translations -- --all         # + 85/50/51/10
 *   ... -- --levels 1,2,3        yalnız omurga
 *   ... -- --limit 5             ilk 5 grup (deneme)
 * Sürdürülebilir: çıktıda kodu olan düğüm atlanır, yarıda kesilen koşu devam eder.
 */
import { generateJson, priceOf, readGeminiKey } from "./lib/gemini";
import { CATEGORY_NAME_CHARS, normalizeName } from "./lib/tr-charset";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../../src/seeds/ariba-categories.tsv");
const OUT = path.resolve(__dirname, "../../src/seeds/category-translations.tsv");

/**
 * Faz 1'de atlanan segmentlerin YAPRAKLARI. L1-L3 omurgası her hâlükârda
 * çevrilir (kullanıcı o katmanlarda geziniyor).
 *   85 Sağlık Bakım Hizmetleri — 76.409 satır, ICD tarzı cerrahi prosedür dizesi
 *   50 Food and Beverage · 51 Pharmaceutical · 10 Canlı Bitkiler/Hayvanlar
 * Toplam 122.257 yaprak; e-satınalmada neredeyse hiç açılmıyor ve makine
 * çevirisi tam da bu tür uzun klinik dizelerde en çok hata yapıyor.
 */
const DEFERRED_SEGMENTS = new Set(["85", "50", "51", "10"]);

/** TR'ye özgü harf = kesin Türkçe. Modele göndermeye gerek yok. */
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;

const BATCH = 40;
const CONCURRENCY = 4;

interface Node {
  code: string;
  level: number;
  name: string;
  /** Üst zincir adları — çeviri bağlamı. */
  path: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          tr: { type: "string" },
        },
        required: ["code", "tr"],
      },
    },
  },
  required: ["items"],
} as const;

function buildPrompt(nodes: Node[]): string {
  return [
    "Bir B2B e-satınalma platformunun kategori kataloğunu Türkçeleştiriyorsun.",
    "Her satır bir kategori ADIDIR (cümle değil, katalog başlığı).",
    "",
    "KURALLAR",
    "1. Ad ZATEN TÜRKÇEYSE `tr` alanını BOŞ (\"\") bırak. Uydurma, düzeltme yapma.",
    "2. Şunları ÇEVİRME, `tr` boş bırak:",
    "   · ilaç etken madde adı (INN): Milrinone, Clemizole, Ergotamine",
    "   · Latince tür/biyolojik ad: mylossoma aureum, chrysoperla externa",
    "   · kimyasal formül veya bileşim listesi: \"Chlorobutanol/edta/polyvinyl alcohol\"",
    "   · marka adı, model kodu, ölçü/standart kodu",
    "3. Çeviri TÜRK SANAYİ DİLİNDE olmalı — sözlük değil, sektörde kullanılan",
    "   terim. \"Ball bearing\" → \"Bilyalı rulman\"; \"Ready mix concrete\" →",
    "   \"Hazır beton\"; \"Sheet metal\" → \"Sac\".",
    "4. ÜST YOL bağlamı belirler. Aynı sözcük farklı dalda farklı çevrilir:",
    "   \"Bars\" diş hekimliği altında \"bar\", metalurji altında \"çubuk\".",
    "5. Kaynak adın büyük/küçük harf düzenini KORU (ilk harf büyükse büyük).",
    "6. Kısa tut: kaynakla yaklaşık aynı uzunlukta. Açıklama ekleme, parantez açma.",
    "7. YALNIZ Latin/Türkçe harf kullan. Başka alfabe YASAK.",
    "",
    "Her girdi için `code` aynen geri döndürülmeli.",
    "",
    "GİRDİLER",
    ...nodes.map(
      (n) => `- code=${n.code} | yol: ${n.path || "(kök)"} | ad: ${n.name}`,
    ),
  ].join("\n");
}

/**
 * Modelin çıktısını kabul edilebilir hâle getirir; kabul edilemezse "" döner
 * (satır yazılmaz → seed kaynağı kullanır, yani FAIL-SAFE).
 */
function sanitize(raw: string, source: string): string {
  const tr = normalizeName(raw);
  if (!tr) return "";
  // Model bazen kaynağı aynen geri veriyor — çeviri yok demektir.
  if (tr.toLocaleLowerCase("tr") === source.toLocaleLowerCase("tr")) return "";
  // Yabancı alfabe nöbetçisi: 2026-09-01 koşusunda model Arapça üretmişti.
  if (!CATEGORY_NAME_CHARS.test(tr)) return "";
  // Uzayan çıktı = açıklama/halüsinasyon. Katalog başlığı kaynakla aynı boyda olur.
  if (tr.length > Math.max(60, source.length * 2)) return "";
  return tr;
}

function main0(): { nodes: Node[]; limit: number } {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const limIdx = args.indexOf("--limit");
  const limit = limIdx >= 0 ? Number(args[limIdx + 1]) : Infinity;
  const lvIdx = args.indexOf("--levels");
  const levels =
    lvIdx >= 0
      ? new Set(
          (args[lvIdx + 1] ?? "").split(",").map((s) => Number(s.trim())),
        )
      : null;

  if (!fs.existsSync(SRC)) throw new Error(`Kaynak yok: ${SRC}`);

  const byCode = new Map<string, { name: string; level: number; parent: string }>();
  const order: string[] = [];
  for (const line of fs.readFileSync(SRC, "utf-8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const c = line.split("\t");
    const code = c[0];
    if (!code) continue;
    byCode.set(code, { name: c[4] ?? "", level: Number(c[1]), parent: c[2] ?? "" });
    order.push(code);
  }

  // Sürdürülebilirlik: çıktıda zaten olan kodları atla.
  const done = new Set<string>();
  if (fs.existsSync(OUT)) {
    for (const line of fs.readFileSync(OUT, "utf-8").split("\n")) {
      const code = line.split("\t")[0]?.trim();
      if (code && !code.startsWith("#")) done.add(code);
    }
  }

  const nodes: Node[] = [];
  for (const code of order) {
    const row = byCode.get(code)!;
    if (done.has(code)) continue;
    if (levels && !levels.has(row.level)) continue;
    // Faz 1: ağır segmentlerin YAPRAKLARI ertelenir, omurgası çevrilir.
    if (!all && row.level === 4 && DEFERRED_SEGMENTS.has(code.slice(0, 2))) continue;
    // TR'ye özgü harf taşıyan ad kesin Türkçe — modele sormaya gerek yok.
    if (TR_CHARS.test(row.name)) continue;

    const parts: string[] = [];
    let cur = row.parent ? byCode.get(row.parent) : undefined;
    let guard = 0;
    while (cur && guard++ < 8) {
      parts.unshift(cur.name);
      cur = cur.parent ? byCode.get(cur.parent) : undefined;
    }
    nodes.push({ code, level: row.level, name: row.name, path: parts.join(" › ") });
  }
  return { nodes, limit };
}

async function main() {
  const { nodes, limit } = main0();
  const apiKey = readGeminiKey(__dirname);

  if (!fs.existsSync(OUT)) {
    fs.writeFileSync(
      OUT,
      [
        "# Kategori adı ÇEVİRİ OVERLAY'i — gen-category-translations.ts üretir.",
        "# Biçim: <kod> ⇥ <TR ad> ⇥ <kaynak ad>",
        "# ariba-categories.tsv EZİLMEZ; seed bu katmanı üstüne uygular ve kaynak",
        "# adı keywords'e katlar (arama İngilizce terimi bulmaya devam eder).",
        "# ELLE DÜZELTİLEBİLİR: bir satırı düzeltmek AI'yı yeniden koşmayı gerektirmez.",
        "",
      ].join("\n"),
      "utf-8",
    );
  }

  const batches: Node[][] = [];
  for (let i = 0; i < nodes.length; i += BATCH) batches.push(nodes.slice(i, i + BATCH));
  const planned = Math.min(batches.length, limit === Infinity ? batches.length : limit);
  console.log(
    `📝 ${nodes.length} ad çevrilecek · ${planned} grup × ${BATCH} · eşzamanlılık ${CONCURRENCY}\n`,
  );

  let model: string | undefined;
  let inTok = 0,
    outTok = 0,
    written = 0,
    skipped = 0,
    batchNo = 0,
    cursor = 0;

  const worker = async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= planned) return;
      const batch = batches[idx]!;
      const nameByCode = new Map(batch.map((n) => [n.code, n.name]));
      try {
        const r = await generateJson<{ items?: { code: string; tr: string }[] }>({
          apiKey,
          prompt: buildPrompt(batch),
          schema: SCHEMA as unknown as object,
          preferModel: model,
        });
        model = r.model;
        inTok += r.inTok;
        outTok += r.outTok;

        const lines: string[] = [];
        for (const item of r.data.items ?? []) {
          const source = nameByCode.get(item.code);
          // Model olmayan bir kod uydurabilir — sessizce atla.
          if (!source) continue;
          const tr = sanitize(item.tr ?? "", source);
          if (!tr) {
            skipped++;
            continue;
          }
          lines.push(`${item.code}\t${tr}\t${source}`);
        }
        if (lines.length) {
          // Her grup ANINDA yazılır: koşu kesilirse üretilen kaybolmaz.
          fs.appendFileSync(OUT, lines.join("\n") + "\n", "utf-8");
          written += lines.length;
        }
      } catch (e) {
        console.error(`\ngrup ${idx + 1} HATA: ${(e as Error).message}`);
      }
      batchNo++;
      const pr = priceOf(model ?? "");
      const cost = (inTok / 1e6) * pr.in + (outTok / 1e6) * pr.out;
      process.stdout.write(
        `\rgrup ${batchNo}/${planned} · ${written} çeviri · ${skipped} atlandı · ${model} · ~$${cost.toFixed(3)}   `,
      );
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const pr = priceOf(model ?? "");
  const cost = (inTok / 1e6) * pr.in + (outTok / 1e6) * pr.out;
  console.log(
    `\n\n✅ ${written} çeviri → ${path.basename(OUT)}` +
      `\n   ${skipped} ad çevrilmedi (zaten Türkçe / ilaç / Latince / nöbetçiye takıldı)` +
      `\n   Token: ${inTok} girdi / ${outTok} çıktı · maliyet ~$${cost.toFixed(3)}` +
      `\n\nSonraki: pnpm --filter @rothern/db check-category-translations`,
  );
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
