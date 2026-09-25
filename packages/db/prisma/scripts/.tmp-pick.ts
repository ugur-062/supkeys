import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "fs";
const p = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL });
async function main() {
  const S = process.env.S!;
  const seen = new Set<string>(JSON.parse(readFileSync(`${S}/sample.json`, "utf8")).map((e: { id: string }) => e.id));
  const junk = `(e.name ~* '^(QA|E2E|test)' OR e.name ~ 'MU[A-Z0-9]{6}')`;
  const prod = await p.$queryRawUnsafe<{ id: string }[]>(`SELECT e.id FROM company_items e WHERE e."isPublic" AND NOT ${junk} ORDER BY random()`);
  const lst = await p.$queryRawUnsafe<{ id: string }[]>(`SELECT e.id FROM listings e WHERE e."publishedAt" IS NOT NULL AND NOT (e.title ~* '^(QA|E2E|test|İ-1)' OR e.title ~ 'MU[A-Z0-9]{6,}' OR length(e.title) < 8) ORDER BY random()`);
  const cmp = await p.$queryRawUnsafe<{ id: string }[]>(`SELECT e.id FROM companies e WHERE e."onboardingCompletedAt" IS NOT NULL AND NOT (e.name ~* '^(QA|E2E|test)') AND length(coalesce(e."aboutText",'')) > 40 ORDER BY random()`);
  const pick = (rows: { id: string }[], n: number, type: string) => rows.filter((r) => !seen.has(r.id)).slice(0, n).map((r) => ({ type, id: r.id }));
  const sel = [...pick(prod, 14, "PRODUCT"), ...pick(lst, 10, "LISTING"), ...pick(cmp, 6, "COMPANY")];
  writeFileSync(`${S}/eval-ids.json`, JSON.stringify(sel));
  console.log(sel.reduce((a: Record<string, number>, x) => ((a[x.type] = (a[x.type] ?? 0) + 1), a), {}));
}
main().finally(() => p.$disconnect());
