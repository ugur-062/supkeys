import {
  salvageRows,
  sanitizeRows,
} from "../../src/modules/ai/bid-price-extract/bid-price-extract.service";

/**
 * "Belgeden Fiyatla" çıktı dayanıklılığı (2026-08-22 ölçüm bulgusu): Gemini
 * NUMBER alanında "1500.000000…" dejenere sıfır döngüsüne girip MAX_TOKENS'a
 * çarpıyordu → (a) sayılar STRING gelir ve TR/EN biçimleri parse edilir,
 * (b) kesik JSON'dan tamamlanmış satırlar kurtarılır (premium retry yerine).
 */
describe("sanitizeRows — STRING sayılar", () => {
  it("TR/EN biçimli metin sayıları parse eder; sembol/boş/uzun değerleri düşürür", () => {
    const rows = sanitizeRows([
      { text: "A", unitPrice: "1500", totalPrice: "1.500,50", quantity: "12,5" },
      { text: "B", unitPrice: "185.50 ₺", quantity: "abc" },
      { text: "C", unitPrice: 42.5, quantity: 3 }, // sayı da kabul
      { text: "D", unitPrice: "1500.000000000000000000000000000000000000000000000" }, // dejenere → kesilir ama parse edilir
      { text: "", unitPrice: "9" }, // text boş → satır düşer
      { text: "E", unitPrice: "-5" }, // negatif → null
    ]);
    expect(rows.map((r) => [r.text, r.unitPrice, r.totalPrice, r.quantity])).toEqual([
      ["A", 1500, 1500.5, 12.5],
      ["B", 185.5, null, null],
      ["C", 42.5, null, 3],
      ["D", 1500, null, null],
      ["E", null, null, null],
    ]);
  });
});

describe("salvageRows — kesik JSON", () => {
  it("tamamlanmış satır nesnelerini alır, yarım sonuncuyu atar; dizge içi parantezleri karıştırmaz", () => {
    const truncated =
      '{ "rows": [ { "text": "Boru {2\\"} DN50", "code": "BRU-200", "unitPrice": "185" }, ' +
      '{ "text": "Dirsek ]", "unitPrice": "42,5", "quantity": "40" }, ' +
      '{ "text": "Flanş", "unitPrice": "1500.0000000000000000000000';
    const rows = salvageRows(truncated);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ text: 'Boru {2"} DN50', code: "BRU-200", unitPrice: "185" });
    expect(rows[1]).toMatchObject({ text: "Dirsek ]", quantity: "40" });
    // Kurtarılan satırlar sanitize'dan geçer.
    expect(sanitizeRows(rows).map((r) => r.unitPrice)).toEqual([185, 42.5]);
  });

  it("rows dizisi yoksa / tamamen yarımsa boş döner", () => {
    expect(salvageRows('{ "pricesIncludeVat": true')).toEqual([]);
    expect(salvageRows('{ "rows": [ { "text": "x", "unitPrice": "1')).toEqual([]);
    expect(salvageRows("")).toEqual([]);
  });

  it("tam (kesilmemiş) JSON'da da tüm satırları verir (kapanan ] sonrası durur)", () => {
    const full = '{ "rows": [ { "text": "A" }, { "text": "B" } ], "docCurrency": "TRY" }';
    expect(salvageRows(full).map((r) => r.text)).toEqual(["A", "B"]);
  });
});
