import { SeoEnrichService } from "../../../src/modules/ai/seo-enrich/seo-enrich.service";
import { clampSentences, isMostlyCjk, lowerCaseWords } from "../../../src/modules/ai/ai-text";
import { runWithLocale } from "../../../src/common/i18n/locale-context";

/**
 * Açıklama güçlendirme — sanitizer sözleşmesi: madde/emoji temizliği,
 * cümle sınırında kesme, anahtar kelime birleşimi, boş yanıtta premium
 * retry sonra dürüst 503. Model taslak üretir, yazma yok.
 */
function makeAi(texts: string[]) {
  const callAi = jest.fn();
  for (const t of texts) callAi.mockResolvedValueOnce({ text: t, downgraded: false, warned: false });
  return { assertAiAccess: jest.fn(), callAi };
}
const user = { companyId: "c1", userId: "u1", tier: "SILVER" } as never;

/**
 * Katalog (test): 31 görünür; 10 gizli SEGMENT; 46 görünür segment ama 4610 /
 * 4611 aileleri ve 461825 sınıfı gizli (`HIDDEN_CATEGORY_PREFIXES`); 46181700
 * (4618 ailesinin görünür sınıfı) sıradan kategoridir.
 */
const CATALOG = [
  { id: "31161500", nameTr: "Vidalar", nameEn: "Screws", nameRu: "Винты" },
  { id: "46181700", nameTr: "Baş koruma", nameEn: "Head protection", nameRu: "Защита головы" },
  { id: "46101500", nameTr: "Ateşli silahlar", nameEn: "Firearms", nameRu: "Огнестрельное оружие" },
  { id: "46182500", nameTr: "Kişisel savunma cihazları", nameEn: "Personal defense devices", nameRu: "Средства самообороны" },
  { id: "10101500", nameTr: "Çiftlik hayvanları", nameEn: "Livestock", nameRu: "Домашний скот" },
  // Aynı ad hem gizli hem görünür dalda: görünür kategori adı olarak geçerlidir.
  { id: "46111700", nameTr: "Sensörler", nameEn: "Sensors", nameRu: "Датчики" },
  { id: "41111900", nameTr: "Sensörler", nameEn: "Sensors", nameRu: "Датчики" },
];
type NameIn = { in: string[] };
type NameWhere = {
  AND: [{ NOT: { id: { startsWith: string } }[] }, { OR: [{ nameTr: NameIn }, { nameEn: NameIn }, { nameRu: NameIn }] }];
};
/** Sahte Prisma `where`i GERÇEKTEN uygular: NOT startsWith (gizli önek: segment / aile / sınıf) ∧ ad üç dilden biri. */
function makePrisma() {
  const findFirst = jest.fn(async ({ where }: { where: NameWhere }) => {
    const [hidden, names] = where.AND;
    const [tr, en, ru] = names.OR;
    return (
      CATALOG.find(
        (c) =>
          !hidden.NOT.some((n) => c.id.startsWith(n.id.startsWith)) &&
          (tr.nameTr.in.includes(c.nameTr) || en.nameEn.in.includes(c.nameEn) || ru.nameRu.in.includes(c.nameRu)),
      ) ?? null
    );
  });
  return { category: { findFirst } };
}
const service = (ai: unknown, prisma: unknown = makePrisma()) => new SeoEnrichService(ai as never, prisma as never);
const LONG = "Paslanmaz çelik dirsek AISI 316 alaşımından üretilir ve gıda tesislerinde kullanılır. Kaynaklı bağlantıya uygundur. Koli içinde 50 adet sevk edilir. ".repeat(2);

