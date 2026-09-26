import { foldSearchText } from "@rothern/shared";
import {
  SEARCH_TEXT_I18N_MAX,
  formatTrNumber,
  localizeNumbers,
  localizeRuUnits,
  qualityErrors,
  codeErrors,
  codeTokens,
  buildPrompt,
  buildSearchTextI18n,
  hasTranslatableText,
  localizeAttributes,
  localizeCompany,
  localizeFeatures,
  localizeListing,
  localizeProduct,
  numbersOf,
  numbersPreserved,
  parseModelOutput,
  readyLocales,
  SOURCE_HASH_PREFIX,
  TRANSLATION_PROMPT_VERSION,
  sourceHash,
  type ProductSource,
} from "../../src/modules/content-translation/content-translation.logic";
import { ContentTranslationService } from "../../src/modules/content-translation/content-translation.service";

/**
 * İÇERİK ÇEVİRİSİ SÖZLEŞMESİ (i18n Faz 1e).
 *
 * En tehlikeli hata UYDURMA: model kaynakta olmayan sayı/ölçü yazarsa alıcı
 * yanlış ürünü sipariş eder. Doğrulama kapısı burada kilitlenir; okuma yolu
 * çeviri yokken özgün metni aynen döndürmeli (fail-open).
 */
const product: ProductSource = {
  name: "Bakır levha 2 mm · 1000×2000",
  description: "Elektrolitik bakır, 2.400 kg stok. Top ağırlığı 25–30 kg.",
  keywords: ["bakır levha", "cu levha"],
  attributes: [{ label: "Kalınlık", value: "2 mm" }, { label: "Form", value: "Rulo" }],
};

function goodOutput(withAttributes = true) {
  const en = {
    name: "Copper sheet 2 mm · 1000×2000",
    description: "Electrolytic copper, 2,400 kg in stock. Roll weight 25–30 kg.",
    keywords: ["copper sheet", "cu sheet"],
    attributes: [{ label: "Thickness", value: "2 mm" }, { label: "Form", value: "Roll" }],
  };
  const ru = {
    name: "Медный лист 2 мм · 1000×2000",
    description: "Электролитическая медь, 2 400 кг на складе. Вес рулона 25–30 кг.",
    keywords: ["медный лист", "лист cu"],
    attributes: [{ label: "Толщина", value: "2 мм" }, { label: "Форма", value: "Рулон" }],
  };
  if (!withAttributes) {
    // Servis rig'inde ürün nitelik tanımı yok (`labelAttributes` boş döner) → kaynak da çıktı da nitelik taşımaz.
    return { sourceLocale: "tr", translations: { tr: { ...product, attributes: [] }, en: { ...en, attributes: [] }, ru: { ...ru, attributes: [] } } };
  }
  return { sourceLocale: "tr", translations: { tr: product, en, ru } };
}

describe("buildSearchTextI18n", () => {
  it("kaynak + çeviriler katlanır, yinelenen sözcük bir kez, alan kümesi aramayla aynı", () => {
    const text = buildSearchTextI18n(
      "LISTING",
      { title: "Çelik Boru", description: null, keywords: ["boru"], items: ["DN50 dikişsiz boru"] },
      [{ title: "Steel pipe", description: null, keywords: [{ src: "boru", dst: "pipe" }], items: [{ src: "DN50 dikişsiz boru", dst: "DN50 seamless pipe" }] }],
      foldSearchText,
    );
    expect(text.split(" ")).toEqual(["celik", "boru", "dn50", "dikissiz", "steel", "pipe", "seamless"]);
  });

  it("ürün açıklaması arama metnine GİRMEZ (searchText ile aynı kural); tavan uygulanır", () => {
    const text = buildSearchTextI18n("PRODUCT", { ...product, description: "gizli açıklama" }, [], foldSearchText);
    expect(text).not.toContain("gizli");
    const long = buildSearchTextI18n(
      "COMPANY",
      { aboutText: Array.from({ length: 2000 }, (_, i) => `kelime${i}`).join(" "), services: [], industry: null },
      [],
      foldSearchText,
    );
    expect(long.length).toBeLessThanOrEqual(SEARCH_TEXT_I18N_MAX);
  });
});

