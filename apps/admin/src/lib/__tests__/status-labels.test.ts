import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BID_STATUS, ORDER_STATUS, orderStatusMeta } from "../status-labels";

const schema = readFileSync(
  path.resolve(__dirname, "../../../../../packages/db/prisma/schema.prisma"),
  "utf8",
);
function enumValues(name: string): string[] {
  const m = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
  if (!m) throw new Error(`enum ${name} not found`);
  return m[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter(Boolean);
}

// Derin denetim LU-13: DISPUTED sipariş ve AWARDED_PARTIAL teklif etiketsizdi,
// admin ekranında gri ham enum basılıyordu. Nöbetçi: şemadaki her değerin
// etiketi olmalı, şemada olmayan değer tutulmamalı.
describe("status-labels ↔ Prisma şeması", () => {
  it("ORDER_STATUS CompanyOrderStatus'un tamamını kapsar", () => {
    expect(Object.keys(ORDER_STATUS).sort()).toEqual(enumValues("CompanyOrderStatus").sort());
    expect(orderStatusMeta("DISPUTED").label).toBe("İhtilaflı");
  });

  it("BID_STATUS ListingBidStatus'un tamamını kapsar", () => {
    expect(Object.keys(BID_STATUS).sort()).toEqual(enumValues("ListingBidStatus").sort());
    expect(BID_STATUS.AWARDED_PARTIAL?.label).toBe("Kısmen kazandı");
  });
});
