/**
 * DÜNYA ŞEHİR LİSTESİNİ YÜKLE (2026-09-27): `src/seeds/geo-cities.tsv`
 * (GeoNames cities15000, `build-geo-cities` üretir) + Türkiye'nin 81 ili ve
 * KKTC şehirleri (`@rothern/shared` `SPECIAL_GEO_CITIES`) → `geo_cities`.
 * İdempotent: id üzerinden upsert, listede olmayan satır silinir (FK YOK —
 * firma/adres `cityId`leri korunur; silinen id yalnız şehir sayfasından düşer).
 * Ağ yok, model yok — canlıda güvenle koşar.
 *
 *   pnpm --filter @rothern/db seed-geo-cities
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";
import { SPECIAL_GEO_CITIES, foldSearchText } from "@rothern/shared";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL });

interface Row {
  id: number;
  countryCode: string;
  admin1: string | null;
  name: string;
  nameTr: string | null;
  nameEn: string | null;
  nameRu: string | null;
  lat: number;
  lng: number;
  population: number;
  slug: string;
  searchText: string;
}

function search(names: (string | null | undefined)[]): string {
  return foldSearchText([...new Set(names.filter(Boolean) as string[])].join(" "));
}

async function main() {
  const tsv = fs.readFileSync(path.resolve(__dirname, "../../src/seeds/geo-cities.tsv"), "utf8").split("\n").slice(1);
  const rows: Row[] = [];
  for (const line of tsv) {
    if (!line) continue;
    const [id, cc, admin1, name, tr, en, ru, lat, lng, pop, slug, alt] = line.split("\t");
    rows.push({
      id: Number(id),
      countryCode: cc!,
      admin1: admin1 || null,
      name: name!,
      nameTr: tr || null,
      nameEn: en || null,
      nameRu: ru || null,
      lat: Number(lat),
      lng: Number(lng),
      population: Number(pop) || 0,
      slug: slug!,
      searchText: search([name, tr, en, ru, ...(alt ? alt.split("|") : [])]),
    });
  }
  for (const c of SPECIAL_GEO_CITIES) {
    rows.push({
      id: c.id,
      countryCode: c.countryCode,
      admin1: null,
      name: c.name,
      nameTr: c.nameTr,
      nameEn: c.nameEn,
      nameRu: c.nameRu,
      lat: c.lat,
      lng: c.lng,
      population: 0,
      slug: c.slug,
      searchText: search([c.name, c.nameTr, c.nameEn, c.nameRu]),
    });
  }
  const dry = process.argv.includes("--dry");
  console.log(`${rows.length} şehir (${SPECIAL_GEO_CITIES.length} özel)${dry ? " — kuru çalışma" : ""}`);
  if (dry) return;
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const values = part.map((_, j) => {
      const b = j * 12;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12})`;
    });
    const params = part.flatMap((r) => [r.id, r.countryCode, r.admin1, r.name, r.nameTr, r.nameEn, r.nameRu, r.lat, r.lng, r.population, r.slug, r.searchText]);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "geo_cities" ("id","countryCode","admin1","name","nameTr","nameEn","nameRu","lat","lng","population","slug","searchText")
       VALUES ${values.join(",")}
       ON CONFLICT ("id") DO UPDATE SET "countryCode"=EXCLUDED."countryCode","admin1"=EXCLUDED."admin1","name"=EXCLUDED."name",
         "nameTr"=EXCLUDED."nameTr","nameEn"=EXCLUDED."nameEn","nameRu"=EXCLUDED."nameRu","lat"=EXCLUDED."lat","lng"=EXCLUDED."lng",
         "population"=EXCLUDED."population","slug"=EXCLUDED."slug","searchText"=EXCLUDED."searchText"`,
      ...params,
    );
    process.stdout.write(`\r${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  const ids = rows.map((r) => r.id);
  const removed = await prisma.$executeRawUnsafe(`DELETE FROM "geo_cities" WHERE NOT ("id" = ANY($1::int[]))`, ids);
  console.log(`\nyazıldı; listeden düşen ${removed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
