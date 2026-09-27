/**
 * MEVCUT ŞEHİRLERİ DÜNYA ŞEHİR LİSTESİNE EŞLE (2026-09-27): `companies` ve
 * `company_addresses` satırlarında `city` metni olup `cityId`si boş olanlar
 * `pickGeoCity` (API yazma yoluyla AYNI kural) ile eşlenir. Türkiye'de il adı;
 * diğer ülkelerde aynı ülkenin şehirlerinden tam ad (herhangi bir dil/yerel
 * yazım), yoksa tam sözcük eşleşmesi. Eşleşmeyen satır olduğu gibi kalır.
 * `seed-geo-cities`ten SONRA koşulur.
 *
 *   pnpm --filter @rothern/db backfill-city-ids -- --dry
 */
import { PrismaClient } from "@prisma/client";
import { pickGeoCity, type GeoCityCandidate } from "@rothern/shared";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL });

async function main() {
  const dry = process.argv.includes("--dry");
  const geo = await prisma.geoCity.findMany({
    select: { id: true, countryCode: true, name: true, nameTr: true, nameEn: true, nameRu: true, searchText: true, population: true },
  });
  if (geo.length === 0) throw new Error("geo_cities boş — önce seed-geo-cities");
  const byCc = new Map<string, GeoCityCandidate[]>();
  for (const g of geo) byCc.set(g.countryCode, [...(byCc.get(g.countryCode) ?? []), g]);
  const pick = (cc: string | null, city: string | null) => pickGeoCity(cc, city, byCc.get((cc ?? "TR").toUpperCase()) ?? []);

  const report = { companies: 0, companiesMatched: 0, addresses: 0, addressesMatched: 0, unmatched: [] as string[] };
  const companies = await prisma.company.findMany({ where: { cityId: null, city: { not: null } }, select: { id: true, country: true, city: true } });
  for (const c of companies) {
    report.companies += 1;
    const id = pick(c.country, c.city);
    if (id == null) {
      report.unmatched.push(`${c.country}:${c.city}`);
      continue;
    }
    report.companiesMatched += 1;
    // HAM SQL: Prisma `update` @updatedAt'i ilerletirdi → sitemap lastmod ve
    // çeviri kapsam denetimi sahte "değişti" görürdü.
    if (!dry) await prisma.$executeRaw`UPDATE "companies" SET "cityId" = ${id} WHERE "id" = ${c.id}`;
  }
  const addresses = await prisma.companyAddress.findMany({ where: { cityId: null, city: { not: null } }, select: { id: true, country: true, city: true } });
  for (const a of addresses) {
    report.addresses += 1;
    const id = pick(a.country, a.city);
    if (id == null) {
      report.unmatched.push(`${a.country}:${a.city}`);
      continue;
    }
    report.addressesMatched += 1;
    if (!dry) await prisma.$executeRaw`UPDATE "company_addresses" SET "cityId" = ${id} WHERE "id" = ${a.id}`;
  }
  console.log(`${dry ? "(kuru çalışma) " : ""}firma ${report.companiesMatched}/${report.companies} · adres ${report.addressesMatched}/${report.addresses}`);
  const top = [...report.unmatched.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 30);
  if (top.length) console.log("eşleşmeyenler:", top.map(([k, n]) => `${k} (${n})`).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
