import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync, type ValidationError } from "class-validator";
import { CompanyItemsController } from "../../src/modules/company-items/company-items.controller";

/**
 * Derin denetim LU-08: vitrin DTO'sunda
 *  - sabit/kademeli fiyat 0 kabul ediliyordu ("0 ₺ / adet", JSON-LD price=0);
 *  - moq'da üst sınır yoktu, Decimal(18,3) taşması 500 veriyordu.
 * DTO sınıfı dışa açık değil — PATCH :id/showcase gövdesinin tipi metadata'dan okunur.
 */
const ShowcaseDto = (
  Reflect.getMetadata("design:paramtypes", CompanyItemsController.prototype, "updateShowcase") as unknown[]
)[2] as new () => object;

function errorPaths(body: Record<string, unknown>): string[] {
  const out: string[] = [];
  const walk = (errs: ValidationError[], prefix = "") => {
    for (const e of errs) {
      const path = prefix ? `${prefix}.${e.property}` : e.property;
      if (e.constraints) out.push(path);
      if (e.children?.length) walk(e.children, path);
    }
  };
  walk(validateSync(plainToInstance(ShowcaseDto, body)));
  return out;
}

describe("ShowcaseDto fiyat ve MOQ sınırları", () => {
  it("sabit fiyat 0 reddedilir, 0.01 kabul", () => {
    expect(errorPaths({ priceMode: "FIXED", priceAmount: 0 })).toEqual(["priceAmount"]);
    expect(errorPaths({ priceMode: "FIXED", priceAmount: 0.01 })).toEqual([]);
  });

  it("kademe birim fiyatı 0 reddedilir", () => {
    expect(errorPaths({ priceMode: "TIERED", priceTiers: [{ minQty: 1, unitPrice: 0 }] })).toEqual([
      "priceTiers.0.unitPrice",
    ]);
    expect(errorPaths({ priceMode: "TIERED", priceTiers: [{ minQty: 1, unitPrice: 5 }] })).toEqual([]);
  });

  it("moq 1e9 üstü reddedilir (Decimal taşması 500 yerine 400)", () => {
    expect(errorPaths({ moq: 1e16 })).toEqual(["moq"]);
    expect(errorPaths({ moq: 1_000_000_000 })).toEqual([]);
    expect(errorPaths({ moq: 0 })).toEqual([]);
  });
});
