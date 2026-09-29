import {
  dominantScript,
  isCrossLanguage,
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

describe("matchDocRows — diller arası (2026-09-27)", () => {
  it("belge FARKLI DİLDEYSE model ipucu benzerlik eşiği aranmadan medium; ipucusuz satır eşleşmez; gerçek metin eşleşmesi önce", () => {
    const rows = [
      row({ text: "Edelstahlrohr 2 Zoll", unitPrice: 200, hintLineNo: 1 }), // ipucu → medium
      row({ text: "Dichtung Klingerit", unitPrice: 5 }), // ipucu yok → eşleşmez
      row({ text: "Flanş DN50 PN16", unitPrice: 90, hintLineNo: 3 }), // aynı adla exact
    ];
    const cross = matchDocRows(items, rows, { ...OPTS, crossLanguage: true });
    const by = Object.fromEntries(cross.matches.map((m) => [m.itemId, m]));
    expect(by.i1).toMatchObject({ confidence: "medium", unitPrice: 200 });
    expect(by.i3).toMatchObject({ confidence: "exact", unitPrice: 90 });
    expect(by.i4!.confidence).toBe("none");
    // Aynı dil denildiyse eski kural: benzerlik < 0.35 ipucu yok sayılır.
    const same = matchDocRows(items, rows, { ...OPTS, crossLanguage: false });
    expect(same.matches.find((m) => m.itemId === "i1")!.confidence).toBe("none");
  });

  it("yazı farkı (Kiril belge ↔ Latin kalem) model söylemese de diller arası sayılır; Kiril metin artık boşa katlanmaz", () => {
    const rows = [row({ text: "Труба стальная 2 дюйма", unitPrice: 150, hintLineNo: 1 })];
    const { matches } = matchDocRows(items, rows, OPTS);
    expect(matches.find((m) => m.itemId === "i1")).toMatchObject({ confidence: "medium", unitPrice: 150 });
    expect(dominantScript(["Труба стальная"])).toBe("cyrillic");
    expect(dominantScript(["Çelik boru", "DN50"])).toBe("latin");
    expect(dominantScript(["不锈钢管"])).toBe("cjk");
    expect(isCrossLanguage(items, rows)).toBe(true);
    expect(isCrossLanguage(items, [row({ text: "Boru" })])).toBe(false);
    // Aynı dilde Kiril eşleşme: harfler korunur (eskiden a-z dışı silinip 0 benzerlik).
    expect(similarity("Труба стальная", "труба стальная")).toBe(1);
    const ru: MatchItem[] = [{ id: "r1", lineNo: 1, name: "Труба стальная DN50", quantity: "10", unit: "m", materialCode: null }];
    expect(matchDocRows(ru, [row({ text: "Труба стальная DN50", unitPrice: 9 })], OPTS).matches[0]).toMatchObject({ confidence: "exact", unitPrice: 9 });
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

  it("para birimi: ana birim dahil izinli kod açıkça döner; izinsiz → HATA + null (MU-19); teslim metni merdivene yuvarlanır", () => {
    const rows = [
      row({ text: 'Çelik boru 2" DN50', unitPrice: 1, currency: "₺", deliveryText: "stoktan" }),
      row({ text: "Flanş DN50 PN16", unitPrice: 2, currency: "usd", deliveryText: "3 hafta" }),
      row({ text: "Dirsek 90° 2\"", unitPrice: 3, currency: "EUR", deliveryText: "45 gün" }),
    ];
    const { matches } = matchDocRows(items, rows, OPTS);
    const by = Object.fromEntries(matches.map((m) => [m.itemId, m]));
    expect(by.i1).toMatchObject({ currency: "TRY", deliveryTime: "STOKTAN" });
    expect(by.i3).toMatchObject({ currency: "USD", deliveryTime: "W3_4" });
    expect(by.i2!.currency).toBeNull();
    expect(by.i2!.errors.join()).toMatch(/EUR.*kabul edilmiyor/);
    expect(by.i2!.warnings.join()).not.toMatch(/kabul edilmiyor/);
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

describe("matchDocRows — eşleşmeyen satırlar da aynı kurallardan geçer (derin denetim MU-23)", () => {
  it("izinsiz birim null + hata; ana birim açık kod; izinli farklı kod; fiyat yuvarlanır; geçersiz fiyat düşer", () => {
    const rows = [
      row({ text: "Kırtasiye A", unitPrice: 185, currency: "GBP" }),
      row({ text: "Kırtasiye B", unitPrice: 12.345, currency: "TRY" }),
      row({ text: "Kırtasiye C", unitPrice: 7, currency: "usd" }),
      row({ text: "Kırtasiye D", unitPrice: 0 }),
      row({ text: "Kırtasiye E", totalPrice: 100, quantity: 3 }),
    ];
    const { unmatched } = matchDocRows(items, rows, OPTS);
    const by = Object.fromEntries(unmatched.map((u) => [u.text, u]));
    expect(by["Kırtasiye A"]).toMatchObject({ unitPrice: 185, currency: null });
    expect(by["Kırtasiye A"]!.errors!.join()).toMatch(/GBP.*kabul edilmiyor/);
    expect(by["Kırtasiye B"]).toMatchObject({ unitPrice: 12.35, currency: "TRY", warnings: [], errors: [] });
    expect(by["Kırtasiye C"]).toMatchObject({ unitPrice: 7, currency: "USD", warnings: [] });
    expect(by["Kırtasiye D"]!.unitPrice).toBeNull();
    expect(by["Kırtasiye D"]!.warnings!.join()).toMatch(/0,01/);
    expect(by["Kırtasiye E"]!.unitPrice).toBe(33.33);
    expect(by["Kırtasiye E"]!.warnings).toHaveLength(1);
  });

  it("tek birimli talep: belgedeki USD satır kabul edilmez (sessizce TRY sayılmaz, hata taşır)", () => {
    const rows = [row({ text: "Kırtasiye A", unitPrice: 185, currency: "USD" })];
    const { unmatched } = matchDocRows(items, rows, { allowedCurrencies: ["TRY"], primaryCurrency: "TRY" });
    expect(unmatched[0]!.currency).toBeNull();
    expect(unmatched[0]!.errors!.join()).toMatch(/USD.*kabul edilmiyor/);
  });
});

describe("matchDocRows — birim belirsizliği (derin denetim MU-23 gözden geçirme)", () => {
  // Ana birim null'a çevrilince istemci "birim yok" ile "ana birim" ayırt
  // edemiyordu: teklif birimi USD seçilmiş TRY-ana talepte "185 TRY" satırı
  // 185 USD olarak forma yazılıyordu.
  it("ana birim satırı açık kod taşır; birimsiz satır null (teklif birimi)", () => {
    const rows = [
      row({ text: 'Çelik boru 2" DN50', unitPrice: 185, currency: "TRY" }),
      row({ text: "Flanş DN50 PN16", unitPrice: 90 }),
    ];
    const { matches } = matchDocRows(items, rows, OPTS);
    const by = Object.fromEntries(matches.map((m) => [m.itemId, m]));
    expect(by.i1!.currency).toBe("TRY");
    expect(by.i3!.currency).toBeNull();
  });

  it("birimsiz satır belgenin baskın birimini alır; izinsiz baskın birim HATA (MU-19: fiyat teklif birimine kaymaz)", () => {
    const rows = [row({ text: "Flanş DN50 PN16", unitPrice: 90 }), row({ text: "Kırtasiye Z", unitPrice: 5 })];
    const withDoc = matchDocRows(items, rows, { ...OPTS, docCurrency: "₺" });
    expect(withDoc.matches.find((m) => m.itemId === "i3")!.currency).toBe("TRY");
    expect(withDoc.unmatched[0]!.currency).toBe("TRY");
    const bad = matchDocRows(items, rows, { ...OPTS, docCurrency: "EUR" });
    const badI3 = bad.matches.find((m) => m.itemId === "i3")!;
    expect(badI3).toMatchObject({ currency: null, warnings: [] });
    expect(badI3.errors.join()).toMatch(/EUR.*kabul edilmiyor/);
    expect(bad.unmatched[0]!.errors!.join()).toMatch(/EUR.*kabul edilmiyor/);
    // Baskın birim izinli ama teklifin ana biriminden farklı (EUR belge, TRY
    // ana birim): satırlar açık EUR koduyla döner, istemci kalem birimi yazar.
    const eurDoc = matchDocRows(items, rows, { allowedCurrencies: ["TRY", "EUR"], primaryCurrency: "TRY", docCurrency: "€" });
    expect(eurDoc.matches.find((m) => m.itemId === "i3")).toMatchObject({ currency: "EUR", errors: [] });
  });
});

describe("yardımcılar", () => {
  it("normalizeCurrency", () => {
    expect(normalizeCurrency("₺")).toBe("TRY");
    expect(normalizeCurrency("TL")).toBe("TRY");
    expect(normalizeCurrency(" usd ")).toBe("USD");
    expect(normalizeCurrency("€")).toBe("EUR");
    expect(normalizeCurrency("Dolar")).toBeNull();
    expect(normalizeCurrency("₽")).toBe("RUB");
    expect(normalizeCurrency("руб.")).toBe("RUB");
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
    // "day" içindeki "ay" artık AY sayılmıyor (eskiden 15 gün → 450 gün).
    expect(normalizeDeliveryTime("15 days")).toBe("W3_4");
    // Tedarikçinin dilinde (DE/RU) teslim ifadeleri.
    expect(normalizeDeliveryTime("3 Wochen")).toBe("W3_4");
    expect(normalizeDeliveryTime("10 Tage")).toBe("W1_2");
    expect(normalizeDeliveryTime("2 месяца")).toBe("M2_3");
    expect(normalizeDeliveryTime("5-7 дней")).toBe("W1_2");
    expect(normalizeDeliveryTime("auf Lager")).toBe("STOKTAN");
    expect(normalizeDeliveryTime("в наличии")).toBe("STOKTAN");
  });
});
