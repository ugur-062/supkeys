import { describe, expect, it } from "vitest";
import { applyConnectionsScope, splitInvitations } from "../connections-scope";

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

describe("splitInvitations — gövde tavanı (derin denetim S083/S095)", () => {
  it("200'e kadar liste aynen gövdede, taşma yok", () => {
    const v = { visibility: "CONNECTIONS" as const, invitedSupplierIds: ALL };
    expect(splitInvitations(v)).toEqual({ values: v, overflow: [] });
  });

  it("200'ü aşan bağlantı listesi: ilk 200 gövdeye, kalanı davet ucuna; görünürlük değişmez", () => {
    const ids = Array.from({ length: 260 }, (_, i) => `R-${i}`);
    const out = splitInvitations({ visibility: "CONNECTIONS" as const, invitedSupplierIds: ids });
    expect(out.values.visibility).toBe("CONNECTIONS");
    expect(out.values.invitedSupplierIds).toEqual(ids.slice(0, 200));
    expect(out.overflow).toEqual(ids.slice(200));
  });
});
