/**
 * AI ARAMA (search-intent) — doğal dil → süzgeç. Model çağrısı mock, katalog
 * çözümleme ve il kanonikleştirme GERÇEK veritabanında.
 */
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { foldSearchText } from "@rothern/shared";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import type { AiService } from "../../src/modules/ai/ai.service";
import { SearchIntentService, parseModelNumber } from "../../src/modules/ai/search-intent/search-intent.service";
import type { CompanyListingsService } from "../../src/modules/company-listings/services/company-listings.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

function rig(modelJson: unknown | string, second?: unknown | string, listings?: Partial<CompanyListingsService>) {
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
    listings as CompanyListingsService | undefined,
  );
  return { service, callAi, assertAiAccess };
}

async function makeCategory(code: string, nameTr: string, level: number, inDiscovery = true, keywords = "") {
  await prisma.category.create({
    data: {
      id: code, code, nameTr, keywords, searchText: foldSearchText(`${nameTr} ${keywords}`),
      level, parentId: null, isActive: true, sortOrder: 0, inDiscovery,
    },
  });
}

let pseq = 0;
/** Yayında ürün (kapı: firma public + slug; ürün public + görselli). */
async function makePublicProduct(over: {
  categoryId: string; city?: string; verified?: boolean; name?: string; activities?: string[]; priceAmount?: number;
}) {
  pseq += 1;
  const { company, user } = await makeCompanyWithUser(prisma);
  await prisma.company.update({
    where: { id: company.id },
    data: {
      name: `Vitrin ${pseq}`, slug: `vitrin-si-${pseq}`, city: over.city ?? "İzmir", publicEnabled: true,
      ...(over.verified ? { companyVerificationStatus: "VERIFIED" } : {}),
      ...(over.activities ? { activities: over.activities as never } : {}),
    },
  });
  return prisma.companyItem.create({
    data: {
      companyId: company.id, createdById: user.id, name: over.name ?? `Ürün ${pseq}`, unit: "adet",
      slug: `urun-si-${pseq}`, categoryId: over.categoryId, isPublic: true, publishedAt: new Date(),
      images: ["a.webp"], keywords: ["pano"], searchText: foldSearchText(`${over.name ?? "urun"} kompanzasyon panosu pano`),
      ...(over.priceAmount != null ? { priceMode: "FIXED", priceAmount: over.priceAmount } : {}),
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
    // Canlı bulgu: anahtar kelimesi "kompanzasyon panosu" olan bir HİZMET
    // kategorisi ada göre önce gelmemeli (ad önceliği + ek toleransı).
    await makeCategory("72151509", "Enerji yönetim kontrolü montaj hizmeti", 4, true, "kompanzasyon panosu montajı");
    // Tüm süzgeçleri karşılayan ürün: İstanbul, doğrulanmış ÜRETİCİ, 1.200 TL (≤ tavan), MOQ yok.
    await makePublicProduct({
      categoryId: "39121503", city: "İstanbul", verified: true, name: "Kompanzasyon Panosu 400 kVAr",
      activities: ["MANUFACTURER"], priceAmount: 1200,
    });
    const { service, callAi, assertAiAccess } = rig({
      summary: "Anladığım: 50 adet 400 kVAr kompanzasyon panosu, İstanbul, doğrulanmış üretici",
      title: "400 kVAr kompanzasyon panosu alımı",
      query: "kompanzasyon panosu",
      itemName: "Kompanzasyon panosu 400 kVAr",
      categoryHint: "kompanzasyon panosu",
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
    // Ürün var (İstanbul, doğrulanmış, 39121503 ⊂ 39121500) → gevşetme yok.
    expect(r.relaxed).toEqual([]);
    expect(r.relaxedCategoryName).toBeNull();
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

  it("SATICI: taslak yok, portal 'satis'; talep kategorisi discovery kapısına tabi DEĞİL; gevşetme açık taleplerde", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    await makeCategory("39121600", "Şalt malzemeleri", 3, false);
    const rows = [
      { title: "Trafo merkezi tedariki", number: "ROT-1", owner: { name: "Alıcı A" }, ownerCity: "Bursa", itemNames: ["Şalt malzemesi seti"], categories: [{ code: "26101500", name: "Trafolar" }] },
    ];
    const listings = { sellerTenders: jest.fn().mockResolvedValue(rows) };
    const { service, callAi } = rig(
      { summary: "Anladığım: şalt malzemesi satışı", query: "şalt malzemesi", categoryHint: "şalt malzemeleri", city: "İzmir", title: "x", itemName: "y" },
      undefined,
      listings as unknown as Partial<CompanyListingsService>,
    );
    const r = await service.interpret(auth, { text: "Şalt malzemesi üretiyoruz", portal: "satis" });
    expect(r.portal).toBe("satis");
    expect(r.draft).toBeNull();
    expect(String(callAi.mock.calls[0][1].prompt)).toContain("SATICI");
    // Kategori 39 (talep 26'da) ve şehir İzmir (talep Bursa) sonuç vermedi →
    // ikisi de kaldırıldı; arama terimi (çok kelimeli, kalem adında) kaldı.
    expect(r.relaxed).toEqual(["category", "city"]);
    expect(r.relaxedCategoryName).toBe("Şalt malzemeleri");
    expect(r.category).toBeNull();
    expect(r.city).toBeNull();
    expect(r.query).toBe("şalt malzemesi");
    expect(listings.sellerTenders).toHaveBeenCalledWith(auth, "ALIM", { openOnly: true });
  });

  it("SATICI sorgu kısaltma: 'elektrik panosu kompanzasyon' → biri hariç deneme → 'panosu' (ek toleransıyla 'pano alımı'nı bulur)", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const rows = [
      { title: "Trafo merkezi için trafo, kablo ve pano alımı", number: "ROT-2", owner: { name: "Alıcı B" }, ownerCity: "Bursa", itemNames: ["Dağıtım panosu"], categories: [{ code: "39121500", name: "Panolar" }] },
      { title: "Şantiye için inşaat demiri", number: "ROT-3", owner: { name: "Alıcı C" }, ownerCity: "Bursa", itemNames: [], categories: [{ code: "30100000", name: "İnşaat" }] },
    ];
    const listings = { sellerTenders: jest.fn().mockResolvedValue(rows) };
    const { service } = rig(
      { summary: "Anladığım: elektrik panosu satışı", query: "elektrik panosu kompanzasyon" },
      undefined,
      listings as unknown as Partial<CompanyListingsService>,
    );
    const r = await service.interpret(auth, { text: "Elektrik panoları ve kompanzasyon sistemleri üretiyoruz", portal: "satis" });
    expect(r.relaxed).toEqual(["query"]);
    // 3 kelime → 0; "biri hariç": {elektrik panosu}=0, {elektrik kompanzasyon}=0, {panosu kompanzasyon}=0
    // → en iyi eşitlikte sondaki düşer → 2 kelime → yine biri hariç: {panosu}=1 (pano alımı) kazanır.
    expect(r.query).toBe("panosu");
  });

  it("ALICI gevşetme: kategori → … → şehir sırasıyla, ilk sonuçta durur; arama terimi asla kalkmaz", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    await makeCategory("39121500", "Kompanzasyon panoları", 3);
    await makePublicProduct({ categoryId: "39121503", city: "İzmir", verified: false });
    const { service } = rig({
      summary: "Anladığım: pano", query: "pano", categoryHint: "kompanzasyon panoları", city: "İstanbul", verifiedOnly: true,
    });
    const r = await service.interpret(auth, { text: "İstanbul'da doğrulanmış firmadan kompanzasyon panosu", portal: "satinalma" });
    // Ürün: İzmir, doğrulanmamış, kategori uyuyor. Sıra: kategori (0) → doğrulanmış (0) → şehir (1 → dur).
    expect(r.relaxed).toEqual(["category", "verifiedOnly", "city"]);
    expect(r.relaxedCategoryName).toBe("Kompanzasyon panoları");
    expect(r.category).toBeNull();
    expect(r.verifiedOnly).toBe(false);
    expect(r.city).toBeNull();
    expect(r.query).toBe("pano");
    // Taslak gevşetmeden etkilenmez: önerilen kategori taslakta durur.
    expect(r.draft?.draft.suggestedCategoryIds).toEqual(["39121500"]);
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
