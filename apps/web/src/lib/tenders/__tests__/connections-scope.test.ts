import { describe, expect, it } from "vitest";
import { applyConnectionsScope } from "../connections-scope";

const ALL = ["A-0001", "B-0001", "C-0001"];

describe("applyConnectionsScope — Bağlantılarım görünürlük listesi", () => {
  it("kimse çıkarılmadıysa CONNECTIONS kalır, davetliler aynen", () => {
    const out = applyConnectionsScope({ visibility: "CONNECTIONS" as const, invitedSupplierIds: [...ALL] }, ALL);
    expect(out.visibility).toBe("CONNECTIONS");
    expect(out.invitedSupplierIds).toEqual(ALL);
  });

  it("bir bağlantı çıkarıldıysa PRIVATE + yalnız işaretliler (çıkarılan görmez)", () => {
    const out = applyConnectionsScope({ visibility: "CONNECTIONS" as const, invitedSupplierIds: ["A-0001", "C-0001"] }, ALL);
    expect(out.visibility).toBe("PRIVATE");
    expect(out.invitedSupplierIds).toEqual(["A-0001", "C-0001"]);
  });

  it("bağlantı olmayan bir kimlik listede kaldıysa süzülür; PUBLIC/PRIVATE dokunulmaz", () => {
    const out = applyConnectionsScope({ visibility: "CONNECTIONS" as const, invitedSupplierIds: ["A-0001", "ZZZ-0001"] }, ALL);
    expect(out.visibility).toBe("PRIVATE");
    expect(out.invitedSupplierIds).toEqual(["A-0001"]);
    const pub = { visibility: "PUBLIC" as const, invitedSupplierIds: ["A-0001"] };
    expect(applyConnectionsScope(pub, ALL)).toBe(pub);
    const priv = { visibility: "PRIVATE" as const, invitedSupplierIds: ["A-0001"] };
    expect(applyConnectionsScope(priv, ALL)).toBe(priv);
  });
});
