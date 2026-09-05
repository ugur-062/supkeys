/**
 * AI ARAMA (search-intent) — doğal dil → süzgeç. Model çağrısı mock, katalog
 * çözümleme ve il kanonikleştirme GERÇEK veritabanında.
 */
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { foldSearchText } from "@rothern/shared";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import type { AiService } from "../../src/modules/ai/ai.service";
import { SearchIntentService, parseModelNumber } from "../../src/modules/ai/search-intent/search-intent.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

function rig(modelJson: unknown | string, second?: unknown | string) {
  const reply = (v: unknown | string) => ({
    text: typeof v === "string" ? v : JSON.stringify(v),
    downgraded: false,
    warned: false,
    finishReason: "STOP",
  });
  const callAi = jest.fn().mockResolvedValueOnce(reply(modelJson));
  if (second !== undefined) callAi.mockResolvedValueOnce(reply(second));
  const assertAiAccess = jest.fn();
  const service = new SearchIntentService(
    { assertAiAccess, callAi } as unknown as AiService,
    prisma as unknown as PrismaService,
  );
  return { service, callAi, assertAiAccess };
}

async function makeCategory(code: string, nameTr: string, level: number, inDiscovery = true) {
  await prisma.category.create({
    data: {
      id: code, code, nameTr, keywords: "", searchText: foldSearchText(nameTr),
      level, parentId: null, isActive: true, sortOrder: 0, inDiscovery,
    },
  });
}

describe("AI arama — search-intent", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("ALICI: süzgeç alanları temizlenir, kategori katalogdan çözülür, il kanonik yazıma döner, taslak kurulur", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const other = await makeCompanyWithUser(prisma);
    await prisma.company.update({ where: { id: other.company.id }, data: { city: "İstanbul" } });
    await makeCategory("39121500", "Kompanzasyon panoları", 3);
    const { service, callAi, assertAiAccess } = rig({
      summary: "Anladığım: 50 adet 400 kVAr kompanzasyon panosu, İstanbul, doğrulanmış üretici",
      title: "400 kVAr kompanzasyon panosu alımı",
      query: "kompanzasyon panosu",
      itemName: "Kompanzasyon panosu 400 kVAr",
      categoryHint: "kompanzasyon panoları",
      city: "istanbul",
      verifiedOnly: true,
      activity: "MANUFACTURER",
      priceMax: "1.500,50",
      currency: "try",
      quantity: "50",
      unit: "Adet",
      keywords: ["Kompanzasyon", "pano", "kompanzasyon", "reaktif"],
    });
    const r = await service.interpret(auth, {
      text: "İstanbul'a teslim 50 adet 400 kVAr kompanzasyon panosu, doğrulanmış üretici, adet başı en fazla 1500,50 TL",
      portal: "satinalma",
    });
    expect(assertAiAccess).toHaveBeenCalled();
    expect(callAi).toHaveBeenCalledTimes(1);
    expect(callAi.mock.calls[0][1]).toMatchObject({ feature: "search_intent", thinkingLevel: "low" });
    expect(r.portal).toBe("satinalma");
    expect(r.query).toBe("kompanzasyon panosu");
    expect(r.category).toEqual({ id: "39121500", nameTr: "Kompanzasyon panoları" });
    expect(r.city).toBe("İstanbul");
    expect(r.verifiedOnly).toBe(true);
    expect(r.activity).toBe("MANUFACTURER");
    expect(r.priceMax).toBe(1500.5);
    expect(r.currency).toBe("TRY");
    expect(r.quantity).toBe(50);
    expect(r.unit).toBe("adet");
    expect(r.keywords).toEqual(["kompanzasyon", "pano", "reaktif"]);
    // Taslak: kalem + önerilen kategori + açıklama olarak metin.
    expect(r.draft?.draft.title).toBe("400 kVAr kompanzasyon panosu alımı");
    expect(r.draft?.draft.items).toEqual([
      expect.objectContaining({ name: "Kompanzasyon panosu 400 kVAr", quantity: 50, unit: "adet" }),
    ]);
    expect(r.draft?.draft.suggestedCategoryIds).toEqual(["39121500"]);
    expect(r.draft?.route).toBe("text");
  });

  it("UYDURMA yok: geçersiz faaliyet/para birimi/kod-gibi ipucu düşer; bulunamayan kategori null ama ipucu döner", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const { service } = rig({
      summary: "Anladığım: vida",
      query: "vida",
      categoryHint: "39121500",
      activity: "SATICI",
      currency: "XYZ",
      priceMax: "-5",
      quantity: "abc",
      keywords: null,
    });
    const r = await service.interpret(auth, { text: "vida arıyorum", portal: "satinalma" });
    expect(r.categoryHint).toBeNull();
    expect(r.category).toBeNull();
    expect(r.activity).toBeNull();
    expect(r.currency).toBeNull();
    expect(r.priceMax).toBeNull();
    expect(r.quantity).toBeNull();
    expect(r.keywords).toEqual([]);
    expect(r.verifiedOnly).toBe(false);
    const { service: s2 } = rig({ summary: "Anladığım: uzay asansörü", query: "uzay asansörü", categoryHint: "uzay asansörü" });
    const r2 = await s2.interpret(auth, { text: "uzay asansörü", portal: "satinalma" });
    expect(r2.category).toBeNull();
    expect(r2.categoryHint).toBe("uzay asansörü");
  });

  it("SATICI: taslak yok, portal 'satis'; talep kategorisi discovery kapısına tabi DEĞİL", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    await makeCategory("39121600", "Şalt malzemeleri", 3, false);
    const { service, callAi } = rig({ summary: "Anladığım: şalt malzemesi satışı", query: "şalt", categoryHint: "şalt malzemeleri", title: "x", itemName: "y" });
    const r = await service.interpret(auth, { text: "Şalt malzemesi üretiyoruz", portal: "satis" });
    expect(r.portal).toBe("satis");
    expect(r.draft).toBeNull();
    expect(r.category?.id).toBe("39121600");
    expect(String(callAi.mock.calls[0][1].prompt)).toContain("SATICI");
  });

  it("kısa metin 400; bozuk JSON bir kez premium ile denenir, yine bozuksa 503", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const { service } = rig({ summary: "x" });
    await expect(service.interpret(auth, { text: "ab", portal: "satinalma" })).rejects.toBeInstanceOf(BadRequestException);
    const { service: s2, callAi } = rig("not json", "still not json");
    await expect(s2.interpret(auth, { text: "çelik boru", portal: "satinalma" })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(callAi).toHaveBeenCalledTimes(2);
    expect(callAi.mock.calls[1][1]).toMatchObject({ premiumRetry: true });
  });

  it("sayı ayrıştırma: Türkçe/İngilizce biçimler", () => {
    expect(parseModelNumber("1.500,50", 1e12)).toBe(1500.5);
    expect(parseModelNumber("1500,5", 1e12)).toBe(1500.5);
    expect(parseModelNumber("1500.5", 1e12)).toBe(1500.5);
    expect(parseModelNumber("12 adet", 1e9)).toBe(12);
    expect(parseModelNumber("0", 1e9)).toBeNull();
    expect(parseModelNumber(null, 1e9)).toBeNull();
  });
});
