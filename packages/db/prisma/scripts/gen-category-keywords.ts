/**
 * Kategori eşanlamlı sözlüğü ÜRETİCİSİ (Faz 2 — Europages ölçeği).
 *
 * NEDEN: `searchText = fold(nameTr + " " + keywords)`. Kategori adı tek bir
 * resmî terimdir ("Paslanmaz çelik yassı mamul"); alıcı ise piyasa dilinde
 * arar ("paslanmaz sac", "inox levha", "304 plaka"). Ölçüm (2026-09-01):
 * 8.149 aktif düğümün yalnız 28'inde eşanlamlı var, toplam 194 kelime —
 * Europages'in 90.000'ine karşı 464x az. Terimler tek tek VAR ama hiçbir
 * düğümde BİRLİKTE geçmiyor, o yüzden çok kelimeli arama boş dönüyor.
 *
 * NE YAPAR: aktif L2/L3/L4 düğümleri gruplar hâlinde Gemini'ye verir, her
 * düğüm için Türkçe piyasa terimleri ister, sonucu
 * `src/seeds/category-keywords.generated.tsv` dosyasına yazar.
 *
 * TASARIM KARARLARI
 *  · ÇEVRİMDIŞI ve TEK SEFERLİK. Firma AI bütçesine (AiService.callAi)
 *    dokunmaz — bu bir tohumlama aracı, çalışma zamanı özelliği değil.
 *  · Çıktı REPO'ya TSV olarak yazılır: versiyonlu, diff'lenebilir, kod
 *    incelemesinden geçer. Canlıya `apply-category-keywords` taşır.
 *  · ELLE KÜRASYON ÜSTÜNDÜR: `category-keywords.tsv` (elle yazılan) bu
 *    dosyayı EZER. Üretilen sözlük taban, insan kararı son söz.
 *  · SÜRDÜRÜLEBİLİR: çıktı dosyasında zaten kodu olan düğüm atlanır, yani
 *    yarıda kesilen koşu kaldığı yerden devam eder ve yeni kategoriler için
 *    yeniden koşmak sadece eksikleri üretir.
 *  · Bağımlılık YOK: düz `fetch` (Node 22). `@google/genai` yalnız apps/api
 *    bağımlılığı; onu buraya taşımak için yeni paket eklemek gerekirdi.
 *
 * RİSK: `searchText` kod tabanında YALNIZ kategori aramasında kullanılıyor
 * (eşleştirmede/bildirimde/yetkide değil) — hatalı kelime aramayı bozar,
 * veriyi veya yönlendirmeyi ASLA bozmaz. Bu yüzden toplu üretim güvenli.
 *
 * Çalıştırma:
 *   pnpm --filter @rothern/db gen-category-keywords            # tümü
 *   pnpm --filter @rothern/db gen-category-keywords -- --limit 3   # 3 grup dene
 *   pnpm --filter @rothern/db gen-category-keywords -- --segments 31,23,12
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { generateJson, priceOf, readGeminiKey } from "./lib/gemini";

const prisma = new PrismaClient();

const OUT_PATH = path.resolve(
  __dirname,
  "../../src/seeds/category-keywords.generated.tsv",
);
const CURATED_PATH = path.resolve(
  __dirname,
  "../../src/seeds/category-keywords.tsv",
);

/** Grup boyutu. 40 düğüm ≈ 1.200 girdi / 1.800 çıktı token — güvenli. */
const BATCH = 40;

interface Node {
  code: string;
  nameTr: string;
  level: number;
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
          keywords: { type: "string" },
        },
        required: ["code", "keywords"],
      },
    },
  },
  required: ["items"],
};