describe("SeoEnrichService", () => {
  it("taslağı temizler: madde işaretleri, emoji, anahtar kelime birleşimi, uzunluk tavanı", async () => {
    const ai = makeAi([
      JSON.stringify({
        description: `- ${LONG} 🚀 ${"Ek cümle burada. ".repeat(60)}`,
        keywords: ["Dirsek", "dirsek", " DN50 ", "x"],
        titleSuggestion: "Paslanmaz çelik dirsek 90° DN50",
        missingFacts: ["ölçü", "standart", 42, "", "a", "b", "c", "d"],
      }),
    ]);
    const svc = service(ai);
    const r = await svc.enrich(user, { kind: "product", name: "Dirsek", keywords: ["paslanmaz"], facts: ["Malzeme: AISI 316"] });
    expect(r.description.startsWith("Paslanmaz")).toBe(true);
    expect(r.description).not.toContain("🚀");
    expect(r.description.length).toBeLessThanOrEqual(900);
    expect(/[.!?]$/.test(r.description)).toBe(true); // cümle sınırında kesildi
    expect(r.keywords.slice(0, 3)).toEqual(["paslanmaz", "dirsek", "dn50"]);
    expect(r.titleSuggestion).toBe("Paslanmaz çelik dirsek 90° DN50");
    expect(r.missingFacts).toEqual(["ölçü", "standart", "a", "b", "c"]);
    expect(ai.assertAiAccess).toHaveBeenCalled();
    const prompt = ai.callAi.mock.calls[0][1].prompt as string;
    expect(prompt).toContain("<veri>");
    expect(prompt).toContain("Malzeme: AISI 316");
  });

  it("kullanıcının mevcut anahtar kelimeleri (15) 10'a KIRPILMAZ; tavan altında model önerisi eklenir (derin denetim S015)", async () => {
    const mevcut = Array.from({ length: 15 }, (_, i) => `etiket ${i + 1}`);
    const ai = makeAi([JSON.stringify({ description: LONG, keywords: ["yeni öneri"] })]);
    const r = await service(ai).enrich(user, { kind: "product", name: "Dirsek", keywords: mevcut });
    expect(r.keywords).toEqual(mevcut);

    const az = makeAi([JSON.stringify({ description: LONG, keywords: ["yeni öneri", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9"] })]);
    const r2 = await service(az).enrich(user, { kind: "product", name: "Dirsek", keywords: ["paslanmaz"] });
    expect(r2.keywords).toHaveLength(10);
    expect(r2.keywords.slice(0, 2)).toEqual(["paslanmaz", "yeni öneri"]);
  });

  it("kısa/boş yanıtta premium retry; yine boşsa 503", async () => {
    const ai = makeAi(["{}", JSON.stringify({ description: LONG, keywords: [] })]);
    const svc = service(ai);
    const r = await svc.enrich(user, { kind: "company", name: "Acme" });
    expect(r.description.length).toBeGreaterThan(100);
    expect(ai.callAi).toHaveBeenCalledTimes(2);
    expect(ai.callAi.mock.calls[1][1].premiumRetry).toBe(true);

    const bad = makeAi(["bozuk", "{}"]);
    await expect(service(bad).enrich(user, { kind: "listing", name: "Boru alımı" })).rejects.toThrow(/üretilemedi/);
  });

  it("DİL: içerik (açıklama/anahtar kelime/ad önerisi) girdinin dilinde, eksik olgu etiketleri arayüz dilinde — kural istemin SONUNDA; sabit 'Türkçe' yok", async () => {
    const ai = makeAi([JSON.stringify({ description: LONG, keywords: [] })]);
    await runWithLocale("ru", () => service(ai).enrich(user, { kind: "product", name: "Edelstahlbogen" }));
    const system = ai.callAi.mock.calls[0][1].system as string;
    expect(system).toContain("ÇIKTI DİLİ (description, keywords, titleSuggestion)");
    expect(system).toContain("KULLANICI METNİ DİLİ (missingFacts)");
    expect(system).toContain("Русский (ru)");
    expect(system).not.toMatch(/Türkçe bir açıklama|doğal Türkçeyle|İngilizce karşılığı/);
    expect(system.trimEnd().endsWith("girdi başka dilde olsa bile.")).toBe(true);
  });

  it("anahtar kelime küçük harfi dile duyarlı; CJK açıklama kısa sınırla kabul edilir ve '。' sınırında kesilir", async () => {
    const zh = "不锈钢弯头采用AISI 316合金制造，适用于食品工厂。".repeat(20);
    const ai = makeAi([JSON.stringify({ description: zh, keywords: ["IP65", "IŞIK", "不锈钢"] })]);
    const r = await service(ai).enrich(user, { kind: "product", name: "不锈钢弯头" });
    expect(ai.callAi).toHaveBeenCalledTimes(1); // 120 karakter altı sayılmadı (CJK ÷3)
    expect(r.keywords).toEqual(["ip65", "ışık", "不锈钢"]);
    expect(r.description.length).toBeLessThanOrEqual(300);
    expect(r.description.endsWith("。")).toBe(true);
    expect(isMostlyCjk(zh)).toBe(true);
    expect(isMostlyCjk(LONG)).toBe(false);
    expect(lowerCaseWords("İSTANBUL IP65")).toBe("istanbul ip65");
    expect(clampSentences("Первое предложение. Второе предложение длиннее.", 30)).toBe("Первое предложение.");
  });

  /**
   * GİZLİ DAL (2026-10-09, kullanıcı: "anasayfada olmayan kategori talepte,
   * üründe ya da başka yerde de gösterilmesin" — model istemi dahil). İstemci
   * kategori ADINI saklanan koddan çözüp yollar; gizli dalda (segment, aile ya
   * da sınıf) kalmış eski ürünün / talebin kategorisi isteme yazılmaz, taslak
   * kategorisiz üretilir.
   */
  describe("kategori adı isteme yalnız GÖRÜNÜR katalog kategorisiyse girer", () => {
    const promptOf = async (categoryName: string | null | undefined, prisma: unknown = makePrisma()) => {
      const ai = makeAi([JSON.stringify({ description: LONG, keywords: [] })]);
      const r = await service(ai, prisma).enrich(user, { kind: "product", name: "Baret", categoryName });
      expect(r.description.length).toBeGreaterThan(100); // taslak yine üretildi
      return ai.callAi.mock.calls[0][1].prompt as string;
    };

    it.each([
      // gizli AİLE (4610)
      "Ateşli silahlar",
      "Firearms",
      "Огнестрельное оружие",
      // görünür ailenin gizli SINIFI (461825)
      "Kişisel savunma cihazları",
      "Personal defense devices",
      // gizli SEGMENT (10)
      "Çiftlik hayvanları",
      "Livestock",
    ])(
      "eski kaydın gizli kategorisi (%s) isteme yazılmaz",
      async (hiddenName) => {
        const prompt = await promptOf(hiddenName);
        expect(prompt).not.toContain("Kategori:");
        expect(prompt).not.toContain(hiddenName);
        expect(prompt).toContain("Ad/Başlık: Baret");
      },
    );

    it.each([
      "Vidalar",
      "Screws",
      "Винты",
      // 46 altındaki görünür sınıf sıradan kategoridir (2026-10-10).
      "Baş koruma",
      "Head protection",
      "Защита головы",
    ])("görünür kategori adı (%s) üç dilde de yazılır", async (name) => {
      expect(await promptOf(name)).toContain(`Kategori: ${name}`);
      expect(await promptOf(`  ${name} `)).toContain(`Kategori: ${name}\n`);
    });

    it("aynı adı görünür bir kategori de taşıyorsa ad yazılır (gizli olan hiçbir şey açığa çıkmaz)", async () => {
      expect(await promptOf("Sensörler")).toContain("Kategori: Sensörler");
    });

    it("katalogda karşılığı olmayan serbest metin yazılmaz; ad yoksa sorgu yapılmaz; sorgu düşerse satır yazılmaz", async () => {
      expect(await promptOf("Kolluk kuvvetleri teçhizatı")).not.toContain("Kategori:");

      const idle = makePrisma();
      expect(await promptOf(null, idle)).not.toContain("Kategori:");
      expect(await promptOf("   ", idle)).not.toContain("Kategori:");
      expect(idle.category.findFirst).not.toHaveBeenCalled();

      const broken = { category: { findFirst: jest.fn().mockRejectedValue(new Error("db down")) } };
      expect(await promptOf("Vidalar", broken)).not.toContain("Kategori:");
    });
  });

  it("ad yoksa 400; ad önerisi adla aynıysa null", async () => {
    const ai = makeAi([JSON.stringify({ description: LONG, keywords: [], titleSuggestion: "acme" })]);
    const svc = service(ai);
    await expect(svc.enrich(user, { kind: "product", name: " " })).rejects.toThrow(/ad/);
    const r = await svc.enrich(user, { kind: "product", name: "Acme" });
    expect(r.titleSuggestion).toBeNull();
  });
});
