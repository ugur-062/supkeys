/**
 * S1 DRIFT NÖBETÇİSİ — "fiyatlı kalem = unitPrice>0" TEK KAYNAK.
 * `PRICED_ITEM_WHERE` (common/company/bid-items.ts) kapalı-zarf kapsam/sıralama,
 * monotonluk ve AWARDED_PARTIAL damgasının ortak tanımıdır. Bu test hem sabitin
 * değerini hem de company-listings.service.ts'te artık HAM `unitPrice: { gt: 0 }`
 * literalinin kalmadığını (hepsi helper'a indirildi) doğrular → biri inline
 * literal geri eklerse KIRILIR.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRICED_ITEM_WHERE } from "../../src/common/company/bid-items";

describe("S1 — fiyatlı kalem tek-kaynak", () => {
  it("PRICED_ITEM_WHERE = { unitPrice: { gt: 0 } }", () => {
    expect(PRICED_ITEM_WHERE).toEqual({ unitPrice: { gt: 0 } });
  });

  it("company-listings.service.ts helper'ı import eder ve inline literal içermez", () => {
    const src = readFileSync(
      join(
        __dirname,
        "../../src/modules/company-listings/services/company-listings.service.ts",
      ),
      "utf8",
    );
    // Gruplu import'a dayanıklı: PRICED_ITEM_WHERE bid-items'tan gelmeli.
    expect(src).toMatch(/PRICED_ITEM_WHERE/);
    expect(src).toContain('from "../../../common/company/bid-items"');
    // Ham literal (boşluk varyasyonları dahil) kalmamalı — hepsi ...PRICED_ITEM_WHERE.
    expect(src).not.toMatch(/unitPrice:\s*{\s*gt:\s*0\s*}/);
  });
});