describe("teklif verenin gördüğü serbest metinler (kapsam turu 2026-09-25)", () => {
  const listing = {
    title: "Paslanmaz boru alımı",
    description: null,
    keywords: [],
    items: ["Paslanmaz boru DN50"],
    terms: "Teslimat fabrikaya yapılacaktır.",
    details: ["AISI 304, 6 m boy", "EN 10217-7 sertifikalı"],
    questions: ["Stok durumu nedir?"],
  };
  const out = (withDetails = true) =>
    JSON.stringify({
      sourceLocale: "tr",
      translations: Object.fromEntries(
        ["tr", "en", "ru"].map((l) => [
          l,
          {
            title: l === "tr" ? listing.title : "Stainless pipe purchase",
            description: null,
            keywords: [],
            items: [l === "tr" ? listing.items[0] : "Stainless pipe DN50"],
            terms: l === "tr" ? listing.terms : "Delivery to the factory.",
            details: withDetails ? ["AISI 304, 6 m length", "EN 10217-7 certified"] : [],
            questions: ["What is the stock status?"],
          },
        ]),
      ),
    });

  it("şartlar, kalem ayrıntıları ve sorular doğrulanır; liste uzunluğu uymazsa hata", () => {
    const ok = parseModelOutput("LISTING", listing, out());
    expect("error" in ok).toBe(false);
    const bad = parseModelOutput("LISTING", listing, out(false));
    expect("error" in bad && bad.error).toMatch(/details/);
  });

  it("okuma yolu: kalem açıklaması/şartnamesi ve soru metni kırpılmış metinle eşlenir", () => {
    const parsed = parseModelOutput("LISTING", listing, out());
    if ("error" in parsed) throw new Error(parsed.error);
    const view = localizeListing(
      {
        title: listing.title,
        terms: listing.terms,
        items: [
          {
            name: "Paslanmaz boru DN50",
            description: "AISI 304, 6 m boy ",
            specification: "EN 10217-7 sertifikalı",
            questions: [{ id: "q1", text: "Stok durumu nedir?" }],
          },
        ],
      },
      parsed.perLocale.en as never,
    );
    expect(view.terms).toBe("Delivery to the factory.");
    expect(view.items[0]).toMatchObject({
      name: "Stainless pipe DN50",
      description: "AISI 304, 6 m length",
      specification: "EN 10217-7 certified",
      questions: [{ id: "q1", text: "What is the stock status?" }],
    });
  });

  it("boş isteğe bağlı alan kaynak özetini DEĞİŞTİRMEZ (eski kayıtlar toplu yeniden çevrilmez)", () => {
    const base = { title: "T", description: null, keywords: [], items: ["a"] };
    expect(sourceHash("LISTING", base)).toBe(sourceHash("LISTING", { ...base }));
    expect(sourceHash("LISTING", { ...base, terms: "x" })).not.toBe(sourceHash("LISTING", base));
  });

  it("ürün teknik şartnamesi çevrilir ve detay sayfasında üzerine yazılır", () => {
    const src = { ...product, specification: "Kalınlık toleransı ±0,1 mm" };
    const t = { ...goodOutput(false) } as { translations: Record<string, Record<string, unknown>> } & Record<string, unknown>;
    const specs: Record<string, string> = { tr: src.specification, en: "Thickness tolerance ±0.1 mm", ru: "Допуск по толщине ±0,1 мм" };
    for (const l of ["tr", "en", "ru"]) t.translations[l]!.specification = specs[l];
    const parsed = parseModelOutput("PRODUCT", { ...src, attributes: [] }, JSON.stringify(t));
    if ("error" in parsed) throw new Error(parsed.error);
    const view = localizeProduct({ name: src.name, specification: src.specification }, parsed.perLocale.en as never);
    expect(view.specification).toBe("Thickness tolerance ±0.1 mm");
  });
});

