/**
 * AI ARAMA (search-intent) — doğal dil → süzgeç. Model çağrısı mock, katalog
 * çözümleme ve il kanonikleştirme GERÇEK veritabanında.
 */
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { foldSearchText } from "@rothern/shared";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import type { AiService } from "../../src/modules/ai/ai.service";
import { SearchIntentService, parseModelNumber, sanitizeIntent } from "../../src/modules/ai/search-intent/search-intent.service";
import { lowerCaseWords } from "../../src/modules/ai/ai-text";
import { GeoIndex, geoIndex, setGeoIndex, type GeoCityRow } from "../../src/common/geo/geo-index";
import { runWithLocale } from "../../src/common/i18n/locale-context";
import type { CompanyListingsService } from "../../src/modules/company-listings/services/company-listings.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";
import { resolveCityId } from "../../src/common/geo/geo-index";

/** Test dizini: Türkiye+KKTC yedeği + Münih (dünya listesi yüklenmiş gibi). */
const MUNICH: GeoCityRow = {
  id: 2867714, countryCode: "DE", name: "München", nameTr: "Münih", nameEn: "Munich", nameRu: "Мюнхен",
  slug: "de-munich", lat: 48.137, lng: 11.575, population: 1260391, searchText: foldSearchText("München Munich Мюнхен Münih"),
};
function withWorldIndex() {
  setGeoIndex(null);
  setGeoIndex(new GeoIndex([...geoIndex().rows, MUNICH]));
}

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
      name: `Vitrin ${pseq}`, slug: `vitrin-si-${pseq}`, city: over.city ?? "İzmir", cityId: resolveCityId("TR", over.city ?? "İzmir"), publicEnabled: true,
      ...(over.verified ? { companyVerificationStatus: "VERIFIED" } : {}),
      ...(over.activities ? { activities: over.activities as never } : {}),
    },
  });
  return prisma.companyItem.create({
    data: {
      companyId: company.id, createdById: user.id, name: over.name ?? `Ürün ${pseq}`, unit: "adet",
      slug: `urun-si-${pseq}`, categoryId: over.categoryId, isPublic: true, publishedAt: new Date(),
      images: ["a.webp"], keywords: ["pano"], searchText: foldSearchText(`${over.name ?? "urun"} kompanzasyon panosu pano`),
      // Dizin fiyatı TRY karşılığıyla kıyaslar (`priceAmountBase`) — TRY üründe tutarın kendisi.
      ...(over.priceAmount != null ? { priceMode: "FIXED", priceAmount: over.priceAmount, priceCurrency: "TRY", priceAmountBase: over.priceAmount } : {}),
    },
  });
}

