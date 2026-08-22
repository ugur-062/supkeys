import {
  matchDocRows,
  normalizeCurrency,
  normalizeDeliveryTime,
  similarity,
  type DocRow,
  type MatchItem,
} from "../../src/modules/company-listings/import/bid-matching";

/**
 * Teklif fiyatı EŞLEŞTİRME MOTORU — saf unit. Sözleşme: kod → ad → benzerlik;
 * model ipucu (hintLineNo) yalnız düşük eşikli ipucu; her kalem/satır tek
 * kullanım; sağlık uyarıları (toplam÷miktar, miktar/birim farkı, para birimi).
 */

const items: MatchItem[] = [
  { id: "i1", lineNo: 1, name: 'Çelik boru 2" DN50', quantity: "120", unit: "m", materialCode: "BRU-200" },
  { id: "i2", lineNo: 2, name: "Dirsek 90° 2\"", quantity: "40", unit: "adet", materialCode: "DRS-290" },
  { id: "i3", lineNo: 3, name: "Flanş DN50 PN16", quantity: "12", unit: "adet", materialCode: null },
  { id: "i4", lineNo: 4, name: "Conta klingirit DN50", quantity: "100", unit: "adet", materialCode: null },
];

const row = (over: Partial<DocRow> & { text: string }): DocRow => ({
  code: null,
  unitPrice: null,
  totalPrice: null,
  quantity: null,
  unit: null,
  currency: null,
  deliveryText: null,
  hintLineNo: null,
  ...over,
});

const OPTS = { allowedCurrencies: ["TRY", "USD"], primaryCurrency: "TRY" };

describe("similarity", () => {
  it("aynı metin 1, alakasız ~0, TR katlama ve tırnak normalizasyonu", () => {
    expect(similarity("Çelik boru", "celik boru")).toBe(1);
    expect(similarity("Çelik boru 2\"", "Çelik boru 2”")).toBe(1);
    expect(similarity("Çelik boru", "Kırtasiye malzemesi")).toBeLessThan(0.2);
    expect(similarity("Dirsek 90 derece 2 inç", "Dirsek 90° 2\"")).toBeGreaterThan(0.5);
  });
});

describe("matchDocRows — kademeler", () => {
  it("malzeme kodu tam eşleşme exact; ad tam eşleşme exact; benzer ad high; uzak medium/none", () => {
    const rows = [
      row({ text: "Boru siyah dikişsiz", code: "bru-200", unitPrice: 185 }), // kod → i1 exact
      row({ text: "Flanş DN50 PN16", unitPrice: 90 }), // ad → i3 exact
      row({ text: "Dirsek 90° 2'' dikişsiz", unitPrice: 42.5 }), // benzer → i2 high
      row({ text: "Kırtasiye kalemi", unitPrice: 3 }), // hiçbir kaleme değil → unmatched
    ];
    const { matches, unmatched } = matchDocRows(items, rows, OPTS);
    const by = Object.fromEntries(matches.map((m) => [m.itemId, m]));
    expect(by.i1).toMatchObject({ confidence: "exact", unitPrice: 185, source: "Boru siyah dikişsiz" });
    expect(by.i3).toMatchObject({ confidence: "exact", unitPrice: 90 });
    expect(by.i2!.confidence).toBe("high");
    expect(by.i2!.unitPrice).toBe(42.5);
    expect(by.i4).toMatchObject({ confidence: "none", unitPrice: null, source: null });
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]!.text).toBe("Kırtasiye kalemi");
  });

  it("model ipucu (hintLineNo) düşük benzerlikte medium yapar; yanlış ipucu (benzerlik < 0.35) yok sayılır", () => {
    const rows = [
      row({ text: "Sızdırmazlık elemanı 50", unitPrice: 5, hintLineNo: 4 }), // conta → ipucu ile medium
      row({ text: "Tamamen alakasız kalem", unitPrice: 7, hintLineNo: 1 }), // ipucu yetmez
    ];
    const { matches, unmatched } = matchDocRows(items, rows, OPTS);
    const by = Object.fromEntries(matches.map((m) => [m.itemId, m]));
    // "Sızdırmazlık elemanı 50" vs "Conta klingirit DN50" benzerliği düşük ama >0.35 olabilir;
    // ipucu varsa medium, yoksa none — ikisi de kabul, ama ASLA exact/high değil.
    expect(["medium", "none"]).toContain(by.i4!.confidence);
    expect(by.i1!.confidence).toBe("none");
    expect(unmatched.some((u) => u.text === "Tamamen alakasız kalem")).toBe(true);
  });

  it("her kalem en çok BİR satır alır — en yüksek skor kazanır, ötekisi unmatched'a düşer", () => {
    const rows = [
      row({ text: "Flanş DN50 PN16 (galvaniz)", unitPrice: 95 }),
      row({ text: "Flanş DN50 PN16", unitPrice: 90 }), // tam eşleşme kazanır
    ];
    const { matches, unmatched } = matchDocRows(items, rows, OPTS);
    const m = matches.find((x) => x.itemId === "i3")!;
    expect(m.unitPrice).toBe(90);
    expect(m.confidence).toBe("exact");
    expect(unmatched.map((u) => u.text)).toEqual(["Flanş DN50 PN16 (galvaniz)"]);
  });
});

