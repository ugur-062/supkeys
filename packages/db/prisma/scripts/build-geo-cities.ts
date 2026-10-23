/**
 * DÜNYA ŞEHİR LİSTESİ ÜRETİCİ (2026-09-27, kullanıcı: "şehir sayfaları türkiye
 * özel olamaz, bu uluslararası bir sistem").
 *
 * Kaynak GeoNames (CC BY 4.0 — künyede atıf): `cities15000` (nüfusu ≥15.000
 * ve başkentler) + `alternateNamesV2` (dil etiketli adlar). Yalnız BİR KEZ,
 * geliştirici makinesinde koşar; çıktı `src/seeds/geo-cities.tsv` depoya
 * girer, `seed-geo-cities` oradan yükler — CANLIDA indirme/ağ yok.
 *
 *   curl -O https://download.geonames.org/export/dump/cities15000.zip  (+ alternateNamesV2.zip)
 *   GEONAMES_DIR=/yol pnpm --filter @rothern/db build-geo-cities
 *
 * TÜRKİYE BU LİSTEDE YOK (bilinçli): Türkiye'de şehir = İL (81; mevcut
 * `/urunler/sehir/bursa` adresleri, plaka/posta kodu mantığı). İller ve KKTC
 * `seed-geo-cities` içinde paylaşılan kaynaktan (`TR_PROVINCES`) eklenir.
 *
 * Arama adları: şehrin ülkesinin İLK resmî dilindeki ad (countryInfo.txt —
 * "München", "Wien", "Kraków") + GeoNames ana adı; etiketsiz ad yığını
 * (havalimanı kodları, onlarca dilin yazımı) ALINMAZ.
 *
 * Sütunlar: id · ülke · admin1 · ad · adTr · adEn · adRu · enlem · boylam ·
 * nüfus · slug · diğerAdlar (arama; Latin/Kiril, en çok 8, "|" ayraçlı).
 * Slug: `<ülke>-<ingilizce-ad>` ("de-munich"); ülke içinde çakışırsa `-<id>`.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { slugifyText } from "@rothern/shared";

const DIR = process.env.GEONAMES_DIR;
if (!DIR) throw new Error("GEONAMES_DIR verin (cities15000.txt + alternateNamesV2.txt)");
const OUT = path.resolve(__dirname, "../../src/seeds/geo-cities.tsv");
const LANGS = new Set(["tr", "en", "ru"]);
const SCRIPT_OK = /^[\p{Script=Latin}\p{Script=Cyrillic}\s'’.\-()]+$/u;

interface City {
  id: number;
  cc: string;
  admin1: string;
  name: string;
  ascii: string;
  alts: string[];
  lat: number;
  lng: number;
  pop: number;
  names: Partial<Record<string, { v: string; score: number }>>;
  local?: { v: string; score: number };
}

async function main() {
  // Ülke → ilk resmî dil ("de", "en-IN" → "en", "pt-BR" → "pt").
  const localLang = new Map<string, string>();
  for (const line of fs.readFileSync(path.join(DIR!, "countryInfo.txt"), "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const f = line.split("\t");
    const first = (f[15] ?? "").split(",")[0]?.split("-")[0];
    if (f[0] && first) localLang.set(f[0], first);
  }
  const cities = new Map<number, City>();
  for (const line of fs.readFileSync(path.join(DIR!, "cities15000.txt"), "utf8").split("\n")) {
    if (!line) continue;
    const f = line.split("\t");
    const cc = f[8]!;
    if (cc === "TR") continue; // Türkiye = 81 il, seed'de paylaşılan kaynaktan
    cities.set(Number(f[0]), {
      id: Number(f[0]),
      cc,
      admin1: f[10] ?? "",
      name: f[1]!,
      ascii: f[2]!,
      alts: [],
      lat: Number(f[4]),
      lng: Number(f[5]),
      pop: Number(f[14] ?? 0),
      names: {},
    });
  }
  console.log(`şehir: ${cities.size}`);

  // Dil etiketli adlar: tercih edilen (isPreferred) > kısa olmayan > tarihi/argo değil.
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR!, "alternateNamesV2.txt")) });
  for await (const line of rl) {
    const f = line.split("\t");
    const lang = f[2]!;
    if (!lang || lang.length > 3) continue; // "link", "post", "iata"…
    const c = cities.get(Number(f[1]));
    if (!c) continue;
    if (f[7] === "1" || f[6] === "1") continue; // tarihi / argo
    const score = (f[4] === "1" ? 4 : 0) + (f[5] === "1" ? 0 : 1);
    if (LANGS.has(lang)) {
      const cur = c.names[lang];
      if (!cur || score > cur.score) c.names[lang] = { v: f[3]!, score };
    }
    if (lang === localLang.get(c.cc) && SCRIPT_OK.test(f[3]!)) {
      if (!c.local || score > c.local.score) c.local = { v: f[3]!, score };
    }
  }

  const rows = [...cities.values()].sort((a, b) => a.cc.localeCompare(b.cc) || b.pop - a.pop);
  const used = new Set<string>();
  const out: string[] = [];
  const clean = (s: string | undefined) => (s ?? "").replace(/[\t\n|]/g, " ").trim();
  for (const c of rows) {
    const en = c.names.en?.v ?? c.name;
    let slug = `${c.cc.toLowerCase()}-${slugifyText(en) || slugifyText(c.ascii) || String(c.id)}`;
    if (used.has(slug)) slug = `${slug}-${c.id}`;
    used.add(slug);
    const alts = [...new Set([c.local?.v, c.name, c.ascii].map(clean).filter(Boolean))]
      .filter((a) => a !== en)
      .slice(0, 4);
    out.push(
      [c.id, c.cc, clean(c.admin1), clean(c.name), clean(c.names.tr?.v), clean(en), clean(c.names.ru?.v), c.lat, c.lng, c.pop, slug, alts.join("|")].join("\t"),
    );
  }
  fs.writeFileSync(OUT, `${["id", "cc", "admin1", "name", "nameTr", "nameEn", "nameRu", "lat", "lng", "population", "slug", "alt"].join("\t")}\n${out.join("\n")}\n`);
  console.log(`yazıldı: ${OUT} (${out.length} satır)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
