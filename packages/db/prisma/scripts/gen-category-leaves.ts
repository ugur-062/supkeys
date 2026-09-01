/**
 * Kategori YAPRAK üreticisi (Faz 3 — endüstriyel derinlik).
 *
 * ÖLÇÜLEN SORUN (2026-09-01): taksonominin derinliği ters dağılmış.
 *   segment 41 Laboratuvar : 109 sınıf / 1.702 yaprak  → sınıf başına 15,6
 *   segment 31 İmalat Bileş.:  44 sınıf /     8 yaprak → sınıf başına  0,18
 * Yani L3 SINIF iskeleti endüstriyel segmentlerde DURUYOR, eksik olan altındaki
 * ürün (L4) katmanı. Kaynak `unspsc.tsv` kısmî bir çıkarım ve tam da imalat
 * tarafında budanmış.
 *
 * KARAR: yeni sınıf UYDURMUYORUZ. Var olan sınıfların altını, Europages'in
 * yaptığı gibi ALICI DİLİNDE ürün adlarıyla dolduruyoruz ("Paslanmaz çelik
 * boru", "Hidrolik hortum rekoru") — UNSPSC'nin soyut sınıf adıyla değil.
 * Yapı kararı (hangi segment, hangi sınıf) insanda; ürün adı listesi AI'dan,
 * elemeden geçerek.
 *
 * Çıktı: `src/seeds/categories-generated.tsv`, categories-custom.tsv ile AYNI
 * biçim (kod ⇥ seviye ⇥ üstKod ⇥ (boş) ⇥ ad). Repo'da versiyonlu; canlıya
 * `seed-categories` taşır.
 *
 * KOD ATAMA: yaprak kodu = sınıf kodunun ilk 6 hanesi + boş iki hane (01-99).
 * Kullanılmış slotlar DB'den okunur, aynı koşuda üretilenler de rezerve edilir
 * → çakışma yapısal olarak imkânsız.
 *
 * Çalıştırma:
 *   pnpm --filter @rothern/db gen-category-leaves -- --segments 31,12 --limit 2
 *   pnpm --filter @rothern/db gen-category-leaves            # varsayılan endüstriyel set
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { generateJson, priceOf, readGeminiKey } from "./lib/gemini";

const prisma = new PrismaClient();

const OUT_PATH = path.resolve(
  __dirname,
  "../../src/seeds/categories-generated.tsv",
);

/**
 * Ölçülen açığa göre seçilen endüstriyel segmentler (sınıf başına yaprak <3).
 * 41 (laboratuvar) ve 25/72 gibi zaten derin olanlar BİLİNÇLİ olarak dışarıda —
 * oralara eklemek dengeyi daha da bozar.
 */
const DEFAULT_SEGMENTS = [
  "11", // Hammadde: metal, taş, tekstil
  "12", // Kimyasallar ve endüstriyel gazlar
  "13", // Polimer ve izolasyon
  "22", // İnşaat makineleri
  "23", // İmalat makineleri
  "26", // Güç üretim sistemleri
  "27", // El aletleri ve genel makineler
  "31", // İmalat bileşenleri ve sarf
  "32", // Elektronik bileşenler
  "39", // Elektrik ve aydınlatma
  "40", // Tesisat ve HVAC
  "73", // Fason üretim ve imalat hizmetleri
];

/** Sınıf başına hedef yaprak sayısı (mevcutlar dahil). */
const TARGET_PER_CLASS = 9;
/** Bir istekte kaç sınıf. 6 sınıf × ~9 ad = ~54 ad — çıktı tavanına uzak. */
const BATCH = 6;

interface Klass {
  code: string;
  nameTr: string;
  path: string;
  existing: string[];
  usedSlots: Set<string>;
  need: number;
}

const SCHEMA = {
  type: "object",
  properties: {
    classes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          leaves: { type: "array", items: { type: "string" } },
        },
        required: ["code", "leaves"],
      },
    },
  },
  required: ["classes"],
};