describe("nitelik değeri — etiket katalogdan okuyucunun dilinde gelir (2026-09-25 hatası)", () => {
  const pairs = [{ label: { src: "Saklama koşulu", dst: "Storage conditions" }, value: { src: "Oda sıcaklığı", dst: "Room temperature" } }];
  it("detay: etiket İngilizce (katalog) iken DEĞER yine çevrilir, katalog etiketi korunur", () => {
    expect(localizeAttributes([{ label: "Storage condition", value: "Oda sıcaklığı" }], pairs)).toEqual([
      { label: "Storage condition", value: "Room temperature" },
    ]);
  });
  it("kart özellik satırı: 'Label: değer birim' — değer çevrilir, etiket ve birim kalır", () => {
    expect(localizeFeatures(["Storage condition: Oda sıcaklığı"], pairs)).toEqual(["Storage condition: Room temperature"]);
  });
  it("Türkçe okuyucu yolu değişmedi (etiket+değer)", () => {
    expect(localizeAttributes([{ label: "Saklama koşulu", value: "Oda sıcaklığı" }], pairs)).toEqual([
      { label: "Storage conditions", value: "Room temperature" },
    ]);
  });
});

describe("kalite katmanı v2 (inceleme 2026-09-25)", () => {
  it("'15 bin m²' hedefte '15,000 m²' ya da '15 thousand m²' olabilir; başka sayı olamaz", () => {
    expect(numbersPreserved("15 bin m² üretim alanı", "15,000 m² production area")).toBe(true);
    expect(numbersPreserved("15 bin m² üretim alanı", "15 thousand m² production area")).toBe(true);
    expect(numbersPreserved("2 milyon adet", "2,000,000 pcs")).toBe(true);
    expect(numbersPreserved("15 bin m²", "16,000 m²")).toBe(false);
  });

  it("Türkçe sayı biçimi hedef dile göre yeniden yazılır, rakamlar aynı", () => {
    expect(formatTrNumber("1.200", "en")).toBe("1,200");
    expect(formatTrNumber("1.234,56", "en")).toBe("1,234.56");
    expect(formatTrNumber("0,02", "en")).toBe("0.02");
    expect(formatTrNumber("2.400", "ru")).toBe("2\u00a0400");
    expect(formatTrNumber("0,02", "ru")).toBe("0,02");
  });

  it("yalnız kaynakta Türkçe biçimli olup hedefe AYNEN kopyalanan sayı düzeltilir", () => {
    const src = "8.000 m² alan, tolerans ±0,02 mm, EN 1.4301 malzeme, 15.09.2026 teslim";
    expect(localizeNumbers(src, "LED conversion of 8.000 m² area, tolerance ±0,02 mm, EN 1.4301, delivery 15.09.2026", "en")).toBe(
      "LED conversion of 8,000 m² area, tolerance ±0.02 mm, EN 1.4301, delivery 15.09.2026",
    );
    // Model zaten doğru yazdıysa dokunulmaz.
    expect(localizeNumbers(src, "8,000 m² area", "en")).toBe("8,000 m² area");
    expect(localizeNumbers("2.400 kg stok", "2.400 кг на складе", "ru")).toBe("2\u00a0400 кг на складе");
  });

  it("Rusçada sayıdan sonraki Latin birim Kiril sembole çevrilir; kodlara dokunulmaz", () => {
    // Bitişik TEK harfli birim ("12m") bilinçli dönüştürülmez: "26A" parça numarasıyla ayırt edilemez.
    expect(localizeRuUnits("Ширина 600 mm, мощность 150 kW, 80 g/m², <1 kV, 12 m")).toBe(
      "Ширина 600 мм, мощность 150 кВт, 80 г/м², <1 кВ, 12 м",
    );
    expect(localizeRuUnits("Болт M8, IP65, DN50, Siemens S7")).toBe("Болт M8, IP65, DN50, Siemens S7");
  });

  it("GERİLEME (v2 incelemesi): parça kodu içindeki harf birime çevrilmez; tek harfli birim yalnız boşluktan sonra", () => {
    expect(localizeRuUnits("Картридж HP 26A (CF226A), совместимый")).toBe("Картридж HP 26A (CF226A), совместимый");
    expect(localizeRuUnits("Ток 16 A, напряжение 220 V, 40 W, 5 l")).toBe("Ток 16 А, напряжение 220 В, 40 Вт, 5 л");
    expect(localizeRuUnits("Профиль S420MC, 6205-2RS, 2x2,5mm²")).toBe("Профиль S420MC, 6205-2RS, 2x2,5mm²");
    expect(localizeRuUnits("вес 1\u00a0200 kg")).toBe("вес 1\u00a0200 кг");
  });

  it("kod koruma: kaynak kodları hedefte AYNEN olmalı; sayı+birim kod sayılmaz", () => {
    expect(codeTokens("Rulman 6205-2RS, M6 cıvata, CF226A, S420MC sac, DN50, 4x16, 400kVAr, 24V, 3D")).toEqual([
      "6205-2RS", "M6", "CF226A", "S420MC", "DN50",
    ]);
    expect(codeErrors("name", "M6 cıvata", "Болт М6")[0]).toMatch(/codes must stay unchanged.*M6/);
    expect(codeErrors("name", "M6 cıvata", "Болт M6")).toEqual([]);
  });

  it("Latin + Kiril karışık sözcük reddedilir; ayrı sözcükler serbest", () => {
    expect(qualityErrors("name", "ru", "S420MC sac", "Лист S420МC")[0]).toMatch(/mixes Latin and Cyrillic/);
    expect(qualityErrors("name", "ru", "IP65 kablo", "Кабель IP65, ПЭТ-бутылка, SMD-светодиод")).toEqual([]);
  });

  it("yasaklı terim, çevrilmemiş Türkçe ve İngilizcede Kiril reddedilir; kaynaktaki özel ad serbest", () => {
    const src = "Çerkezköy'de pano montajı";
    expect(qualityErrors("title", "en", src, "Switchboard installation in Çerkezköy")).toEqual([]);
    expect(qualityErrors("title", "en", src, "Pano montajı in Çerkezköy")[0]).toMatch(/untranslated/);
    expect(qualityErrors("title", "en", src, "Tender for switchboards")[0]).toMatch(/forbidden/);
    expect(qualityErrors("title", "ru", src, "Конкурс на поставку щитов")[0]).toMatch(/forbidden/);
    expect(qualityErrors("title", "en", src, "Switchboard щит")[0]).toMatch(/Cyrillic/);
    expect(qualityErrors("title", "en", "Türk malı", "Made in Türkiye")).toEqual([]);
    expect(qualityErrors("about", "en", "Çerkezköy merkezli toptancı", "Çerkezköy-based wholesaler")).toEqual([]);
  });

  it("parseModelOutput kalite katmanını uygular: Türkçe kalan çeviri yeniden denemeye düşer", () => {
    const bad = goodOutput(false) as { translations: Record<string, Record<string, unknown>> };
    bad.translations.en!.name = "Copper levhası 2 mm · 1000×2000";
    const r = parseModelOutput("PRODUCT", { ...product, attributes: [] }, JSON.stringify(bad));
    expect("error" in r && r.error).toMatch(/en\.name: Turkish word "levhası"/);
  });
});

