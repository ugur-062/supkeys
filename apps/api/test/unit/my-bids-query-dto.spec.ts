import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { MyBidsQueryDto } from "../../src/modules/company-listings/dto/my-bids-query.dto";

/**
 * Tekliflerim sorgusu (arayüz testi O-005 / D-120): sayfalama + sunucu
 * tarafı süzgeç. Bilinmeyen durum, ondalık sayfa ya da tavan üstü sayfa
 * boyutu 400 olmalı (Prisma'ya NaN/1.5 gidip 500 vermemeli).
 */
function check(query: Record<string, string>) {
  const dto = plainToInstance(MyBidsQueryDto, query);
  return { dto, props: validateSync(dto).map((e) => e.property) };
}

describe("MyBidsQueryDto", () => {
  it("virgüllü durum listesi diziye çevrilir; bilinmeyen kod reddedilir", () => {
    const ok = check({ status: "WON,AWARDED_PARTIAL" });
    expect(ok.props).toEqual([]);
    expect(ok.dto.status).toEqual(["WON", "AWARDED_PARTIAL"]);
    expect(check({ status: "WON,BOGUS" }).props).toEqual(["status"]);
  });

  it("pending yalnız 1/true ile açılır", () => {
    expect(check({ pending: "1" }).dto.pending).toBe(true);
    expect(check({ pending: "true" }).dto.pending).toBe(true);
    expect(check({ pending: "0" }).dto.pending).toBe(false);
  });

  it("sayılar çevrilir; ondalık, sayı olmayan ve aralık dışı reddedilir", () => {
    const { dto, props } = check({ page: "3", pageSize: "20", days: "30", sort: "amount" });
    expect(props).toEqual([]);
    expect(dto).toMatchObject({ page: 3, pageSize: 20, days: 30, sort: "amount" });
    expect(check({ page: "abc" }).props).toEqual(["page"]);
    expect(check({ pageSize: "1.5" }).props).toEqual(["pageSize"]);
    expect(check({ page: "0" }).props).toEqual(["page"]);
    expect(check({ pageSize: "51" }).props).toEqual(["pageSize"]);
    expect(check({ sort: "random" }).props).toEqual(["sort"]);
  });

  it("arama metni kırpılır ve 120 karakterle sınırlıdır", () => {
    expect(check({ q: "  boru  " }).dto.q).toBe("boru");
    expect(check({ q: "x".repeat(121) }).props).toEqual(["q"]);
  });
});
