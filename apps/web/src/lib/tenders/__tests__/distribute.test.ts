import { describe, expect, it } from "vitest";
import {
  applyPercentToItems,
  cmpDecimal,
  distributeToTarget,
  exactTotal,
  type DistributeItem,
} from "../distribute";

/** Test yardımcıları — sonuç fiyatlarıyla kesin toplam. */
function totalOf(
  items: DistributeItem[],
  prices: Record<string, string>,
): string {
  return exactTotal(
    items.map((it) => ({
      quantity: it.quantity,
      unitPrice: prices[it.id] ?? it.unitPrice,
    })),
  );
}

function decimalsOf(v: string): number {
  const i = v.indexOf(".");
  return i === -1 ? 0 : v.length - i - 1;
}

describe("exactTotal / cmpDecimal", () => {
  it("float tuzağına düşmeden kesin toplar (0.1 × 3 = 0.3)", () => {
    expect(exactTotal([{ quantity: 3, unitPrice: "0.1" }])).toBe("0.3");
    expect(cmpDecimal("0.3", exactTotal([{ quantity: 3, unitPrice: "0.1" }]))).toBe(0);
  });

  it("kesirli miktarla kesin çarpar", () => {
    expect(exactTotal([{ quantity: "2.5", unitPrice: "10.01" }])).toBe("25.025");
  });

  it("karşılaştırma sınır durumları", () => {
    expect(cmpDecimal("100", "100.00")).toBe(0);
    expect(cmpDecimal("99.999999", "100")).toBe(-1);
    expect(cmpDecimal("100.000001", "100")).toBe(1);
  });
});

describe("distributeToTarget — DOWN (ALIM pazarlığı)", () => {
  it("hedefe tam ulaşır: eşit iki kalem, %5 indirim", () => {
    const items: DistributeItem[] = [
      { id: "a", quantity: 10, unitPrice: "100" },
      { id: "b", quantity: 10, unitPrice: "100" },
    ];
    // toplam 2000 → hedef 1900
    const r = distributeToTarget({ items, targetTotal: "1900", direction: "DOWN" });
    expect(r.ok).toBe(true);
    expect(cmpDecimal(r.achievedTotal, "1900")).toBeLessThanOrEqual(0);
    expect(cmpDecimal(totalOf(items, r.prices), r.achievedTotal)).toBe(0);
    // simetrik kurulumda tam hedef beklenir
    expect(cmpDecimal(r.achievedTotal, "1900")).toBe(0);
  });

  it("kilitli kalemin fiyatına dokunmaz, tüm yükü kilitsizlere verir", () => {
    const items: DistributeItem[] = [
      { id: "sabit", quantity: 5, unitPrice: "200", locked: true },
      { id: "oynar", quantity: 10, unitPrice: "100" },
    ];
    // toplam 2000 → hedef 1800: tüm 200'lük kesinti "oynar"dan
    const r = distributeToTarget({ items, targetTotal: "1800", direction: "DOWN" });
    expect(r.ok).toBe(true);
    expect(r.prices["sabit"]).toBe("200");
    expect(cmpDecimal(r.prices["oynar"]!, "80")).toBe(0);
  });

  it("yetersiz kapasitede ok=false ve kalan farkı raporlar", () => {
    const items: DistributeItem[] = [
      { id: "a", quantity: 1, unitPrice: "10", locked: true },
      { id: "b", quantity: 1, unitPrice: "5" },
    ];
    // toplam 15 → hedef 1: b en fazla 0.01'e iner → toplam 10.01 > 1
    const r = distributeToTarget({ items, targetTotal: "1", direction: "DOWN" });
    expect(r.ok).toBe(false);
    expect(cmpDecimal(r.remaining, "0")).toBe(1);
    expect(cmpDecimal(r.prices["b"]!, "0.01")).toBe(0);
  });

  it("kalem tabanına (minUnitPrice) çarpan kalemin artığını diğerine aktarır", () => {
    const items: DistributeItem[] = [
      { id: "tabanli", quantity: 10, unitPrice: "100", minUnitPrice: "95" },
      { id: "serbest", quantity: 10, unitPrice: "100" },
    ];
    // toplam 2000 → hedef 1800. Orantılı pay 100'er ama tabanli en çok 50
    // inebilir (95×10) → kalan 150 serbest'ten: 100→85.
    const r = distributeToTarget({ items, targetTotal: "1800", direction: "DOWN" });
    expect(r.ok).toBe(true);
    expect(cmpDecimal(r.prices["tabanli"]!, "95")).toBeGreaterThanOrEqual(0);
    expect(cmpDecimal(r.achievedTotal, "1800")).toBe(0);
  });

  it("kesirli miktarlarda hedefi aşmaz ve 2 hane üretir", () => {
    const items: DistributeItem[] = [
      { id: "a", quantity: "2.5", unitPrice: "133.37" },
      { id: "b", quantity: "7.25", unitPrice: "41.99" },
      { id: "c", quantity: "1.125", unitPrice: "999.99" },
    ];
    const current = exactTotal(items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice })));
    // ~%5 hedef — tam ulaşılamayabilir (adım × kesirli miktar), ama AŞILAMAZ.
    const target = "1685";
    expect(cmpDecimal(target, current)).toBe(-1);
    const r = distributeToTarget({ items, targetTotal: target, direction: "DOWN" });
    expect(r.ok).toBe(true);
    expect(cmpDecimal(r.achievedTotal, target)).toBeLessThanOrEqual(0);
    for (const p of Object.values(r.prices)) {
      expect(decimalsOf(p)).toBeLessThanOrEqual(2);
    }
  });

  it("geri eklemede hiçbir fiyat orijinalinin üzerine çıkmaz", () => {
    const items: DistributeItem[] = [
      { id: "a", quantity: 1000, unitPrice: "3.33" },
      { id: "b", quantity: 1, unitPrice: "10000" },
    ];
    const r = distributeToTarget({ items, targetTotal: "13000", direction: "DOWN" });
    expect(r.ok).toBe(true);
    expect(cmpDecimal(r.prices["a"]!, "3.33")).toBeLessThanOrEqual(0);
    expect(cmpDecimal(r.prices["b"]!, "10000")).toBeLessThanOrEqual(0);
  });

  it("zaten hedefte/altında ise fiyatları değiştirmeden ok döner", () => {
    const items: DistributeItem[] = [{ id: "a", quantity: 2, unitPrice: "50" }];
    const r = distributeToTarget({ items, targetTotal: "100", direction: "DOWN" });
    expect(r.ok).toBe(true);
    expect(r.prices["a"]).toBe("50");
  });

  it("decimals=4 ile ince adımlarla hedefe yaklaşır", () => {
    const items: DistributeItem[] = [
      { id: "a", quantity: "3", unitPrice: "10.1234" },
    ];
    const r = distributeToTarget({
      items,
      targetTotal: "30",
      direction: "DOWN",
      decimals: 4,
    });
    expect(r.ok).toBe(true);
    expect(cmpDecimal(r.achievedTotal, "30")).toBeLessThanOrEqual(0);
    // 30 / 3 = 10.0000 tam bölünür → tam hedef
    expect(cmpDecimal(r.achievedTotal, "30")).toBe(0);
  });
});