function buildPrompt(classes: Klass[]): string {
  const blocks = classes
    .map((k) => {
      const mevcut = k.existing.length
        ? `\n  MEVCUT (TEKRARLAMA): ${k.existing.join(" | ")}`
        : "";
      return `${k.code}\t${k.path} › ${k.nameTr}  [${k.need} adet iste]${mevcut}`;
    })
    .join("\n");

  return `Türkiye'de sanayi ve inşaat sektörüne hizmet eden B2B satın alma platformu için
ÜRÜN KATEGORİSİ adları üretiyorsun. Bu adlar, alıcının satın alma talebi açarken
listeden seçeceği en alt seviye kategorilerdir.

Aşağıda her satır bir ÜST KATEGORİ: kodu, hiyerarşi yolu, adı ve kaç alt kategori
istendiği. Her üst kategori için o sayıda ALT KATEGORİ ADI üret.

KURALLAR
1. ALICI DİLİYLE yaz — piyasada o ürün nasıl anılıyorsa öyle ("Hidrolik hortum
   rekoru", "Paslanmaz çelik dirsek"). Soyut sınıflandırma dili KULLANMA
   ("... ve ilgili ürünler", "Diğer ...", "Çeşitli ..." YASAK).
2. Her ad SATIN ALINABİLİR somut bir ürün ya da hizmet olmalı. Alıcı "bundan 100
   adet istiyorum" diyebilmeli.
3. Üst kategorinin adını TEKRARLAMA, onu DARALT. Üst "Rulmanlar" ise alt
   "Bilyalı rulman", "Konik makaralı rulman", "Rulman yatağı" olur.
4. MEVCUT olarak listelenen adları tekrarlama, onlara yakın eşanlamlı da üretme.
5. Türkçe. Baş harf büyük, gerisi küçük. Marka adı YOK. Kısaltma yalnız
   sektörde standartsa (KKD, HRP, DKP, CNC, PVC).
6. Ad 2-6 kelime, en fazla 55 karakter. Noktalama kullanma (tire serbest).
7. Bir üst kategori için gerçekten o kadar ayrı ürün YOKSA daha az üret.
   Uydurulmuş kategori, eksik kategoriden kötüdür.

ÜST KATEGORİLER
${blocks}

Her kod için istenen sayıda alt kategori adı döndür.`;
}

const norm = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();

/**
 * Modelin ürettiği adı kabul edilebilir mi diye eler. Reddedilen ad SESSİZCE
 * atılır — eksik kategori, çöp kategoriden iyidir (taksonomi kalıcı veridir,
 * eşanlamlıdan farklı olarak geri alması pahalıdır).
 */
function acceptName(
  raw: string,
  klass: Klass,
  takenInBatch: Set<string>,
  globalNames: Set<string>,
): string | null {
  const name = raw.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
  if (name.length < 3 || name.length > 55) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s\-()/%]*$/u.test(name)) return null;

  // "Diğer ...", "Çeşitli ...", "... ve ilgili ürünler" gibi UNSPSC artığı
  // torba adlar — alıcıya hiçbir şey anlatmaz, seçim listesini kirletir.
  if (/^(diğer|çeşitli|muhtelif|genel)\b/i.test(name)) return null;
  if (/(ve ilgili|ve benzer|vb\.?)$/i.test(name)) return null;

  const n = norm(name);
  if (!n) return null;
  // Sınıf adının kendisi veya var olan bir kardeş.
  if (n === norm(klass.nameTr)) return null;
  if (klass.existing.some((e) => norm(e) === n)) return null;
  if (takenInBatch.has(n)) return null;
  // KÜRESEL tekillik: aynı ad iki farklı sınıfın altında olamaz. Yoksa alıcı
  // birini, satıcı diğerini seçer ve eşleşme sessizce bölünür — kategorinin
  // varlık sebebi tam olarak ikisini aynı düğümde buluşturmak.
  if (globalNames.has(n)) return null;
  return name;
}

