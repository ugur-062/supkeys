/**
 * Demo pazar yeri verisini KALDIRIR (firmaları silmez — siparişleri FK ile
 * bağlı): `@demofill.local` sahipli firmaların ürünleri ve teklifsiz açık
 * ilanları silinir, profilleri vitrinden çekilir (publicEnabled=false,
 * publicListingsEnabled=false).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
for (const line of readFileSync(resolve(__dirname, "../../.env"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trimStart().startsWith("#")) {
    const k = line.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
}
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const prev = await prisma.companyUser.findMany({ where: { email: { endsWith: "@demofill.local" } }, select: { companyId: true } });
  const ids = [...new Set(prev.map((u) => u.companyId))];
  const items = await prisma.companyItem.deleteMany({ where: { companyId: { in: ids } } });
  const listings = await prisma.listing.deleteMany({ where: { companyId: { in: ids }, status: "OPEN", bids: { none: {} }, orders: { none: {} } } });
  const closed = await prisma.listing.updateMany({ where: { companyId: { in: ids }, status: "OPEN" }, data: { status: "CANCELLED" } });
  const cos = await prisma.company.updateMany({ where: { id: { in: ids } }, data: { publicEnabled: false, publicListingsEnabled: false } });
  console.log(`🧹 ${items.count} ürün, ${listings.count} ilan silindi; ${closed.count} teklifli ilan iptal; ${cos.count} firma vitrinden çekildi`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