describe("AI arama — search-intent", () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterEach(() => setGeoIndex(null));

  it("ALICI: süzgeç alanları temizlenir, kategori katalogdan çözülür, il kanonik yazıma döner, taslak kurulur", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const other = await makeCompanyWithUser(prisma);
    await prisma.company.update({ where: { id: other.company.id }, data: { city: "İstanbul", cityId: resolveCityId("TR", "İstanbul") } });
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
    expect(r.category).toEqual({ id: "39121500", name: "Kompanzasyon panoları" });
    // Şehir süzgeci değeri dünya şehir listesinin kalıcı adresi; ad ayrı.
    expect(r.city).toBe("istanbul");
    expect(r.cityName).toBe("İstanbul");
    expect(r.country).toBeNull();
    expect(r.summary).toBe("50 adet 400 kVAr kompanzasyon panosu, İstanbul, doğrulanmış üretici");
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

  it("DİL: istem özet için arayüz dilini, içerik alanları için girdinin dilini söyler; yedek özet ve taslak başlığı arayüz dilinde; kategori adı okuyucunun dilinde", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    await makeCategory("39121500", "Kompanzasyon panoları", 3);
    await prisma.category.update({ where: { id: "39121500" }, data: { nameEn: "Capacitor banks", nameRu: "Конденсаторные установки" } });
    const { service, callAi } = rig({ summary: "", query: "capacitor bank", itemName: "Capacitor bank 400 kVAr", categoryHint: "kompanzasyon panoları" });
    const r = await runWithLocale("en", () => service.interpret(auth, { text: "400 kVAr capacitor bank", portal: "satinalma" }));
    const system = String(callAi.mock.calls[0][1].system);
    expect(system).toContain("KULLANICI METNİ DİLİ (summary)");
    expect(system).toContain("ÇIKTI DİLİ (title, itemName, keywords)");
    expect(system).toContain("English (en)");
    // Dil kuralı istemin SONUNDA (en yakın talimat).
    expect(system.trimEnd().endsWith("korunur.")).toBe(true);
    // Eski Türkçe sabit önek yok; yedek özet arayüz dilinde.
    expect(system).not.toContain('"Anladığım: …" ile başlayan');
    expect(r.summary).toBe("Search for “400 kVAr capacitor bank”");
    expect(r.draft?.draft.title).toBe("Purchase of Capacitor bank 400 kVAr");
    // Kategori adı İngilizce (gevşetme notu Türkçe ad basmaz): dizinde ürün
    // yok → kategori gevşetildi, notta okuyucunun dilindeki ad.
    expect(r.relaxed).toContain("category");
    expect(r.relaxedCategoryName).toBe("Capacitor banks");
    expect(r.draft?.draft.suggestedCategoryIds).toEqual(["39121500"]);
  });

  it("ŞEHİR dünya genelinde: model herhangi dilde yazar ('München'), ülke verildiyse o ülkede çözülür → kalıcı adres + okuyucunun dilinde ad + ülke süzgeci", async () => {
    withWorldIndex();
    const { auth } = await makeCompanyWithUser(prisma);
    const seller = await makeCompanyWithUser(prisma);
    await makeCategory("39121500", "Kompanzasyon panoları", 3);
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { name: "Münih GmbH", slug: "munih-gmbh", city: "Munich", country: "DE", cityId: MUNICH.id, publicEnabled: true },
    });
    await prisma.companyItem.create({
      data: {
        companyId: seller.company.id, createdById: seller.user.id, name: "Kondensator", unit: "adet", slug: "kondensator",
        categoryId: "39121503", isPublic: true, publishedAt: new Date(), images: ["a.webp"], keywords: ["pano"],
        searchText: foldSearchText("kondensator pano"),
      },
    });
    const { service } = rig({ summary: "Pano in München", query: "pano", city: "München", country: "de" });
    const r = await runWithLocale("ru", () => service.interpret(auth, { text: "Pano aus München", portal: "satinalma" }));
    expect(r.city).toBe("de-munich");
    expect(r.cityName).toBe("Мюнхен");
    expect(r.country).toBe("DE");
    expect(r.relaxed).toEqual([]);
  });

  it("FİYAT TAVANI modelin para biriminde kurla kıyaslanır; birim verilmezse firma ülkesinin birimi — sonuçtaki currency kıyaslanan birim", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    await makePublicProduct({ categoryId: "39121503", city: "İzmir", priceAmount: 1200 });
    // 100 USD tavan: TRY karşılığı (yedek kur ≫ 12) 1.200 TRY'lik ürünü kapsar → gevşetme yok.
    const { service } = rig({ summary: "pano", query: "pano", priceMax: "100", currency: "usd" });
    const r = await service.interpret(auth, { text: "pano max 100 dollars", portal: "satinalma" });
    expect(r.relaxed).toEqual([]);
    expect(r.priceMax).toBe(100);
    expect(r.currency).toBe("USD");
    // Birimsiz tavan: Türk firmasında TRY → 100 TRY < 1.200 → tavan gevşetilir.
    const { service: s2 } = rig({ summary: "pano", query: "pano", priceMax: "100" });
    const r2 = await s2.interpret(auth, { text: "pano en fazla 100", portal: "satinalma" });
    expect(r2.relaxed).toEqual(["priceMax"]);
    expect(r2.priceMax).toBeNull();
    // Yeni para birimleri de kabul (tek kaynak `CURRENCY_CODES`).
    expect(sanitizeIntent({ summary: "x", currency: "azn" }, "x").currency).toBe("AZN");
  });

  it("ŞEHİR bulunamazsa süzgeç UYGULANMAZ ve 'şehir kaldırıldı' denir; ülke yedek süzgeç olarak kalır, o da boşsa gevşetilir", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    await makeCategory("39121500", "Kompanzasyon panoları", 3);
    await makePublicProduct({ categoryId: "39121503", city: "İzmir" });
    const { service } = rig({ summary: "pano", query: "pano", city: "Atlantis", country: "DE" });
    const r = await service.interpret(auth, { text: "Atlantis'te pano", portal: "satinalma" });
    expect(r.city).toBeNull();
    expect(r.cityName).toBeNull();
    // Ürün Türkiye'de → Almanya süzgeci de 0 → kaldırıldı.
    expect(r.relaxed).toEqual(["city", "country"]);
    expect(r.country).toBeNull();
    // Geçersiz ülke kodu düşer.
    const { service: s2 } = rig({ summary: "pano", query: "pano", country: "XX" });
    expect((await s2.interpret(auth, { text: "pano", portal: "satinalma" })).country).toBeNull();
  });

  it("SATICI: şehir web süzgeciyle AYNI anahtar — alıcının kalıcı şehir adresi ('Мюнхен' → de-munich); ülke ALICI ülkesi süzgeci; eşlenmemiş alıcı şehrinde ham metin", async () => {
    withWorldIndex();
    const { auth } = await makeCompanyWithUser(prisma);
    const rows = [
      { title: "Pano alımı", number: "ROT-5", owner: { name: "Käufer" }, ownerCity: "Munich", ownerCitySlug: "de-munich", ownerCityId: MUNICH.id, ownerCountry: "DE", itemNames: [], categories: [{ code: "39121500", name: "Panolar" }] },
      { title: "Pano alımı 2", number: "ROT-6", owner: { name: "Alıcı" }, ownerCity: "Bursa", ownerCitySlug: "bursa", ownerCountry: "TR", itemNames: [], categories: [{ code: "39121500", name: "Panolar" }] },
      // Eşlenmemiş (serbest metin) alıcı şehri — web süzgeci ham metinle eşler.
      { title: "Pano alımı 3", number: "ROT-7", owner: { name: "Kunde" }, ownerCity: "Kleinstadt", ownerCitySlug: null, ownerCountry: "DE", itemNames: [], categories: [{ code: "39121500", name: "Panolar" }] },
    ];
    const listings = { sellerTenders: jest.fn().mockResolvedValue(rows) };
    const run = async (model: Record<string, unknown>) => {
      const { service } = rig({ summary: "Pano", query: "pano", ...model }, undefined, listings as unknown as Partial<CompanyListingsService>);
      return service.interpret(auth, { text: "pano", portal: "satis" });
    };
    const r = await run({ city: "Мюнхен", country: "DE" });
    expect(r.relaxed).toEqual([]);
    expect(r.city).toBe("de-munich");
    expect(r.cityName).toBe("Münih");
    expect(r.country).toBe("DE");
    // Dünya listesinde olmayan şehir, eşlenmemiş alıcı şehrinde bulunursa ham metinle süzülür.
    const raw = await run({ city: "kleinstadt" });
    expect(raw.relaxed).toEqual([]);
    expect(raw.city).toBe("Kleinstadt");
    expect(raw.cityName).toBe("Kleinstadt");
    // Ülke süzgeci satışta da sayıma girer: Fransız alıcı yok → ülke gevşetilir.
    const fr = await run({ country: "FR" });
    expect(fr.relaxed).toEqual(["country"]);
    expect(fr.country).toBeNull();
  });

  it("sanitize: anahtar kelime küçük harfi DİLE DUYARLI ('IP65' → 'ip65', 'IŞIK' → 'ışık'); birim kanonik Türkçe ada iner; eski 'Anladığım:' öneki atılır", () => {
    const s = sanitizeIntent(
      { summary: "Anladığım: LED armatür", keywords: ["IP65", "IŞIK", "LED Panel"], unit: "PCS" },
      "LED armatür IP65",
    );
    expect(s.keywords).toEqual(["ip65", "ışık", "led panel"]);
    expect(s.summary).toBe("LED armatür");
    expect(s.unit).toBe("adet");
    expect(sanitizeIntent({ summary: "x", unit: "KG" }, "x").unit).toBe("kilogram");
    // Tanınmayan birim serbest metin olarak kalır.
    expect(sanitizeIntent({ summary: "x", unit: "Stück" }, "x").unit).toBe("Stück");
    expect(lowerCaseWords("İSTANBUL IP65")).toBe("istanbul ip65");
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
