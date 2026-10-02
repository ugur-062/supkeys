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

/**
 * 2026-09-27 — ARAYÜZ DİLİNİN ayraçları. Kural Türkçe sözleşmeye sabitken
 * İngilizce arayüzde "12,500" yapıştıran satıcının birim fiyatı 12,50
 * oluyordu (gönderilen teklif düzenlenemez → PARA KAYBI).
 */
describe("parseMoneyDisplay — İngilizce arayüz (virgül binlik, nokta ondalık)", () => {
  it("REGRESYON: tek virgül + 3 hane binliktir (12,500 → 12500)", () => {
    expect(parseMoneyDisplay("12,500", "en")).toBe("12500");
    expect(parseMoneyDisplay("1,500", "en")).toBe("1500");
    expect(parseMoneyDisplay("1,234,567", "en")).toBe("1234567");
    expect(parseMoneyDisplay("12,500.75", "en")).toBe("12500.75");
    expect(parseMoneyDisplay("$ 12,500", "en")).toBe("12500");
  });

  it("nokta ondalıktır (dilin sözleşmesi); fazla hane kırpılır", () => {
    expect(parseMoneyDisplay("12.5", "en")).toBe("12.5");
    expect(parseMoneyDisplay("12.50", "en")).toBe("12.50");
    expect(parseMoneyDisplay("0.125", "en")).toBe("0.12");
    // Belirsiz: "12.500" İngilizcede on iki buçuktur (binlik okumak 1000× hata olurdu).
    expect(parseMoneyDisplay("12.500", "en")).toBe("12.50");
  });

  it("virgül + ≤2 hane başka alışkanlıkla yazılmış ondalıktır (12,5 → 12.5)", () => {
    expect(parseMoneyDisplay("12,5", "en")).toBe("12.5");
    expect(parseMoneyDisplay("12,50", "en")).toBe("12.50");
    expect(parseMoneyDisplay("12,", "en")).toBe("12.");
  });

  it("iki ayraç türü varsa sonuncusu ondalık (yapıştırılan TR/DE biçimi)", () => {
    expect(parseMoneyDisplay("1.234,56", "en")).toBe("1234.56");
    expect(parseMoneyDisplay("1,234.56", "en")).toBe("1234.56");
  });

  it("boşluk binliktir; tam genişlikli (IME) rakam/ayraç okunur", () => {
    expect(parseMoneyDisplay("1 234 567.5", "en")).toBe("1234567.5");
    expect(parseMoneyDisplay("１２，５００", "en")).toBe("12500");
    expect(parseMoneyDisplay("１２．５", "en")).toBe("12.5");
    expect(parseMoneyDisplay("1'234.50", "en")).toBe("1234.50");
  });
});

describe("parseMoneyDisplay — Rusça arayüz (boşluk binlik, virgül ondalık)", () => {
  it("bölünmez/dar boşluk ve düz boşluk binliktir", () => {
    expect(parseMoneyDisplay("1 234,56", "ru")).toBe("1234.56");
    expect(parseMoneyDisplay("1 234 567,5", "ru")).toBe("1234567.5");
    expect(parseMoneyDisplay("1 234,56", "ru")).toBe("1234.56");
  });

  it("virgül ondalıktır; nokta TR'deki gibi ≤2 hane ondalık, 3 hane binlik", () => {
    expect(parseMoneyDisplay("12,5", "ru")).toBe("12.5");
    expect(parseMoneyDisplay("1500.50", "ru")).toBe("1500.50");
    expect(parseMoneyDisplay("12.500", "ru")).toBe("12500");
    // Belirsiz: "12,500" Rusçada on iki buçuktur.
    expect(parseMoneyDisplay("12,500", "ru")).toBe("12.50");
  });
});

describe("parseMoneyDisplay — Türkçe arayüzde yapıştırılan yabancı biçim", () => {
  it("çoklu virgül düzgün binlik kalıbıysa binliktir (eskiden 1234.56 dönüyordu)", () => {
    expect(parseMoneyDisplay("1,234,567", "tr")).toBe("1234567");
    expect(parseMoneyDisplay("1,234,567.89", "tr")).toBe("1234567.89");
  });

  it("tek virgül dilin ondalığıdır (12,500 → 12,50 — Türkçe sözleşme)", () => {
    expect(parseMoneyDisplay("12,500", "tr")).toBe("12.50");
  });
});

describe("formatMoneyDisplay — dilin ayraçları", () => {
  it("EN: 1,500.5 · RU: 1 500,5 (bölünmez boşluk) · TR: 1.500,5", () => {
    expect(formatMoneyDisplay("1500.5", "en")).toBe("1,500.5");
    expect(formatMoneyDisplay("1234567", "en")).toBe("1,234,567");
    expect(formatMoneyDisplay("1500.5", "ru")).toBe("1 500,5");
    expect(formatMoneyDisplay("1500.5", "tr")).toBe("1.500,5");
  });

  it("her dilde gidiş-dönüş kararlı", () => {
    for (const locale of ["tr", "en", "ru"] as const) {
      for (const raw of ["0.5", "12500", "1500.50", "1234567.89", "1500"]) {
        expect(parseMoneyDisplay(formatMoneyDisplay(raw, locale), locale)).toBe(raw);
      }
    }
  });
});

/**
 * Miktar alanları (`maxDecimals` = 3, DB Decimal(18,3)) — arayüz testi son tur
 * S-BUY: `type="number"` Türkçe tarayıcıda "1.500"ü 1,5 · "1.250,5"i 1,2505
 * okuyor, katalog seçicide "2." ara durumu alanı 0'a sıfırlıyordu ("2.5" → 5).
 */
describe("parseMoneyDisplay — miktar (3 ondalık)", () => {
  it("TR: nokta binlik, virgül ondalık", () => {
    expect(parseMoneyDisplay("1.500", "tr", 3)).toBe("1500");
    expect(parseMoneyDisplay("1.250,5", "tr", 3)).toBe("1250.5");
    expect(parseMoneyDisplay("12,5", "tr", 3)).toBe("12.5");
    expect(parseMoneyDisplay("0,125", "tr", 3)).toBe("0.125");
  });

  it("TR: başka alışkanlıkla yazılan nokta-ondalık da doğru okunur", () => {
    expect(parseMoneyDisplay("2.5", "tr", 3)).toBe("2.5");
    expect(parseMoneyDisplay("2.", "tr", 3)).toBe("2.");
    expect(parseMoneyDisplay("0.125", "tr", 3)).toBe("0.125");
    expect(parseMoneyDisplay("1.2505", "tr", 3)).toBe("1.250");
  });

  it("EN: virgül binlik, nokta ondalık; 3 ondalık korunur", () => {
    expect(parseMoneyDisplay("1,500", "en", 3)).toBe("1500");
    expect(parseMoneyDisplay("12.125", "en", 3)).toBe("12.125");
    expect(parseMoneyDisplay("1,250.5", "en", 3)).toBe("1250.5");
  });

  it("para (varsayılan 2 hane) davranışı değişmez", () => {
    expect(parseMoneyDisplay("1.2345")).toBe("12345");
    expect(parseMoneyDisplay("0.125", "en")).toBe("0.12");
  });
});
