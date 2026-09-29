import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ListAuditDto } from "../../src/modules/admin-audit/dto/list-audit.dto";

/**
 * Admin denetim kaydı sorgusu (derin denetim LU-01):
 *  · `company` bugünkü firma aktörü — eskiden 400 ile reddediliyordu.
 *  · page/pageSize sayısal olmayan ya da ondalık gelirse 400 (eskiden NaN /
 *    1.5 Prisma'ya gidip 500 veriyordu).
 */
function check(query: Record<string, string>) {
  const dto = plainToInstance(ListAuditDto, query);
  return { dto, props: validateSync(dto).map((e) => e.property) };
}

describe("ListAuditDto", () => {
  it("actorType=company kabul edilir; eski değerler de geçer, uydurma red", () => {
    expect(check({ actorType: "company" }).props).toEqual([]);
    expect(check({ actorType: "tenant" }).props).toEqual([]);
    expect(check({ actorType: "hacker" }).props).toEqual(["actorType"]);
  });

  it("page/pageSize sayıya çevrilir", () => {
    const { dto, props } = check({ page: "3", pageSize: "20" });
    expect(props).toEqual([]);
    expect(dto.page).toBe(3);
    expect(dto.pageSize).toBe(20);
  });

  it("sayısal olmayan, ondalık ya da aralık dışı değerler reddedilir", () => {
    expect(check({ page: "abc" }).props).toEqual(["page"]);
    expect(check({ pageSize: "1.5" }).props).toEqual(["pageSize"]);
    expect(check({ page: "0" }).props).toEqual(["page"]);
    expect(check({ pageSize: "101" }).props).toEqual(["pageSize"]);
  });
});
