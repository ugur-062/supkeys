import { categorySearchStem, foldSearchText, isRussianEnding, stemPrefix, tokenizeQuery } from "@rothern/shared";

describe("search-fold — stemPrefix", () => {
  it("Türkçe ek toleransı değişmedi", () => {
    expect(stemPrefix("borulari")).toBe("boru");
    expect(stemPrefix("sistemleri")).toBe("sistem");
    expect(stemPrefix("kablolar")).toBe("kablo");
    expect(stemPrefix("elektrik")).toBe("elektrik");
    expect(stemPrefix("pres")).toBe("pres");
  });

  it("İngilizce çoğul (i18n arama)", () => {
    expect(stemPrefix("pipes")).toBe("pipe");
    expect(stemPrefix("valves")).toBe("valve");
    expect(stemPrefix("boxes")).toBe("box");
    expect(stemPrefix("batteries")).toBe("batter");
    expect(stemPrefix("glass")).toBe("glass");
    expect(stemPrefix("cactus")).toBe("cactus");
    expect(stemPrefix("pipe")).toBe("pipe");
  });

  it("Kiril katlama iki tarafta aynı (ё/й)", () => {
    expect(foldSearchText("Стальная ТРУБА")).toBe("стальная труба");
    expect(foldSearchText("ёлка")).toBe(foldSearchText("ЁЛКА"));
  });
});

/**
 * recategory-new-5: İngilizce sektör adını yazan kullanıcının "and"i her
 * satırda vurgulanıyor ve AND süzgecine giriyordu. Bağlaç listesi üç dilde.
 */
describe("search-fold — tokenizeQuery bağlaçları (üç dil)", () => {
  it("İngilizce ve Rusça bağlaç / edat elenir, anlamlı kelimeler kalır", () => {
    expect(tokenizeQuery("Manufacturing Components and Supplies")).toEqual([
      "Manufacturing",
      "Components",
      "Supplies",
    ]);
    expect(tokenizeQuery("nuts or bolts for the top of AND")).toEqual(["nuts", "bolts", "top"]);
    expect(tokenizeQuery("Оборудование для сварки и пайки или резки")).toEqual([
      "Оборудование",
      "сварки",
      "пайки",
      "резки",
    ]);
  });

  it("Türkçe bağlaçlar eskisi gibi; yalnız bağlaçtan oluşan sorgu boş döner", () => {
    expect(tokenizeQuery("boru ve vana ile fittings")).toEqual(["boru", "vana", "fittings"]);
    for (const q of ["and the", "of for or", "или для", "ve ile"]) {
      expect({ q, tokens: tokenizeQuery(q) }).toEqual({ q, tokens: [] });
    }
  });

  it("bağlacı İÇEREN sözcük elenmez", () => {
    expect(tokenizeQuery("android forklift offset thermal oring")).toEqual([
      "android",
      "forklift",
      "offset",
      "thermal",
      "oring",
    ]);
    expect(tokenizeQuery("длинный илистый")).toEqual(["длинный", "илистый"]);
  });
});

/**
 * Kategori aramasının kökü (category-2 / code-category-2, recategory-new-3).
 * Ürün araması `stemPrefix`'i kullanmaya devam eder; o kural DEĞİŞMEDİ.
 */
describe("search-fold — categorySearchStem", () => {
  const stem = (word: string) => categorySearchStem(foldSearchText(word));

  it("üst üste Türkçe ek köke iner (çoğul + iyelik + hâl)", () => {
    expect(stem("rulmanlarının")).toBe("rulman");
    expect(stem("borularının")).toBe("boru");
    expect(stem("vidalarının")).toBe("vida");
    expect(stem("makinelerinin")).toBe("makine");
    expect(stem("pompasının")).toBe("pompa");
    expect(stem("pompaların")).toBe("pompa");
    expect(stem("borularda")).toBe("boru");
    expect(stem("borusundan")).toBe("boru");
    expect(stem("üretiminin")).toBe("uretim");
  });

  it("kökün kendi hecesini yemez: 'cıvatalarının' 'cıvata'da durur ('cıva'ya inmez)", () => {
    expect(stem("cıvatalarının")).toBe("civata");
    expect(stem("cıvataları")).toBe("civata");
    // Tek ekli gibi görünen kelimede ortak kuraldan ÖTEYE gidilmez.
    expect(stem("kapasite")).toBe("kapasi");
    expect(stem("türbini")).toBe("turbi");
    expect(stem("yangından")).toBe("yangi");
    expect(stem("makine")).toBe("makin");
  });

  it("tek ekli ve eksiz kelimede `stemPrefix` ile aynı kök", () => {
    for (const w of ["borulari", "sistemleri", "kablolar", "kablolarini", "panosu", "pompasi", "elektrik", "rulman", "tekstil", "nakliye", "mobilya", "kaplin", "civata", "hardware"]) {
      expect({ w, stem: categorySearchStem(w) }).toEqual({ w, stem: stemPrefix(w) });
    }
  });

  it("Rusça ad ve sıfat çekimleri aynı köke iner", () => {
    expect(stem("сварка")).toBe("сварк");
    expect(stem("сварки")).toBe("сварк");
    expect(stem("кабель")).toBe("кабел");
    expect(stem("кабели")).toBe("кабел");
    expect(stem("кабеля")).toBe("кабел");
    expect(stem("стальная")).toBe("стальн");
    expect(stem("стальные")).toBe("стальн");
    expect(stem("Стальной")).toBe("стальн");
    expect(stem("труба")).toBe("труб");
    expect(stem("трубы")).toBe("труб");
    expect(stem("подшипник")).toBe("подшипник");
    expect(stem("подшипники")).toBe("подшипник");
    expect(stem("подшипников")).toBe("подшипник");
    expect(stem("электродвигатель")).toBe("электродвигател");
    expect(stem("электродвигатели")).toBe("электродвигател");
    expect(stem("электродвигателей")).toBe("электродвигател");
    // Türetme eki kök değildir: sıfat ayrı kalır.
    expect(stem("сварочный")).toBe("сварочн");
  });

  it("İngilizce çoğul; kök 4 karakterden kısaysa kelime yazıldığı gibi kalır", () => {
    expect(stem("pipes")).toBe("pipe");
    expect(stem("bearings")).toBe("bearing");
    expect(stem("boxes")).toBe("boxes");
    expect(stem("fries")).toBe("fries");
    expect(stem("copies")).toBe("copies");
    expect(stem("газы")).toBe("газы");
    expect(stem("цепи")).toBe("цепи");
    expect(stem("болты")).toBe("болт");
    expect(stem("")).toBe("");
  });

  it("ortak kural (ürün araması) değişmedi: tek ek, Rusça çekim yok", () => {
    expect(stemPrefix("rulmanlarinin")).toBe("rulmanlari");
    expect(stemPrefix("borularinin")).toBe("borulari");
    expect(stemPrefix(foldSearchText("кабели"))).toBe("кабели");
    expect(stemPrefix("boxes")).toBe("box");
  });

  it("isRussianEnding: çekim eki / yalın hâl evet, türetme hayır", () => {
    expect(isRussianEnding("")).toBe(true);
    expect(isRussianEnding("и")).toBe(true);
    expect(isRussianEnding("ами")).toBe(true);
    expect(isRussianEnding("ьные")).toBe(false);
    expect(isRussianEnding("очныи")).toBe(false);
  });
});