function buildPrompt(nodes: Node[]): string {
  const list = nodes
    .map((n) => `${n.code}\t${n.path} › ${n.nameTr}`)
    .join("\n");
  return `Türkiye'de B2B satın alma platformu için kategori ARAMA SÖZLÜĞÜ üretiyorsun.

Aşağıda her satırda: kategori kodu, sekmeyle ayrılmış hiyerarşi yolu ve kategori adı var.
Her kategori için, TÜRK ALICININ ARAMA KUTUSUNA GERÇEKTEN YAZACAĞI terimleri üret.

KURALLAR
1. Yalnız Türkçe piyasa dili. Sanayi jargonu, kısaltma, halk arasındaki ad ve
   yaygın malzeme/standart kodları değerlidir (örn. inox, dkp, hrp, aisi 304,
   erw, abkant, caraskal, ffp3, sae, din).
2. Kategori adında ZATEN geçen kelimeleri TEKRARLAMA — onlar aramaya kendiliğinden girer.
3. Ürün/hizmetin KENDİSİNİ tanımlayan terimler yaz. Marka adı yazma.
   Bir üst kategorinin genel terimini yazma (o ayrı satırda zaten var).
4. YANLIŞ EŞLEŞME ÜRETME. Kelimenin başka bir anlamı varsa ve bu kategoriye ait
   değilse yazma (örn. "Deri kayışlar" için "kemer" YAZMA — giysi kemeriyle karışır).
5. Emin olmadığın kategoriye AZ kelime yaz. Uydurmak, boş bırakmaktan kötüdür.
6. Her kategori için 4-10 terim. Terimler tek boşlukla ayrılmış, hepsi küçük harf.
   Çok kelimeli terim serbest ("aisi 304", "kazan borusu").
7. Noktalama, virgül, tırnak KULLANMA. Yalnız harf, rakam ve boşluk.

KATEGORİLER
${list}

Her kod için tek satır sözlük döndür.`;
}

/**
 * Latin + Türkçe harf, rakam, boşluk DIŞINDA her şey atılır.
 * Gerekçe: model bir denemede "Zincirler" için Arapça "زنجير" üretti. Böyle bir
 * dize hiçbir Türk alıcının arama kutusuna girmez, `foldSearchText` onu ASCII'ye
 * indiremez ve searchText'te ölü ağırlık olarak kalır.
 */
const ALLOWED = /[^a-z0-9çğıöşü\s]/g;

/**
 * Model çıktısını temizler. Şema serbest metin döndürebiliyor; TSV'ye yazmadan
 * önce noktalama/yabancı alfabe atılır ve kategori adının ZATEN kapsadığı
 * kelimeler ayıklanır.
 *
 * Neden çekim eki temizliği: arama `contains` (alt dize) ile çalışıyor. Adı
 * "Kayışlar" olan düğümde searchText zaten "kayislar" içerir, dolayısıyla
 * "kayış" sorgusu ONSUZ da eşleşir — eşanlamlı olarak yazmak searchText'i
 * şişirir, tek bir arama kazandırmaz.
 */