describe("sayı koruma", () => {
  it("binlik/ondalık ayraç ve boşluk farkını normalize eder", () => {
    expect(numbersOf("2.400 kg, 25–30 kg, 2 400 adet, %100")).toEqual(["2400", "25", "30", "2400", "100"]);
    expect(numbersPreserved("2.400 kg", "2,400 kg")).toBe(true);
    expect(numbersPreserved("Ne 30/1", "Ne 30/1 combed")).toBe(true);
  });
  it("boşlukla ayrılmış iki sayıyı birleştirmez", () => {
    expect(numbersOf("25 30 adet")).toEqual(["25", "30"]);
  });
  it("kaynaktaki sayı hedefte yoksa reddeder; hedefteki fazla sayı serbest", () => {
    expect(numbersPreserved("180 g/m²", "170 g/m²")).toBe(false);
    expect(numbersPreserved("180 g/m²", "180 g/m² (approx. 5 oz)")).toBe(true);
    expect(numbersPreserved("İki adet", "Two pieces")).toBe(true);
  });
});

describe("parseModelOutput", () => {
  it("geçerli çıktıyı kaynak→hedef çiftleriyle saklar", () => {
    const r = parseModelOutput("PRODUCT", product, JSON.stringify(goodOutput()));
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.sourceLocale).toBe("tr");
    const en = r.perLocale.en as { name: string; keywords: { src: string; dst: string }[]; attributes: unknown[] };
    expect(en.name).toBe("Copper sheet 2 mm · 1000×2000");
    expect(en.keywords[0]).toEqual({ src: "bakır levha", dst: "copper sheet" });
    expect(en.attributes).toHaveLength(2);
  });
  it("```json çitini soyar", () => {
    const r = parseModelOutput("PRODUCT", product, "```json\n" + JSON.stringify(goodOutput()) + "\n```");
    expect("error" in r).toBe(false);
  });
  it("uydurulmuş/eksik sayı → hata (yeniden deneme geri bildirimi)", () => {
    const bad = goodOutput();
    bad.translations.en.description = "Electrolytic copper, 3,400 kg in stock. Roll weight 25–30 kg.";
    const r = parseModelOutput("PRODUCT", product, JSON.stringify(bad));
    expect(r).toMatchObject({ error: expect.stringContaining("en.description") });
  });
  it("liste uzunluğu kaynakla uyuşmazsa hata", () => {
    const bad = goodOutput();
    bad.translations.ru.keywords = ["медный лист"];
    const r = parseModelOutput("PRODUCT", product, JSON.stringify(bad));
    expect(r).toMatchObject({ error: expect.stringContaining("ru.keywords") });
  });
  it("JSON değilse hata", () => {
    expect(parseModelOutput("PRODUCT", product, "Sure! Here is the translation")).toMatchObject({ error: expect.any(String) });
  });
  it("bilinmeyen kaynak dil 'other' olur, üç dil de saklanır", () => {
    const out = goodOutput();
    out.sourceLocale = "zh";
    const r = parseModelOutput("PRODUCT", product, JSON.stringify(out));
    expect(r).toMatchObject({ sourceLocale: "other" });
  });
});

