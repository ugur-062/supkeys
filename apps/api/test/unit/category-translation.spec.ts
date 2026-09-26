import { buildAttributePrompt, buildCategoryPrompt, parseAttributeBatch, parseCategoryBatch, type AttributeBatchRow, type CategoryBatchRow } from "../../src/modules/content-translation/category-translation.logic";

/** i18n Faz 4 — kategori adı toplu çevirisi: istem ve çıktı denetimi. */
const rows: CategoryBatchRow[] = [
  { code: "39000000", level: 1, tr: "Elektrik sistemleri ve aydınlatma" },
  { code: "39120000", level: 2, tr: "Elektrik ekipmanı ve bileşenleri", parentTr: "Elektrik sistemleri ve aydınlatma" },
  { code: "31161500", level: 3, tr: "Vidalar", sourceEn: "Screws", parentTr: "Bağlantı elemanları" },
];

describe("buildCategoryPrompt", () => {
  it("kodları, Türkçe adı, kaynak İngilizceyi ve üst kategoriyi taşır", () => {
    const p = buildCategoryPrompt(rows, ["en", "ru"]);
    expect(p).toContain('"code":"31161500"');
    expect(p).toContain('"sourceEn":"Screws"');
    expect(p).toContain('"parent":"Bağlantı elemanları"');
    expect(p).toContain("en, ru");
  });
});

describe("parseCategoryBatch", () => {
  const good = JSON.stringify([
    { code: "39000000", en: "Electrical systems and lighting", ru: "Электрические системы и освещение" },
    { code: "39120000", en: "Electrical equipment and components", ru: "Электрооборудование и компоненты" },
    { code: "31161500", en: "Screws", ru: "Винты" },
  ]);
  it("tam ve doğru çıktıyı kod → {en, ru} olarak ayrıştırır (```json çiti dahil)", () => {
    const r = parseCategoryBatch(rows, "```json\n" + good + "\n```");
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.byCode.get("31161500")).toEqual({ en: "Screws", ru: "Винты" });
    expect(r.byCode.size).toBe(3);
  });
  it("eksik kod → hata (yeniden deneme mesajı)", () => {
    const r = parseCategoryBatch(rows, JSON.stringify([{ code: "39000000", en: "x", ru: "у" }]));
    expect(r).toEqual({ error: expect.stringContaining("missing codes") });
  });
  it("JSON değilse hata", () => {
    expect(parseCategoryBatch(rows, "Sure! Here are the translations…")).toEqual({ error: expect.stringContaining("JSON") });
  });
  it("Rusça Kiril değilse (çoğunluk) hata; sayı/kısaltma adları muaf", () => {
    const latin = JSON.stringify(rows.map((r) => ({ code: r.code, en: "x", ru: "Latin words only" })));
    expect(parseCategoryBatch(rows, latin)).toEqual({ error: expect.stringContaining("Cyrillic") });
    const abbr = JSON.stringify(rows.map((r) => ({ code: r.code, en: "ISO 9001", ru: "ISO 9001" })));
    expect("error" in parseCategoryBatch(rows, abbr)).toBe(false);
  });
  it("İngilizcede Türkçe harf kalmışsa (çoğunluk) hata", () => {
    const tr = JSON.stringify(rows.map((r) => ({ code: r.code, en: "Elektrik ekipmanı", ru: "Оборудование" })));
    expect(parseCategoryBatch(rows, tr)).toEqual({ error: expect.stringContaining("Turkish") });
  });
});

/** i18n Faz 4b — nitelik etiketi + seçenek listesi toplu çevirisi. */
describe("parseAttributeBatch", () => {
  const rows: AttributeBatchRow[] = [
    { id: "a1", categoryTr: "Metaller", tr: "Form", options: ["Levha", "Rulo", "Boru"] },
    { id: "a2", categoryTr: "Metaller", tr: "Kalınlık", unit: "mm", options: [] },
  ];
  it("istem etiket, bağlam ve seçenekleri taşır", () => {
    const p = buildAttributePrompt(rows);
    expect(p).toContain('"options":["Levha","Rulo","Boru"]');
    expect(p).toContain('"unit":"mm"');
  });
  it("seçenek dizileri AYNI uzunlukta olmalı; seçeneksiz nitelikte boş dizi kabul", () => {
    const good = JSON.stringify([
      { id: "a1", en: "Form", ru: "Форма", optionsEn: ["Sheet", "Coil", "Pipe"], optionsRu: ["Лист", "Рулон", "Труба"] },
      { id: "a2", en: "Thickness", ru: "Толщина", optionsEn: [], optionsRu: [] },
    ]);
    const r = parseAttributeBatch(rows, good);
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.byId.get("a1")).toEqual({ en: "Form", ru: "Форма", optionsEn: ["Sheet", "Coil", "Pipe"], optionsRu: ["Лист", "Рулон", "Труба"] });
    expect(r.byId.get("a2")?.optionsEn).toEqual([]);
  });
  it("uzunluk uyuşmazlığı → hata (yeniden deneme mesajı seçenek sayısını söyler)", () => {
    const bad = JSON.stringify([
      { id: "a1", en: "Form", ru: "Форма", optionsEn: ["Sheet", "Coil"], optionsRu: ["Лист", "Рулон", "Труба"] },
      { id: "a2", en: "Thickness", ru: "Толщина", optionsEn: [], optionsRu: [] },
    ]);
    expect(parseAttributeBatch(rows, bad)).toEqual({ error: expect.stringContaining("options length") });
  });
});