function sanitize(raw: string, nameTr: string): string {
  const foldTr = (s: string) =>
    s
      .toLocaleLowerCase("tr")
      .replace(/[^a-z0-9çğıöşü\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const foldedName = foldTr(nameTr);
  const nameWords = foldedName.split(" ").filter((w) => w.length >= 4);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of raw.toLocaleLowerCase("tr").replace(ALLOWED, " ").split(/\s+/)) {
    if (!w || w.length < 2 || w.length > 24) continue;
    if (seen.has(w)) continue;
    // Ad zaten bu kelimeyi kapsıyor ("kayış" ⊂ "kayışlar").
    if (foldedName.includes(w)) continue;
    // Kelime, adın bir sözcüğünün çekimli hâli ("zinciri" ← "zincir").
    if (nameWords.some((nw) => w.startsWith(nw))) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= 24) break;
  }
  return out.join(" ");
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
  const segIdx = args.indexOf("--segments");
  const segments =
    segIdx >= 0
      ? (args[segIdx + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)
      : null;

  const apiKey = readGeminiKey(__dirname);

  // Zaten sözlüğü olan kodlar: elle küratörlü dosya + daha önce üretilenler.
  const done = new Set<string>();
  for (const p of [CURATED_PATH, OUT_PATH]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
      const code = line.split("\t")[0]?.trim();
      if (code && !code.startsWith("#")) done.add(code);
    }
  }

  const rows = await prisma.category.findMany({
    where: { isActive: true, level: { in: [2, 3, 4] } },
    select: { code: true, nameTr: true, level: true, parentId: true, id: true },
    orderBy: { code: "asc" },
  });
  const all = await prisma.category.findMany({
    select: { id: true, nameTr: true, parentId: true },
  });
  const byId = new Map(all.map((c) => [c.id, c]));

  const nodes: Node[] = rows
    .filter((r) => !done.has(r.code))
    .filter((r) => !segments || segments.includes(r.code.slice(0, 2)))
    .map((r) => {
      const parts: string[] = [];
      let cur = r.parentId ? byId.get(r.parentId) : undefined;
      while (cur) {
        parts.unshift(cur.nameTr);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return { code: r.code, nameTr: r.nameTr, level: r.level, path: parts.join(" › ") };
    });

  const nameByCode = new Map(rows.map((r) => [r.code, r.nameTr]));

  console.log(
    `Üretilecek: ${nodes.length} düğüm (${done.size} zaten sözlüklü)`,
  );
  if (nodes.length === 0) {
    console.log("Yapılacak iş yok.");
    return;
  }

  if (!fs.existsSync(OUT_PATH)) {
    fs.writeFileSync(
      OUT_PATH,
      "# ÜRETİLMİŞ kategori eşanlamlıları — gen-category-keywords.ts\n" +
        "# Elle DÜZENLENEBİLİR ama elle küratörlü satırlar category-keywords.tsv'ye\n" +
        "# yazılmalı: o dosya bunu EZER ve yeniden üretimde kaybolmaz.\n" +
        "# Biçim: <kod>\\t<boşlukla ayrılmış terimler>\n",
      "utf-8",
    );
  }

  let inTok = 0;
  let outTok = 0;
  let written = 0;
  let batchNo = 0;
  // Çalışan model gruplar arasında taşınır — her grupta merdiveni baştan denemeyiz.
  let model: string | undefined;

  // EŞZAMANLILIK: gruplar birbirinden BAĞIMSIZ (her biri ayrı düğüm kümesi,
  // paylaşılan durum yok) — sırayla koşmak için hiçbir sebep yok ve 203 grup
  // seri hâlde ~2,5 saat sürüyordu. Havuz küçük tutuldu: sağlayıcı 429/503
  // verdiğinde merdiven zaten bekliyor, agresif paralellik o beklemeyi
  // çoğaltmaktan başka işe yaramaz.
  const CONCURRENCY = 4;
  const batches: Node[][] = [];
  for (let i = 0; i < nodes.length; i += BATCH) batches.push(nodes.slice(i, i + BATCH));
  const planned = Math.min(batches.length, limit === Infinity ? batches.length : limit);

  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= planned) return;
      const batch = batches[idx]!;
      try {
        const r = await generateJson<{ items?: { code: string; keywords: string }[] }>({
          apiKey,
          prompt: buildPrompt(batch),
          schema: SCHEMA,
          preferModel: model,
        });
        model = r.model;
        inTok += r.inTok;
        outTok += r.outTok;
        const lines: string[] = [];
        for (const item of r.data.items ?? []) {
          const name = nameByCode.get(item.code);
          // Model olmayan bir kod uydurabilir — sessizce atla.
          if (!name) continue;
          const kw = sanitize(item.keywords ?? "", name);
          if (!kw) continue;
          lines.push(`${item.code}\t${kw}`);
        }
        if (lines.length) {
          // Her grup ANINDA yazılır: koşu kesilirse üretilen kaybolmaz.
          // appendFileSync tek iş parçacığında atomik — havuz güvenli.
          fs.appendFileSync(OUT_PATH, lines.join("\n") + "\n", "utf-8");
          written += lines.length;
        }
      } catch (e) {
        console.error(`\ngrup ${idx + 1} HATA: ${(e as Error).message}`);
      }
      batchNo++;
      const pr = priceOf(model ?? "");
      const cost = (inTok / 1e6) * pr.in + (outTok / 1e6) * pr.out;
      process.stdout.write(
        `\rgrup ${batchNo}/${planned} · ${written} satır · ${model} · ~$${cost.toFixed(3)}   `,
      );
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const pr = priceOf(model ?? "");
  const cost = (inTok / 1e6) * pr.in + (outTok / 1e6) * pr.out;
  console.log(
    `\n\nBitti: ${written} satır → ${path.basename(OUT_PATH)}\n` +
      `Token: ${inTok} girdi / ${outTok} çıktı · maliyet ~$${cost.toFixed(3)}\n` +
      `Sonraki: gözden geçir, sonra 'pnpm --filter @rothern/db apply-category-keywords'`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
