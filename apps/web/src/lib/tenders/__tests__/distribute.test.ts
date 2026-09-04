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
    const r = distributeToTarget({ items, targetTotal: "1900" });
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
    const r = distributeToTarget({ items, targetTotal: "1800" });
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
    const r = distributeToTarget({ items, targetTotal: "1" });
    expect(r.ok).toBe(false);
    expect(cmpDecimal(r.remaining, "0")).toBe(1);
    expect(cmpDecimal(r.prices["b"]!, "0.01")).toBe(0);
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
    const r = distributeToTarget({ items, targetTotal: target });
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
    const r = distributeToTarget({ items, targetTotal: "13000" });
    expect(r.ok).toBe(true);
    expect(cmpDecimal(r.prices["a"]!, "3.33")).toBeLessThanOrEqual(0);
    expect(cmpDecimal(r.prices["b"]!, "10000")).toBeLessThanOrEqual(0);
  });

  it("zaten hedefte/altında ise fiyatları değiştirmeden ok döner", () => {
    const items: DistributeItem[] = [{ id: "a", quantity: 2, unitPrice: "50" }];
    const r = distributeToTarget({ items, targetTotal: "100" });
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
      decimals: 4,
    });
    expect(r.ok).toBe(true);
    expect(cmpDecimal(r.achievedTotal, "30")).toBeLessThanOrEqual(0);
    // 30 / 3 = 10.0000 tam bölünür → tam hedef
    expect(cmpDecimal(r.achievedTotal, "30")).toBe(0);
  });
});

describe("applyPercentToItems", () => {
  it("DOWN: yüzdeyi kesin uygular, aşağı yuvarlar, kilitliyi atlar", () => {
    const items: DistributeItem[] = [
      { id: "a", quantity: 1, unitPrice: "100" },
      { id: "b", quantity: 1, unitPrice: "33.33" },
      { id: "kilitli", quantity: 1, unitPrice: "50", locked: true },
    ];
    const out = applyPercentToItems({ items, percent: 5 });
    expect(out["a"]).toBe("95");
    // 33.33 × 0.95 = 31.6635 → aşağı: 31.66
    expect(out["b"]).toBe("31.66");
    expect(out["kilitli"]).toBeUndefined();
  });

  it("en küçük pozitif adımın altına inmez", () => {
    const items: DistributeItem[] = [{ id: "a", quantity: 1, unitPrice: "0.01" }];
    const out = applyPercentToItems({ items, percent: 50 });
    expect(out["a"]).toBe("0.01");
  });

  it("ondalıklı yüzde ('2.5') kesin işlenir", () => {
    const items: DistributeItem[] = [{ id: "a", quantity: 1, unitPrice: "100" }];
    const out = applyPercentToItems({ items, percent: 2.5 });
    expect(out["a"]).toBe("97.5");
  });
});