describe("sourceHash / hasTranslatableText", () => {
  it("anahtar sırasından bağımsız, içerik değişince değişir", () => {
    const a = sourceHash("PRODUCT", product);
    const b = sourceHash("PRODUCT", { ...product, attributes: [...product.attributes] });
    expect(a).toBe(b);
    expect(sourceHash("PRODUCT", { ...product, name: "x" })).not.toBe(a);
    expect(sourceHash("LISTING", { title: "a", description: null, keywords: [], items: [] })).not.toBe(
      sourceHash("COMPANY", { aboutText: "a", services: [], industry: null }),
    );
  });
  it("özet istem sürümüyle ÖNEKLİ — kapsam denetimi eski sürümü SQL'de görür", () => {
    expect(SOURCE_HASH_PREFIX).toBe(`v${TRANSLATION_PROMPT_VERSION}:`);
    expect(sourceHash("PRODUCT", product).startsWith(SOURCE_HASH_PREFIX)).toBe(true);
    expect(sourceHash("PRODUCT", product)).toMatch(/^v\d+:[0-9a-f]{32}$/);
  });
  it("boş profil çevrilmez", () => {
    expect(hasTranslatableText({ aboutText: null, services: [], industry: null })).toBe(false);
    expect(hasTranslatableText({ aboutText: "Metal", services: [], industry: null })).toBe(true);
  });
  it("istem sözlüğü ve geri bildirimi taşır", () => {
    expect(buildPrompt("LISTING", { title: "t", description: null, keywords: [], items: [] }, "numbers missing")).toContain("REJECTED");
  });
});