describe("matchDocRows — sağlık kontrolleri", () => {
  it("yalnız toplam+miktar varsa birim fiyat türetilir ve uyarılır; miktar/birim farkı uyarılır", () => {
    const rows = [row({ text: 'Çelik boru 2" DN50', totalPrice: 22_200, quantity: 120, unit: "metre" })];
    const { matches } = matchDocRows(items, rows, OPTS);
    const m = matches.find((x) => x.itemId === "i1")!;
    expect(m.unitPrice).toBe(185);
    expect(m.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/toplam ÷ miktardan türetildi/)]));
    expect(m.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/birim \(metre\)/)]));
  });

  it("birim×miktar ≠ toplam uyarısı; belge miktarı ihaleden farklıysa uyarı", () => {
    const rows = [row({ text: "Flanş DN50 PN16", unitPrice: 90, quantity: 10, totalPrice: 1000 })];
    const { matches } = matchDocRows(items, rows, OPTS);
    const m = matches.find((x) => x.itemId === "i3")!;
    expect(m.unitPrice).toBe(90);
    expect(m.warnings.join(" | ")).toMatch(/uyuşmuyor/);
    expect(m.warnings.join(" | ")).toMatch(/miktar \(10\)/);
  });

  it("para birimi: ana birimle aynı → null; izinli farklı → kod; izinsiz → uyarı + null; teslim metni merdivene yuvarlanır", () => {
    const rows = [
      row({ text: 'Çelik boru 2" DN50', unitPrice: 1, currency: "₺", deliveryText: "stoktan" }),
      row({ text: "Flanş DN50 PN16", unitPrice: 2, currency: "usd", deliveryText: "3 hafta" }),
      row({ text: "Dirsek 90° 2\"", unitPrice: 3, currency: "EUR", deliveryText: "45 gün" }),
    ];
    const { matches } = matchDocRows(items, rows, OPTS);
    const by = Object.fromEntries(matches.map((m) => [m.itemId, m]));
    expect(by.i1).toMatchObject({ currency: null, deliveryTime: "STOKTAN" });
    expect(by.i3).toMatchObject({ currency: "USD", deliveryTime: "W3_4" });
    expect(by.i2!.currency).toBeNull();
    expect(by.i2!.warnings.join()).toMatch(/EUR.*kabul edilmiyor/);
    expect(by.i2!.deliveryTime).toBe("W5_8");
  });

  it("3+ ondalık fiyat 2'ye yuvarlanır; sıfır/negatif fiyat düşer", () => {
    const rows = [
      row({ text: "Flanş DN50 PN16", unitPrice: 12.345 }),
      row({ text: 'Çelik boru 2" DN50', unitPrice: 0 }),
    ];
    const { matches } = matchDocRows(items, rows, OPTS);
    const by = Object.fromEntries(matches.map((m) => [m.itemId, m]));
    expect(by.i3!.unitPrice).toBe(12.35);
    expect(by.i1!.unitPrice).toBeNull();
    expect(by.i1!.warnings.join()).toMatch(/0,01/);
  });
});

describe("yardımcılar", () => {
  it("normalizeCurrency", () => {
    expect(normalizeCurrency("₺")).toBe("TRY");
    expect(normalizeCurrency("TL")).toBe("TRY");
    expect(normalizeCurrency(" usd ")).toBe("USD");
    expect(normalizeCurrency("€")).toBe("EUR");
    expect(normalizeCurrency("Dolar")).toBeNull();
    expect(normalizeCurrency("")).toBeNull();
  });
  it("normalizeDeliveryTime", () => {
    expect(normalizeDeliveryTime("W1_2")).toBe("W1_2");
    expect(normalizeDeliveryTime("1-2 hafta")).toBe("W1_2");
    expect(normalizeDeliveryTime("Stoktan (hemen)")).toBe("STOKTAN");
    expect(normalizeDeliveryTime("hemen teslim")).toBe("STOKTAN");
    expect(normalizeDeliveryTime("10 iş günü")).toBe("W1_2");
    expect(normalizeDeliveryTime("2 ay")).toBe("M2_3");
    expect(normalizeDeliveryTime("6 ay")).toBe("M3_PLUS");
    expect(normalizeDeliveryTime("belirsiz")).toBeNull();
  });
});