describe("distributeToTarget — UP (SATIS açık artırması)", () => {
  it("hedefin üzerine çıkar, hemen-al tavanının altında kalır", () => {
    const items: DistributeItem[] = [
      { id: "a", quantity: 10, unitPrice: "100", maxUnitPriceExclusive: "104" },
      { id: "b", quantity: 10, unitPrice: "100" },
    ];
    // toplam 2000 → hedef 2100: a en çok 103.99'a çıkar, kalan b'den.
    const r = distributeToTarget({ items, targetTotal: "2100", direction: "UP" });
    expect(r.ok).toBe(true);
    expect(cmpDecimal(r.achievedTotal, "2100")).toBeGreaterThanOrEqual(0);
    expect(cmpDecimal(r.prices["a"]!, "104")).toBe(-1);
  });

  it("tavanlar hedefe yetmezse ok=false", () => {
    const items: DistributeItem[] = [
      { id: "a", quantity: 1, unitPrice: "100", maxUnitPriceExclusive: "101" },
    ];
    const r = distributeToTarget({ items, targetTotal: "200", direction: "UP" });
    expect(r.ok).toBe(false);
    expect(cmpDecimal(r.remaining, "0")).toBe(1);
  });
});

describe("applyPercentToItems", () => {
  it("DOWN: yüzdeyi kesin uygular, aşağı yuvarlar, kilitliyi atlar", () => {
    const items: DistributeItem[] = [
      { id: "a", quantity: 1, unitPrice: "100" },
      { id: "b", quantity: 1, unitPrice: "33.33" },
      { id: "kilitli", quantity: 1, unitPrice: "50", locked: true },
    ];
    const out = applyPercentToItems({ items, percent: 5, direction: "DOWN" });
    expect(out["a"]).toBe("95");
    // 33.33 × 0.95 = 31.6635 → aşağı: 31.66
    expect(out["b"]).toBe("31.66");
    expect(out["kilitli"]).toBeUndefined();
  });

  it("DOWN: tabanın altına klamplanır", () => {
    const items: DistributeItem[] = [
      { id: "a", quantity: 1, unitPrice: "100", minUnitPrice: "98" },
    ];
    const out = applyPercentToItems({ items, percent: 10, direction: "DOWN" });
    expect(out["a"]).toBe("98");
  });

  it("UP: yukarı yuvarlar ve tavanın altında kalır", () => {
    const items: DistributeItem[] = [
      { id: "a", quantity: 1, unitPrice: "33.33", maxUnitPriceExclusive: "34" },
    ];
    const out = applyPercentToItems({ items, percent: 5, direction: "UP" });
    // 33.33 × 1.05 = 34.9965 → tavan-1 adım: 33.99
    expect(out["a"]).toBe("33.99");
  });

  it("ondalıklı yüzde ('2.5') kesin işlenir", () => {
    const items: DistributeItem[] = [{ id: "a", quantity: 1, unitPrice: "100" }];
    const out = applyPercentToItems({ items, percent: 2.5, direction: "DOWN" });
    expect(out["a"]).toBe("97.5");
  });
});