describe("okuma yolu üzerine yazma", () => {
  const parsed = parseModelOutput("PRODUCT", product, JSON.stringify(goodOutput()));
  const en = "error" in parsed ? null : (parsed.perLocale.en as Parameters<typeof localizeProduct>[1]);

  it("ürün kartında ad + özet, detayda açıklama/anahtar/nitelik değişir; diğer alanlar aynen", () => {
    expect(en).not.toBeNull();
    const card = localizeProduct({ name: product.name, excerpt: "Elektrolitik…", slug: "bakir", priceMode: "FIXED" }, en!);
    expect(card.name).toBe("Copper sheet 2 mm · 1000×2000");
    expect(card.excerpt).toContain("Electrolytic copper");
    expect(card.slug).toBe("bakir");
    const detail = localizeProduct(
      {
        name: product.name,
        description: product.description,
        keywords: ["bakır levha", "yeni eklenen"],
        attributeList: [{ label: "Kalınlık", value: "2 mm", unit: null }, { label: "Renk", value: "Kızıl", unit: null }],
      },
      en!,
    );
    expect(detail.keywords).toEqual(["copper sheet", "yeni eklenen"]);
    expect(detail.attributeList).toEqual([
      { label: "Thickness", value: "2 mm", unit: null },
      { label: "Renk", value: "Kızıl", unit: null },
    ]);
  });
  it("talep kalemleri ADLA eşlenir (sıra değişse de)", () => {
    const t = { title: "Steel pipes", description: null, keywords: [], items: [{ src: "Boru", dst: "Pipe" }] };
    const out = localizeListing({ title: "Çelik borular", items: [{ name: "Yeni kalem" }, { name: "Boru" }] }, t);
    expect(out.title).toBe("Steel pipes");
    expect(out.items.map((i) => i.name)).toEqual(["Yeni kalem", "Pipe"]);
  });
  it("panel Açık Talepler kartı: düz `itemNames` dizisi de adla çevrilir (i18n Faz 1e panel)", () => {
    const t = { title: "Steel pipes", description: null, keywords: [], items: [{ src: "Boru", dst: "Pipe" }] };
    const row = localizeListing({ id: "l1", title: "Çelik borular", itemNames: ["Boru", "Yeni kalem"] }, t);
    expect(row.itemNames).toEqual(["Pipe", "Yeni kalem"]);
    expect(row.id).toBe("l1");
  });
  it("kart özellik satırı `Etiket: değer[ birim]` — etiket+değer çiftle çevrilir, birim ve eşleşmeyen satır kalır", () => {
    const pairs = [{ label: { src: "Kalınlık", dst: "Thickness" }, value: { src: "2", dst: "2" } }];
    expect(localizeFeatures(["Kalınlık: 2 mm", "Kalınlık: 2", "Renk: Kızıl"], pairs)).toEqual([
      "Thickness: 2 mm",
      "Thickness: 2",
      "Renk: Kızıl",
    ]);
    expect(localizeFeatures(["Kalınlık: 2 mm"], undefined)).toEqual(["Kalınlık: 2 mm"]);
    const card = localizeProduct({ name: "Sac", features: ["Kalınlık: 2 mm"] }, {
      name: "Sheet", description: null, keywords: [], attributes: pairs,
    });
    expect(card.features).toEqual(["Thickness: 2 mm"]);
  });
  it("firma: about/aboutText/industry/services", () => {
    const t = { aboutText: "About", services: [{ src: "Boyama", dst: "Dyeing" }], industry: "Textile" };
    expect(localizeCompany({ aboutText: "Hakkında", industry: "Tekstil", services: ["Boyama"] }, t)).toEqual({
      aboutText: "About",
      industry: "Textile",
      services: ["Dyeing"],
    });
    expect(localizeCompany({ about: "Hakkında", industry: null }, t)).toEqual({ about: "About", industry: null });
  });
});

