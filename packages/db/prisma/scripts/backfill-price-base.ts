/**
 * ÜRÜN FİYATININ TRY KARŞILIĞI (`CompanyItem.priceAmountBase`) — tek seferlik
 * doldurma (2026-09-27, "kurla çevir"; idempotent, tekrar koşulabilir).
 *
 * Ürün dizininin fiyat süzgeci/sıralaması/histogramı artık farklı para
 * birimlerini bu ortak tabanda karşılaştırıyor. Yeni yazımlar ve günlük kur
 * işi tabanı kendisi tazeler; bu betik migration `20260927200100` sonrası
 * MEVCUT ürünler içindir. Hesap tek kaynak `@rothern/shared`
 * `productPriceBase` (API yazma yolu ve kur işiyle aynı): sabit fiyatta tutar,
 * kademelide en düşük kademe, teklifle fiyatta NULL. Kur `exchange_rates`
 * tablosundaki en güncel TCMB kaydından; kaydı olmayan birimin ürünleri
 * ATLANIR (API'nin ilk kur çekimi onları doldurur) ve raporlanır.
 *
 * HAM SQL: Prisma `update` @updatedAt'i ilerletirdi → sitemap lastmod ve içerik
 * çevirisi kapsam denetimi sahte "değişti" görürdü.
 *
 *   pnpm --filter @rothern/db backfill-price-base -- --dry        # kök .env (staging), yazmaz
 *   ENV_FILE=../../.env.prod.local pnpm --filter @rothern/db backfill-price-base -- --dry
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envFile = process.env.ENV_FILE
  ? resolve(process.cwd(), process.env.ENV_FILE)
  : resolve(__dirname, "../../.env");
const override = !!process.env.ENV_FILE;
for (const line of readFileSync(envFile, "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trimStart().startsWith("#")) {
    const k = line.slice(0, i).trim();
    if (override || !process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
}

import { PrismaClient } from "@prisma/client";
import { productPriceBase } from "@rothern/shared";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL });
const BATCH = 500;

async function main() {
  const dry = process.argv.includes("--dry");
  const latest = await prisma.exchangeRate.findMany({
    distinct: ["currency"],
    orderBy: [{ currency: "asc" }, { rateDate: "desc" }],
    select: { currency: true, rate: true, rateDate: true },
  });
  const rates = new Map<string, number>([["TRY", 1], ...latest.map((r) => [r.currency, Number(r.rate)] as [string, number])]);
  console.log(
    `kurlar: ${latest.map((r) => `${r.currency}=${Number(r.rate)} (${r.rateDate.toISOString().slice(0, 10)})`).join(" ") || "(tablo boş)"}`,
  );

  const report = { scanned: 0, changed: 0, nulled: 0, skipped: new Map<string, number>() };
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.companyItem.findMany({
      where: {
        OR: [{ priceMode: { in: ["FIXED", "TIERED"] } }, { priceAmountBase: { not: null } }],
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, priceMode: true, priceAmount: true, priceTiers: true, priceCurrency: true, priceAmountBase: true },
      orderBy: { id: "asc" },
      take: BATCH,
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;
    const ids: string[] = [];
    const bases: (string | null)[] = [];
    for (const r of rows) {
      report.scanned += 1;
      const priced = r.priceMode === "FIXED" || r.priceMode === "TIERED";
      if (priced && !rates.has(r.priceCurrency)) {
        report.skipped.set(r.priceCurrency, (report.skipped.get(r.priceCurrency) ?? 0) + 1);
        continue;
      }
      const next = productPriceBase(r, (c) => rates.get(c) ?? null);
      const prev = r.priceAmountBase == null ? null : Number(r.priceAmountBase);
      if (next === prev) continue;
      report.changed += 1;
      if (next == null) report.nulled += 1;
      ids.push(r.id);
      bases.push(next == null ? null : next.toFixed(2));
    }
    if (!dry && ids.length > 0) {
      await prisma.$executeRaw`
        UPDATE "company_items" AS ci SET "priceAmountBase" = v.base::numeric
        FROM (SELECT unnest(${ids}::text[]) AS id, unnest(${bases}::text[]) AS base) AS v
        WHERE ci."id" = v.id`;
    }
    if (rows.length < BATCH) break;
  }
  console.log(
    `${dry ? "(kuru çalışma — yazılmadı) " : ""}taranan ${report.scanned} · değişen ${report.changed} (NULL'a dönen ${report.nulled})`,
  );
  if (report.skipped.size > 0) {
    console.log(
      `kuru olmayan birim — atlandı (API'nin ilk kur çekimi doldurur): ${[...report.skipped].map(([c, n]) => `${c} (${n})`).join(", ")}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