/** Sınıfın altındaki ilk boş 2 haneli slot (01-99). */
function nextSlot(klass: Klass): string | null {
  for (let i = 1; i <= 99; i++) {
    const s = String(i).padStart(2, "0");
    if (!klass.usedSlots.has(s)) {
      klass.usedSlots.add(s);
      return s;
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
  const segIdx = args.indexOf("--segments");
  const segments =
    segIdx >= 0
      ? (args[segIdx + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_SEGMENTS;

  const apiKey = readGeminiKey(__dirname);

  // Daha önce üretilmiş satırlar: hem sınıfı atlamak hem slot rezerve etmek için.
  const priorByClass = new Map<string, Set<string>>();
  const priorNames = new Map<string, string[]>();
  /** Bu dosyada + DB'de var olan TÜM adlar (küresel tekillik için). */
  const globalNames = new Set<string>();
  if (fs.existsSync(OUT_PATH)) {
    for (const line of fs.readFileSync(OUT_PATH, "utf-8").split("\n")) {
      if (!line.trim() || line.startsWith("#")) continue;
      const [code, , parentCode, , nameTr] = line.split("\t");
      if (!code || !parentCode || !nameTr) continue;
      if (!priorByClass.has(parentCode)) priorByClass.set(parentCode, new Set());
      priorByClass.get(parentCode)!.add(code.slice(6));
      priorNames.set(parentCode, [...(priorNames.get(parentCode) ?? []), nameTr]);
      globalNames.add(norm(nameTr));
    }
  }

  const rows = await prisma.category.findMany({
    where: {
      isActive: true,
      level: 3,
      OR: segments.map((s) => ({ code: { startsWith: s } })),
    },
    select: { id: true, code: true, nameTr: true, parentId: true },
    orderBy: { code: "asc" },
  });
  const all = await prisma.category.findMany({
    select: { id: true, code: true, nameTr: true, parentId: true, level: true },
  });
  // DB'de zaten var olan adlar da rezerve: üretilen yaprak mevcut bir
  // kategoriyle aynı adı taşımamalı.
  for (const c of all) globalNames.add(norm(c.nameTr));
  const byId = new Map(all.map((c) => [c.id, c]));
  const childrenOf = new Map<string, typeof all>();
  for (const c of all) {
    if (!c.parentId) continue;
    const list = childrenOf.get(c.parentId) ?? [];
    list.push(c);
    childrenOf.set(c.parentId, list);
  }

  const classes: Klass[] = [];
  for (const r of rows) {
    const kids = (childrenOf.get(r.id) ?? []).filter((k) => k.level === 4);
    const prior = priorByClass.get(r.code) ?? new Set<string>();
    const existing = [
      ...kids.map((k) => k.nameTr),
      ...(priorNames.get(r.code) ?? []),
    ];
    const need = TARGET_PER_CLASS - existing.length;
    if (need <= 0) continue;

    const parts: string[] = [];
    let cur = r.parentId ? byId.get(r.parentId) : undefined;
    while (cur) {
      parts.unshift(cur.nameTr);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    classes.push({
      code: r.code,
      nameTr: r.nameTr,
      path: parts.join(" › "),
      existing,
      usedSlots: new Set([...kids.map((k) => k.code.slice(6)), ...prior]),
      need,
    });
  }

  console.log(
    `Doldurulacak: ${classes.length} sınıf · hedef ${TARGET_PER_CLASS} yaprak/sınıf`,
  );
  if (classes.length === 0) {
    console.log("Yapılacak iş yok.");
    return;
  }

  if (!fs.existsSync(OUT_PATH)) {
    fs.writeFileSync(
      OUT_PATH,
      "# ÜRETİLMİŞ kategori yaprakları — gen-category-leaves.ts\n" +
        "# Biçim: <kod>\\t4\\t<üstKod>\\t\\t<ad>  (categories-custom.tsv ile aynı)\n" +
        "# Elle düzeltme SERBEST; yeniden koşumda mevcut satırlar korunur ve\n" +
        "# slotları rezerve sayılır.\n",
      "utf-8",
    );
  }

  let inTok = 0;
  let outTok = 0;
  let written = 0;
  let batchNo = 0;
  let model: string | undefined;

  for (let i = 0; i < classes.length && batchNo < limit; i += BATCH) {
    const batch = classes.slice(i, i + BATCH);
    const byCode = new Map(batch.map((k) => [k.code, k]));
    batchNo++;
    try {
      const r = await generateJson<{ classes?: { code: string; leaves: string[] }[] }>({
        apiKey,
        prompt: buildPrompt(batch),
        schema: SCHEMA,
        temperature: 0.3,
        preferModel: model,
      });
      model = r.model;
      inTok += r.inTok;
      outTok += r.outTok;
      const lines: string[] = [];
      for (const c of r.data.classes ?? []) {
        const klass = byCode.get(c.code);
        if (!klass) continue; // model olmayan kod uydurdu
        const taken = new Set<string>();
        let added = 0;
        for (const leaf of c.leaves ?? []) {
          if (added >= klass.need) break;
          const name = acceptName(leaf, klass, taken, globalNames);
          if (!name) continue;
          const slot = nextSlot(klass);
          if (!slot) break;
          taken.add(norm(name));
          globalNames.add(norm(name));
          lines.push(`${klass.code.slice(0, 6)}${slot}\t4\t${klass.code}\t\t${name}`);
          added++;
        }
      }
      if (lines.length) {
        fs.appendFileSync(OUT_PATH, lines.join("\n") + "\n", "utf-8");
        written += lines.length;
      }
      const pr = priceOf(model ?? "");
      const cost = (inTok / 1e6) * pr.in + (outTok / 1e6) * pr.out;
      process.stdout.write(
        `\rgrup ${batchNo}/${Math.ceil(classes.length / BATCH)} · ${written} yaprak · ${model} · ~$${cost.toFixed(3)}   `,
      );
    } catch (e) {
      console.error(`\ngrup ${batchNo} HATA: ${(e as Error).message}`);
    }
  }

  const pr = priceOf(model ?? "");
  const cost = (inTok / 1e6) * pr.in + (outTok / 1e6) * pr.out;
  console.log(
    `\n\nBitti: ${written} yaprak → ${path.basename(OUT_PATH)}\n` +
      `Token: ${inTok} girdi / ${outTok} çıktı · maliyet ~$${cost.toFixed(3)}\n` +
      `Sonraki: gözden geçir, sonra 'pnpm --filter @rothern/db seed-categories'`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