describe("ContentTranslationService", () => {
  function rig(opts: { providerText?: string; providerFails?: boolean; existing?: unknown[] } = {}) {
    const rows = new Map<string, Record<string, unknown>>();
    const prisma = {
      companyItem: { findUnique: jest.fn(async () => ({ ...product, attributes: null, categoryId: null })) },
      // Arama metni HAM SQL ile yazılır (updatedAt'e dokunmasın): `$executeRaw\`…${text}…${id}\``.
      $executeRaw: jest.fn(async () => 1),
      listing: { findUnique: jest.fn() },
      company: { findUnique: jest.fn() },
      category: { findMany: jest.fn(async () => []) },
      categoryAttribute: { findMany: jest.fn(async () => []) },
      contentTranslation: {
        findMany: jest.fn(async (args: { where?: { locale?: string; fields?: unknown }; distinct?: string[] }) => {
          const all = [...rows.values()];
          if (args.distinct) {
            // Süpürücü sorgusu: varlık başına TEK satır (distinct), yalnız bekleyen/yeniden denenebilir.
            const open = all.filter((r) => r.status === "PENDING" || (r.status === "FAILED" && Number(r.attempts ?? 0) < 3));
            return open.length ? [{ entityType: "PRODUCT", entityId: "p1" }] : [];
          }
          if (args.where?.locale) return all.filter((r) => r.locale === args.where!.locale && r.fields != null);
          return all;
        }),
        upsert: jest.fn(async (args: { where: { entityType_entityId_locale: { locale: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
          const key = args.where.entityType_entityId_locale.locale;
          rows.set(key, { ...(rows.get(key) ?? args.create), ...args.update, locale: key });
          return rows.get(key);
        }),
        updateMany: jest.fn(async (args: { data: Record<string, unknown> }) => {
          const patch = Object.fromEntries(Object.entries({ status: args.data.status, error: args.data.error }).filter(([, v]) => v !== undefined));
          for (const r of rows.values()) Object.assign(r, patch);
          return { count: rows.size };
        }),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
    };
    const provider = opts.providerFails
      ? null
      : {
          complete: jest.fn(async () => ({
            text: opts.providerText ?? JSON.stringify(goodOutput(false)),
            usage: { inputTokens: 100, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 },
          })),
        };
    const cfg = {
      enabled: true,
      models: { premium: "gemini-pro-latest", default: "x", vision: "x" },
      pricing: { "gemini-pro-latest": { inputPerMTok: 1.25, outputPerMTok: 10, cacheReadPerMTok: 0.1 } },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new ContentTranslationService(prisma as any, cfg as any, provider as any);
    return { svc, prisma, provider, rows };
  }

  it("enqueue üç dil için PENDING açar; translateEntity DONE yazar, kaynak dile fields=null", async () => {
    const { svc, prisma, rows } = rig();
    (svc as unknown as { kick: () => void }).kick = () => {};
    expect(await svc.enqueue("PRODUCT", "p1")).toBe(true);
    expect(prisma.contentTranslation.upsert).toHaveBeenCalledTimes(3);
    expect(await svc.translateEntity("PRODUCT", "p1")).toBe("done");
    expect(rows.get("en")).toMatchObject({ status: "DONE", sourceLocale: "tr" });
    expect((rows.get("en") as { fields: { name: string } }).fields.name).toBe("Copper sheet 2 mm · 1000×2000");
    // Kaynak dilin satırı çeviri taşımaz (DbNull) — okuma yolu özgün metni kullanır.
    expect((rows.get("tr") as { fields: unknown }).fields).not.toEqual(expect.objectContaining({ name: expect.any(String) }));
    // Aynı kaynakla ikinci enqueue işlem yapmaz.
    expect(await svc.enqueue("PRODUCT", "p1")).toBe(false);
    // Çok dilli arama metni DONE anında yazılır: kaynak + EN + RU, katlanmış.
    const writes = prisma.$executeRaw.mock.calls as unknown as [TemplateStringsArray, string, string][];
    const last = writes[writes.length - 1]![1];
    expect(writes[writes.length - 1]![0].join("?")).toContain('UPDATE "company_items" SET "searchTextI18n"');
    expect(last).toContain("bakir levha");
    expect(last).toContain("copper sheet");
    expect(last).toContain(foldSearchText("медный лист")); // й → и: sorgu da aynı katlanır
  });

  it("doğrulanamayan çıktı bir düzeltme turu alır, yine bozuksa FAILED", async () => {
    const { svc, provider, rows } = rig({ providerText: "not json" });
    (svc as unknown as { kick: () => void }).kick = () => {};
    await svc.enqueue("PRODUCT", "p1");
    expect(await svc.translateEntity("PRODUCT", "p1")).toBe("failed");
    expect(provider!.complete).toHaveBeenCalledTimes(2);
    expect(rows.get("en")).toMatchObject({ status: "FAILED", error: expect.stringContaining("JSON") });
  });

  it("sağlayıcı fırlatırsa satır FAILED + hata mesajı, süpürücü DURMAZ", async () => {
    const { svc, rows, prisma } = rig();
    (svc as unknown as { kick: () => void }).kick = () => {};
    await svc.enqueue("PRODUCT", "p1");
    (svc as unknown as { provider: { complete: jest.Mock } }).provider.complete.mockRejectedValueOnce(new Error("404 model not found"));
    const r = await svc.processPending(10);
    expect(r).toEqual({ processed: 1, done: 0, failed: 1 });
    expect(rows.get("en")).toMatchObject({ status: "FAILED", error: expect.stringContaining("404 model not found") });
    // Kaynak okuma patlarsa da süpürme sürer ve satır FAILED olur.
    prisma.companyItem.findUnique.mockRejectedValueOnce(new Error("db down"));
    for (const row of rows.values()) Object.assign(row, { status: "PENDING", attempts: 0 });
    expect(await svc.processPending(10)).toEqual({ processed: 1, done: 0, failed: 1 });
    expect(rows.get("ru")).toMatchObject({ status: "FAILED", error: expect.stringContaining("db down") });
  });

  it("model 404 verirse sıradaki aday denenir ve çalışan model hatırlanır (Vertex `-latest` alias'ı)", async () => {
    const { svc, rows, provider } = rig();
    (svc as unknown as { kick: () => void }).kick = () => {};
    await svc.enqueue("PRODUCT", "p1");
    provider!.complete.mockRejectedValueOnce(
      new Error('Gemini hatası: {"error":{"code":404,"message":"Publisher model gemini-pro-latest was not found","status":"NOT_FOUND"}}'),
    );
    expect(await svc.translateEntity("PRODUCT", "p1")).toBe("done");
    expect(provider!.complete).toHaveBeenCalledTimes(2);
    expect((provider!.complete.mock.calls[0] as unknown as [{ model: string }])[0].model).toBe("gemini-pro-latest");
    expect((provider!.complete.mock.calls[1] as unknown as [{ model: string }])[0].model).toBe("gemini-3.1-pro");
    expect(rows.get("en")).toMatchObject({ status: "DONE", model: "gemini-3.1-pro" });
    expect(svc.modelCandidates()[0]).toBe("gemini-3.1-pro");
    expect(svc.modelCandidates()).not.toContain("gemini-pro-latest");
  });

  it("sağlayıcı yoksa kuyruk açılır ama kick etmez; okuma yolu özgün metni döndürür", async () => {
    const { svc } = rig({ providerFails: true });
    expect(svc.enabled).toBe(false);
    const cards = await svc.localizeProducts([{ name: "Bakır" }], ["p1"], "en");
    expect(cards).toEqual([{ name: "Bakır" }]);
  });

  it("localizeProducts çevirisi olan karta translatedFrom ekler, olmayanı aynen bırakır", async () => {
    const { svc } = rig();
    (svc as unknown as { kick: () => void }).kick = () => {};
    await svc.enqueue("PRODUCT", "p1");
    await svc.translateEntity("PRODUCT", "p1");
    const out = await svc.localizeProducts([{ name: product.name }, { name: "Başka" }], ["p1", "p2"], "en");
    expect(out[0]).toMatchObject({ name: "Copper sheet 2 mm · 1000×2000", translatedFrom: "tr" });
    expect(out[1]).toEqual({ name: "Başka" });
  });
});

describe("readyLocales — sayfa noindex'i ve sitemap dilleri ortak kural", () => {
  const row = (locale: string, fields: unknown, sourceLocale: string | null) => ({ locale, fields, sourceLocale });
  it("satır yok → yalnız Türkçe (kaynak Türkçe varsayılır)", () => {
    expect(readyLocales([])).toEqual(["tr"]);
  });
  it("ilk çeviri BEKLERKEN (kaynak dili henüz boş) Türkçe hazır sayılır — noindex almaz", () => {
    expect(readyLocales([row("tr", null, null), row("en", null, null), row("ru", null, null)])).toEqual(["tr"]);
  });
  it("çeviri bitti: kaynak + metni olan diller", () => {
    expect(readyLocales([row("tr", null, "tr"), row("en", { t: 1 }, "tr"), row("ru", { t: 1 }, "tr")])).toEqual(["tr", "en", "ru"]);
    expect(readyLocales([row("tr", null, "tr"), row("en", { t: 1 }, "tr"), row("ru", null, "tr")])).toEqual(["tr", "en"]);
  });
  it("kaynak İngilizce: Türkçe çeviri gelene dek Türkçe hazır değil", () => {
    expect(readyLocales([row("tr", null, "en"), row("en", null, "en"), row("ru", null, "en")])).toEqual(["en"]);
  });
});
