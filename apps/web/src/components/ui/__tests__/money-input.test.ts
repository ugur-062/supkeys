import { describe, expect, it } from "vitest";
import { formatMoneyDisplay, parseMoneyDisplay } from "../money-input";

/**
 * Denetim 2026-08-26 Parça 10 #1 sözleşmesi.
 *
 * Eski sürüm noktayı KOŞULSUZ binlik ayracı sayıyordu; ölçülen sonuç:
 * yazarak "1500.50" → 150050 (×100), yapıştırarak "1,234.56" → 1.23 (÷1000)
 * ve ekranda "1,23" göründüğü için hata gözle yakalanamıyordu. Gönderilmiş
 * teklif geri çekilemediği için (CLAUDE.md kural 6) bu doğrudan para yoluydu.
 */

/** Kontrollü input simülasyonu: her tuşta display'den parse, raw'dan format. */
function typeInto(keys: string): string {
  let raw = "";
  for (const key of keys) {
    raw = parseMoneyDisplay(formatMoneyDisplay(raw) + key);
  }
  return raw;
}

describe("parseMoneyDisplay — ondalık ayracı içerikten çıkarılır", () => {
  it("TR biçimi: nokta binlik, virgül ondalık", () => {
    expect(parseMoneyDisplay("1.234,56")).toBe("1234.56");
    expect(parseMoneyDisplay("1.500")).toBe("1500");
    expect(parseMoneyDisplay("1.234.567")).toBe("1234567");
  });

  it("EN biçimi yapıştırıldığında da doğru okunur (REGRESYON: 1.23 dönüyordu)", () => {
    expect(parseMoneyDisplay("1,234.56")).toBe("1234.56");
    expect(parseMoneyDisplay("1234.56")).toBe("1234.56");
    expect(parseMoneyDisplay("999,999.99")).toBe("999999.99");
  });

  it("tek ayraç + ≤2 hane ondalıktır, 3 hane binliktir", () => {
    expect(parseMoneyDisplay("1500.5")).toBe("1500.5");
    expect(parseMoneyDisplay("1500,5")).toBe("1500.5");
    expect(parseMoneyDisplay("1.500")).toBe("1500");
  });

  it("yazarken oluşan ara durumları korur (sondaki ayraç)", () => {
    expect(parseMoneyDisplay("1.500,")).toBe("1500.");
    expect(parseMoneyDisplay("150.")).toBe("150.");
  });

  it("ondalık 2 haneye kırpılır (DB Decimal(18,2))", () => {
    expect(parseMoneyDisplay("1,23456")).toBe("1.23");
    expect(parseMoneyDisplay("1.234,5678")).toBe("1234.56");
  });

  it("boş/çöp girdi boş döner", () => {
    expect(parseMoneyDisplay("")).toBe("");
    expect(parseMoneyDisplay("abc")).toBe("");
    expect(parseMoneyDisplay("₺ 1.500,50")).toBe("1500.50");
  });
});

describe("kontrollü input: tuş tuş yazım", () => {
  it("nokta ile ondalık yazmak 100× hata üretmez (REGRESYON: 150050)", () => {
    expect(typeInto("1500.50")).toBe("1500.50");
  });

  it("virgül ile yazım (TR alışkanlığı) korunur", () => {
    expect(typeInto("1500,50")).toBe("1500.50");
  });

  it("ayraçsız tam sayı", () => {
    expect(typeInto("1500")).toBe("1500");
    expect(typeInto("15000")).toBe("15000");
  });

  it("binlik ayraçlı görüntü üzerinden yazmaya devam edilebilir", () => {
    // "1.500" görünürken bir hane daha → 15000 (binlik ayraç yutulmaz)
    expect(typeInto("15000")).toBe("15000");
  });
});

describe("formatMoneyDisplay", () => {
  it("ham değeri tr-TR biçimine çevirir", () => {
    expect(formatMoneyDisplay("1500.50")).toBe("1.500,50");
    expect(formatMoneyDisplay("1500")).toBe("1.500");
    expect(formatMoneyDisplay("1500.")).toBe("1.500,");
    expect(formatMoneyDisplay("")).toBe("");
  });

  it("parse ↔ format gidiş-dönüş kararlı", () => {
    for (const raw of ["0.5", "1500.50", "1234567.89", "1500"]) {
      expect(parseMoneyDisplay(formatMoneyDisplay(raw))).toBe(raw);
    }
  });
});

describe("kontrollü input — ondalık hane fazlası ve virgül yolu", () => {
  it("3. ondalık hane binliğe DÖNMEZ, kırpılır (150,567 → 150,56)", () => {
    expect(typeInto("150,567")).toBe("150.56");
  });

  it("büyük tutarda binlik ayraç yutulmaz", () => {
    expect(typeInto("1234567")).toBe("1234567");
    expect(typeInto("1234567,89")).toBe("1234567.89");
    expect(typeInto("1234567.89")).toBe("1234567.89");
  });
});
