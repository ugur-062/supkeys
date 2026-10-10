/**
 * ÜRÜN KATALOĞU — nitelik mirası, tamamlanma skoru ve yayın kapısı.
 *
 * Üçü de tek kaynaktan okunuyor; bu spec o kaynakların sözleşmesi:
 *  · nitelik seti kategori ağacında YUKARIDAN miras alınır (158k kategoriye
 *    tek tek satır yazmadan çalışması buna bağlı),
 *  · skor yönlendirir, yayın kapısı engeller — ikisi AYRI,
 *  · dürüst fiyat seçeneği (ON_REQUEST) puanla CEZALANDIRILMAZ.
 */
import { BadRequestException, ConflictException } from "@nestjs/common";
import { CompanyItemsService } from "../../src/modules/company-items/company-items.service";
import {
  productCompletion,
  productPublishBlockers,
  type ProductLike,
} from "../../src/common/company/product-completion";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";
import { resetFxRates, setFxRates } from "../../src/common/currency/fx-rates";

const audit = { log: jest.fn() };
const service = () =>
  new CompanyItemsService(
    prisma as unknown as PrismaService,
    audit as never,
    {} as never, // storage — bu spec görsel yoluna girmiyor
  );

const SEG = "39000000";
const FAM = "39120000";
const LEAF = "39122215";

async function seedTree() {
  const mk = (id: string, nameTr: string, level: number, parentId?: string) =>
    prisma.category.create({
      data: {
        id, code: id, nameTr, keywords: "", searchText: nameTr.toLowerCase(),
        level, parentId: parentId ?? null, isActive: true, sortOrder: 0,
        inDiscovery: true,
      },
    });
  await mk(SEG, "Elektrik", 1);
  await mk(FAM, "Elektrik ekipmanları", 2, SEG);
  await mk("39122200", "Panolar", 3, FAM);
  await mk(LEAF, "Dağıtım panosu", 4, "39122200");

  await prisma.categoryAttribute.createMany({
    data: [
      { categoryId: SEG, groupKey: "gerilim", nameTr: "Gerilim", type: "SINGLE_SELECT", options: ["AG", "OG"], isRequired: true, sortOrder: 0 },
      { categoryId: SEG, groupKey: "ip", nameTr: "IP sınıfı", type: "SINGLE_SELECT", options: ["IP20", "IP65"], sortOrder: 1 },
      { categoryId: FAM, groupKey: "dolap", nameTr: "Dolap türü", type: "SINGLE_SELECT", options: ["Kontrol", "Dağıtım"], sortOrder: 2 },
      // AYNI anahtar daha SPESİFİK düğümde — üstteki EZİLMELİ.
      { categoryId: FAM, groupKey: "ip", nameTr: "IP sınıfı (pano)", type: "SINGLE_SELECT", options: ["IP54", "IP65", "IP66"], sortOrder: 1 },
    ],
  });
}

async function makeProduct(companyId: string, createdById: string, over: Record<string, unknown> = {}) {
  return prisma.companyItem.create({
    data: {
      companyId, createdById, name: "Dağıtım panosu 400A", unit: "adet",
      categoryId: LEAF, ...over,
    },
  });
}

describe("nitelik mirası", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedTree();
  });

  it("yaprak, ata zincirindeki TÜM nitelikleri devralır", async () => {
    const defs = await service().resolveAttributes(LEAF);
    expect(defs.map((d) => d.key).sort()).toEqual(["dolap", "gerilim", "ip"]);
  });

  it("daha SPESİFİK düğüm aynı anahtarı EZER", async () => {
    const defs = await service().resolveAttributes(LEAF);
    const ip = defs.find((d) => d.key === "ip");
    // Segmentteki iki seçenekli tanım değil, ailedeki üç seçenekli olan.
    expect(ip?.nameTr).toBe("IP sınıfı (pano)");
    expect(ip?.options).toEqual(["IP54", "IP65", "IP66"]);
    expect(ip?.definedAt).toBe(FAM);
  });

  it("üst düğümde daha az nitelik görünür (miras aşağı akar, yukarı değil)", async () => {
    expect((await service().resolveAttributes(SEG)).map((d) => d.key).sort())
      .toEqual(["gerilim", "ip"]);
  });

  it("kategorisi olmayan/tanınmayan kodda boş döner — form yine çalışır", async () => {
    expect(await service().resolveAttributes(null)).toEqual([]);
    expect(await service().resolveAttributes("bozuk")).toEqual([]);
    // Katalogda HİÇ olmayan kod (77000000 gerçek bir segmentti ve 2026-10-09'da
    // gizlendi: "tanınmayan kod" örneği gizli bir segmentin koduna dayanmasın).
    expect(await service().resolveAttributes("99990000")).toEqual([]);
  });
});

describe("tamamlanma skoru", () => {
  const base: ProductLike = {
    name: "Dağıtım panosu 400A", categoryId: LEAF,
    description: "x".repeat(120), images: ["a.webp"], keywords: ["pano"],
    priceMode: "ON_REQUEST", priceAmount: null, priceTiers: null,
    moq: 1, attributes: { gerilim: "AG" },
  };

  it("eksiksiz üründe 100", () => {
    expect(productCompletion(base, { requiredAttributeKeys: ["gerilim"] }).score).toBe(100);
  });

  it("DÜRÜST fiyat seçeneği cezalandırılmaz — üç mod da tam puan", () => {
    // Kritik: ON_REQUEST'i puanla cezalandırmak kullanıcıyı sahte fiyat
    // girmeye iterdi (Europages'in "gönderen 1,00 €" sorunu).
    const onReq = productCompletion({ ...base, priceMode: "ON_REQUEST" }).score;
    const fixed = productCompletion({ ...base, priceMode: "FIXED", priceAmount: 450 }).score;
    const tiered = productCompletion({
      ...base, priceMode: "TIERED", priceTiers: [{ minQty: 1, unitPrice: 480 }],
    }).score;
    expect(onReq).toBe(fixed);
    expect(fixed).toBe(tiered);
  });

  it("modun kendi alanı eksikse puan DÜŞER", () => {
    const r = productCompletion({ ...base, priceMode: "FIXED", priceAmount: null });
    expect(r.score).toBeLessThan(100);
    expect(r.missing.map((m) => m.key)).toContain("price");
  });

  it("zorunlu nitelik TANIMSIZSA tam puan — matris eksikliği kullanıcıyı cezalandırmaz", () => {
    const r = productCompletion({ ...base, attributes: null }, { requiredAttributeKeys: [] });
    expect(r.score).toBe(100);
  });

  it("zorunlu nitelik tanımlı ama boşsa puan düşer", () => {
    const r = productCompletion({ ...base, attributes: {} }, { requiredAttributeKeys: ["gerilim"] });
    expect(r.missing.map((m) => m.key)).toContain("attributes");
  });

  it("eksikler puanıyla birlikte listelenir", () => {
    const r = productCompletion({ ...base, images: [], description: "kısa" });
    expect(r.missing.map((m) => m.key).sort()).toEqual(["description", "images"]);
    expect(r.score).toBe(60);
  });
});

describe("yayın kapısı — skordan AYRI", () => {
  const ok: ProductLike = {
    name: "Dağıtım panosu", categoryId: LEAF, description: "x".repeat(100),
    images: ["a.webp"], keywords: ["pano"], priceMode: "ON_REQUEST",
    priceAmount: null, priceTiers: null, moq: null, attributes: null,
  };

  it("asgari eşiği geçen ürün yayımlanabilir (fiyat/nitelik/MOQ olmasa bile)", () => {
    expect(productPublishBlockers(ok)).toEqual([]);
    // Ama skoru 100 DEĞİL — kapı ile skor farklı şeyler.
    expect(productCompletion(ok).score).toBeLessThan(100);
  });

  it("ince içerik üretecek eksikler engeller", () => {
    expect(productPublishBlockers({ ...ok, images: [] })).toHaveLength(1);
    expect(productPublishBlockers({ ...ok, description: "kısa" })[0]).toContain("Açıklama");
    expect(productPublishBlockers({ ...ok, keywords: [] })[0]).toContain("anahtar kelime");
    expect(productPublishBlockers({ ...ok, categoryId: null })[0]).toContain("Kategori");
  });
});

describe("yayımlama akışı", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedTree();
    audit.log.mockReset();
  });

  it("eksik üründe 400 ve gerekçe döner", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const item = await makeProduct(company.id, user.id);
    await expect(service().publish(auth, item.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("tam üründe yayımlar ve slug üretir", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const item = await makeProduct(company.id, user.id, {
      description: "x".repeat(120), images: ["a.webp"], keywords: ["pano"],
    });
    const r = await service().publish(auth, item.id);
    // Moderasyon (2026-09-09): publish = ONAYA GÖNDER; vitrine yalnız admin çıkarır.
    expect(r.isPublic).toBe(false);
    expect(r.reviewStatus).toBe("PENDING");
    expect(r.submittedAt).not.toBeNull();
    expect(r.slug).toBe("dagitim-panosu-400a");
  });

  it("ad değişse bile SLUG KORUNUR — yayımlanmış URL kırılmaz", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const item = await makeProduct(company.id, user.id, {
      description: "x".repeat(120), images: ["a.webp"], keywords: ["pano"],
    });
    await service().publish(auth, item.id);
    await prisma.companyItem.update({
      where: { id: item.id }, data: { name: "Bambaşka bir ad" },
    });
    await service().unpublish(auth, item.id);
    const again = await service().publish(auth, item.id);
    expect(again.slug).toBe("dagitim-panosu-400a");
  });

  it("aynı adlı ikinci ürün çakışmaz (-2 eki)", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const full = { description: "x".repeat(120), images: ["a.webp"], keywords: ["pano"] };
    const a = await makeProduct(company.id, user.id, full);
    const b = await makeProduct(company.id, user.id, { ...full, code: "K2" });
    await service().publish(auth, a.id);
    expect((await service().publish(auth, b.id)).slug).toBe("dagitim-panosu-400a-2");
  });

  it("vitrinden çekmek kaydı SİLMEZ, slug'ı korur", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const item = await makeProduct(company.id, user.id, {
      description: "x".repeat(120), images: ["a.webp"], keywords: ["pano"],
    });
    await service().publish(auth, item.id);
    const off = await service().unpublish(auth, item.id);
    expect(off.isPublic).toBe(false);
    expect(off.slug).toBe("dagitim-panosu-400a");
  });

  it("TANIMSIZ nitelik anahtarı sessizce DÜŞER — istemci veriyi kirletemez", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const item = await makeProduct(company.id, user.id);
    const r = await service().updateShowcase(auth, item.id, {
      attributes: { gerilim: "AG", uydurma_alan: "değer" },
    });
    expect(r.attributes).toEqual({ gerilim: "AG" });
  });

  // Yayın denetimi 2026-09-28 Bölüm 5: DTO alanı `@IsObject` olduğu için değer
  // doğrulanmıyordu; MB'lık tek değer içerik çevirisinin Pro istemine giriyordu.
  it("nitelik DEĞERİ sınırlı: dev metin, uzun liste ve nesne 400; metin/liste/sayı geçer", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const item = await makeProduct(company.id, user.id);
    for (const bad of ["x".repeat(201), Array.from({ length: 51 }, () => "AG"), { nested: "AG" }, ["AG", { x: 1 }]]) {
      await expect(service().updateShowcase(auth, item.id, { attributes: { gerilim: bad } })).rejects.toThrow(/Nitelik değeri geçersiz/);
    }
    const ok = await service().updateShowcase(auth, item.id, { attributes: { gerilim: "AG", ip: ["IP54", "IP65"], dolap: 3 } });
    expect(ok.attributes).toEqual({ gerilim: "AG", ip: ["IP54", "IP65"], dolap: 3 });
  });

  it("başka firmanın ürününe dokunamaz", async () => {
    const a = await makeCompanyWithUser(prisma);
    const b = await makeCompanyWithUser(prisma);
    const item = await makeProduct(a.company.id, a.user.id);
    await expect(service().publish(b.auth, item.id)).rejects.toBeDefined();
  });

  /* İNCELEME KİLİDİ (2026-09-10, kullanıcı kararı): onaya gönderilen ürün
     admin karar verene dek değiştirilemez — firma yalnız önizler. */
  it("İNCELEME KİLİDİ: PENDING üründe vitrin/kalem güncelleme ve yeniden gönderme 409; okuma serbest", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const item = await makeProduct(company.id, user.id, {
      description: "x".repeat(120), images: ["a.webp"], keywords: ["pano"],
      brand: "Schneider", mpn: "NSX400F", specification: "IEC 61439-2",
    });
    const sent = await service().publish(auth, item.id);
    expect(sent.reviewStatus).toBe("PENDING");
    expect(sent.isPublic).toBe(false); // yalnız admin onayı vitrine çıkarır

    await expect(service().updateShowcase(auth, item.id, { description: "y".repeat(120) })).rejects.toBeInstanceOf(ConflictException);
    await expect(service().update(auth, item.id, { name: "Başka ad" })).rejects.toBeInstanceOf(ConflictException);
    await expect(service().publish(auth, item.id)).rejects.toBeInstanceOf(ConflictException);
    // Boş yama da kilide takılır — "değişiklik yok" istisnası YOK.
    await expect(service().updateShowcase(auth, item.id, {})).rejects.toBeInstanceOf(ConflictException);

    const preview = await service().getShowcase(auth, item.id);
    expect(preview.id).toBe(item.id);
    expect(preview.reviewStatus).toBe("PENDING");
    // Kimlik alanları vitrin yanıtında: `?urun=` derin bağlantısıyla açılan
    // önizleme bunları buradan çizer (arayüz testi webC-16, gözden geçirme).
    expect(preview).toMatchObject({ brand: "Schneider", mpn: "NSX400F", specification: "IEC 61439-2" });
    const row = await prisma.companyItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(row.description).toBe("x".repeat(120));
    expect(row.name).toBe("Dağıtım panosu 400A");
  });

  it("kilit admin kararıyla açılır: düzeltmeye gönderilen (REJECTED) ürün düzenlenir ve yeniden gönderilir", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const item = await makeProduct(company.id, user.id, {
      description: "x".repeat(120), images: ["a.webp"], keywords: ["pano"],
    });
    await service().publish(auth, item.id);
    // Admin kararı (AdminProductsService.reject ile aynı yazım)
    await prisma.companyItem.update({
      where: { id: item.id },
      data: { reviewStatus: "REJECTED", isPublic: false, rejectReason: "Görseller ürüne ait değil", reviewedAt: new Date() },
    });
    // Vitrin yaması TAM gövdedir (görsel/etiket listesi yerine yazılır) — form her kaydetmede hepsini yollar.
    const fixed = await service().updateShowcase(auth, item.id, { images: ["b.webp"], keywords: ["pano"], description: "x".repeat(120) });
    expect(fixed.images).toEqual(["b.webp"]);
    const again = await service().publish(auth, item.id);
    expect(again.reviewStatus).toBe("PENDING");
    expect(again.rejectReason).toBeNull();
  });

  it("yayındaki ürün yeniden incelemedeyken de kilitli; vitrinden çekmek SERBEST (içerik değişikliği değil)", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const item = await makeProduct(company.id, user.id, {
      description: "x".repeat(120), images: ["a.webp"], keywords: ["pano"],
      reviewStatus: "APPROVED", isPublic: true, publishedAt: new Date(), slug: "dagitim-panosu-400a",
    });
    const edited = await service().updateShowcase(auth, item.id, { description: "z".repeat(120) });
    expect(edited.reviewStatus).toBe("PENDING");
    expect(edited.isPublic).toBe(true);
    await expect(service().updateShowcase(auth, item.id, { description: "w".repeat(120) })).rejects.toBeInstanceOf(ConflictException);
    const off = await service().unpublish(auth, item.id);
    expect(off.isPublic).toBe(false);
    expect(off.reviewStatus).toBe("DRAFT");
  });

  /* Arayüz testi O-009: yayın kapısı yalnız `publish`te değil, yayındaki ürünün
     her kaydında — eksik içerikle incelemeye girip vitrinde kalamaz. */
  describe("yayın kapısı — yayındaki ürünün kaydı (O-009)", () => {
    const live = (companyId: string, userId: string, over: Record<string, unknown> = {}) =>
      makeProduct(companyId, userId, {
        description: "x".repeat(120), images: ["a.webp"], keywords: ["pano"],
        reviewStatus: "APPROVED", isPublic: true, publishedAt: new Date(), slug: "dagitim-panosu-400a",
        ...over,
      });

    it("anahtar kelimeleri silinip açıklaması kısaltılan yayındaki ürün 400 alır; kayıt değişmez, incelemeye girmez", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const item = await live(company.id, user.id);
      const err = await service()
        .updateShowcase(auth, item.id, { description: "Kısa.", keywords: [], images: ["a.webp"] })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(String((err as BadRequestException).message)).toMatch(/Açıklama.*anahtar kelime/);
      const row = await prisma.companyItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.reviewStatus).toBe("APPROVED");
      expect(row.keywords).toEqual(["pano"]);
      expect(row.description).toBe("x".repeat(120));
    });

    it("görselleri silmek de engellenir; eksiksiz içerik değişikliği incelemeye girer", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const item = await live(company.id, user.id);
      await expect(
        service().updateShowcase(auth, item.id, { description: "x".repeat(120), keywords: ["pano"], images: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      const ok = await service().updateShowcase(auth, item.id, {
        description: "z".repeat(120), keywords: ["pano"], images: ["a.webp"],
      });
      expect(ok.reviewStatus).toBe("PENDING");
    });

    it("yalnız MOQ değişen yayındaki ürün onaylı kalır (içerik değil)", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const item = await live(company.id, user.id);
      const r = await service().updateShowcase(auth, item.id, {
        description: "x".repeat(120), keywords: ["pano"], images: ["a.webp"], moq: 25,
      });
      expect(r.reviewStatus).toBe("APPROVED");
      expect(r.moq).toBe("25");
    });

    it("kapı kuralları sıkılaşmadan önce yayına çıkmış eksik ürün içerik DIŞI alanını güncelleyebilir", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const item = await live(company.id, user.id, { description: "eski kısa açıklama" });
      const r = await service().updateShowcase(auth, item.id, {
        description: "eski kısa açıklama", keywords: ["pano"], images: ["a.webp"], moq: 10,
      });
      expect(r.reviewStatus).toBe("APPROVED");
    });

    it("TASLAK serbest: eksik içerikli taslak kaydedilir; vitrinden çekilmiş onaylı ürün (taslak) incelemeye düşmez", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const draft = await makeProduct(company.id, user.id);
      const d = await service().updateShowcase(auth, draft.id, { description: "Kısa.", keywords: [] });
      expect(d.reviewStatus).toBe("DRAFT");
      const downgraded = await live(company.id, user.id, { isPublic: false, slug: "pano-2", name: "Pano 2" });
      const r = await service().updateShowcase(auth, downgraded.id, { description: "Kısa.", keywords: [] });
      expect(r.reviewStatus).toBe("APPROVED");
      expect(r.isPublic).toBe(false);
    });
  });

  /* Derin denetim Y-07 (2026-09-29): katalog kalemi ucu (`PATCH company/items/:id`)
     vitrin yolunun moderasyon kuralını ATLATMAMALI. */
  describe("katalog kalemi yaması (update) — yayındaki üründe moderasyon", () => {
    const translations = { enqueue: jest.fn() };
    const seo = { productChanged: jest.fn() };
    const svcWithHooks = () =>
      new CompanyItemsService(
        prisma as unknown as PrismaService,
        audit as never,
        {} as never,
        undefined,
        seo as never,
        undefined,
        translations as never,
      );
    const approved = (companyId: string, userId: string) =>
      makeProduct(companyId, userId, {
        description: "x".repeat(120), images: ["a.webp"], keywords: ["pano"],
        reviewStatus: "APPROVED", isPublic: true, publishedAt: new Date(), slug: "dagitim-panosu-400a",
        searchText: "dagitim panosu 400a pano",
      });

    beforeEach(() => {
      translations.enqueue.mockClear();
      seo.productChanged.mockClear();
    });

    it("APPROVED üründe ad/açıklama değişince PENDING'e düşer, vitrinde kalır; arama metni ve çeviri yenilenir", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const item = await approved(company.id, user.id);
      const r = await svcWithHooks().update(auth, item.id, {
        name: "Yeni pano adı", unit: "adet", description: `WhatsApp +90 555 000 00 00 ${"y".repeat(100)}`,
      });
      expect(r.reviewStatus).toBe("PENDING");
      expect(r.isPublic).toBe(true);
      const row = await prisma.companyItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.reviewStatus).toBe("PENDING");
      expect(row.submittedAt).not.toBeNull();
      expect(row.rejectReason).toBeNull();
      expect(row.searchText).toContain("yeni pano");
      expect(row.searchText).toContain("pano");
      expect(translations.enqueue).toHaveBeenCalledWith("PRODUCT", item.id);
      expect(seo.productChanged).toHaveBeenCalledWith(item.id);
      // İnceleme kilidi artık bu uçta da devrede.
      await expect(svcWithHooks().update(auth, item.id, { name: "Bir daha", unit: "adet" })).rejects.toBeInstanceOf(ConflictException);
    });

    it("şartname/marka/MPN de herkese açık içerik sayılır → PENDING", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const item = await approved(company.id, user.id);
      const r = await svcWithHooks().update(auth, item.id, { name: "Dağıtım panosu 400A", unit: "adet", specification: "spam metni" });
      expect(r.reviewStatus).toBe("PENDING");
      const item2 = await makeProduct(company.id, user.id, {
        name: "Başka pano", reviewStatus: "APPROVED", isPublic: true, slug: "baska-pano",
        description: "x".repeat(120), images: ["a.webp"], keywords: ["pano"],
      });
      const r2 = await svcWithHooks().update(auth, item2.id, { name: "Başka pano", unit: "adet", brand: "Marka X" });
      expect(r2.reviewStatus).toBe("PENDING");
      const row2 = await prisma.companyItem.findUniqueOrThrow({ where: { id: item2.id } });
      expect(row2.searchText).toContain("marka x");
    });

    it("içerik dışı alan (stok kodu/birim/hedef fiyat) ya da değişmeyen kayıt APPROVED kalır", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const item = await approved(company.id, user.id);
      const r = await svcWithHooks().update(auth, item.id, {
        name: "  Dağıtım panosu 400A ", unit: "kg", code: "PNO-400", targetPrice: 1200,
      });
      expect(r.reviewStatus).toBe("APPROVED");
      expect(r.isPublic).toBe(true);
      expect(r.code).toBe("PNO-400");
    });

    it("YAYIN KAPISI (arayüz testi O-009): yayındaki ürün eksik açıklamayla kaydedilemez; kayıt değişmez", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const item = await approved(company.id, user.id);
      await expect(
        svcWithHooks().update(auth, item.id, { name: "Dağıtım panosu 400A", unit: "adet", description: "Kısa." }),
      ).rejects.toBeInstanceOf(BadRequestException);
      const row = await prisma.companyItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.reviewStatus).toBe("APPROVED");
      expect(row.description).toBe("x".repeat(120));
    });

    it("taslak (DRAFT) üründe düzenleme serbest, incelemeye düşmez ve çevrilmez", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const item = await makeProduct(company.id, user.id);
      const r = await svcWithHooks().update(auth, item.id, { name: "Taslak yeni ad", unit: "adet" });
      expect(r.reviewStatus).toBe("DRAFT");
      expect(r.name).toBe("Taslak yeni ad");
      expect(translations.enqueue).not.toHaveBeenCalled();
    });
  });
});

describe("ürün oluşturma — TEK ÇAĞRI (ilan sihirbazı değil)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("createProduct kaydı ve vitrin alanlarını birlikte yazar", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const p = await service().createProduct(auth, {
      name: "Dağıtım panosu 400A",
      unit: "adet",
      description: "x".repeat(120),
      keywords: ["pano", "ip54"],
      priceMode: "FIXED",
      priceAmount: 4500,
    });
    expect(p.name).toBe("Dağıtım panosu 400A");
    expect(p.description).toHaveLength(120);
    expect(p.keywords).toEqual(["pano", "ip54"]);
    expect(p.priceMode).toBe("FIXED");
    // TASLAK doğar — yayımlamak ayrı adım.
    expect(p.isPublic).toBe(false);
  });

  it("para birimi verilmezse FİRMANIN ülkesinden doğar; TRY karşılığı yazımda hesaplanır (2026-09-27)", async () => {
    setFxRates({ EUR: 50 });
    try {
      const { auth } = await makeCompanyWithUser(prisma, { country: "DE" });
      const p = await service().createProduct(auth, { name: "Schaltschrank", unit: "adet", priceMode: "FIXED", priceAmount: 450 });
      expect(p.priceCurrency).toBe("EUR");
      const row = await prisma.companyItem.findUniqueOrThrow({ where: { id: p.id }, select: { priceAmountBase: true } });
      expect(Number(row.priceAmountBase)).toBe(22_500);
      // Teklifle fiyata geçince taban düşer (süzgeçte "fiyatsız").
      await service().updateShowcase(auth, p.id, { priceMode: "ON_REQUEST" });
      const after = await prisma.companyItem.findUniqueOrThrow({ where: { id: p.id }, select: { priceAmountBase: true } });
      expect(after.priceAmountBase).toBeNull();
    } finally {
      resetFxRates();
    }
  });

  it("adsız ürün açılamaz", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    await expect(
      service().createProduct(auth, { name: "   ", unit: "adet" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("AD ve AÇIKLAMA vitrin yolundan güncellenir, arama metni yenilenir", async () => {
    // Eski hâlde bu iki alan vitrin formunda YOKTU: kullanıcı ≥100 karakter
    // açıklama isteyen yayın kapısını geçemiyordu.
    const { auth } = await makeCompanyWithUser(prisma);
    const p = await service().createProduct(auth, { name: "Eski ad", unit: "adet" });
    const updated = await service().updateShowcase(auth, p.id, {
      name: "Paslanmaz çelik boru",
      description: "y".repeat(150),
      keywords: ["boru"],
    });
    expect(updated.name).toBe("Paslanmaz çelik boru");
    expect(updated.description).toHaveLength(150);
    const row = await prisma.companyItem.findUniqueOrThrow({ where: { id: p.id } });
    // Ad değişti → arama metni de yenilenmeli, yoksa ürün eski adıyla aranır.
    expect(row.searchText).toContain("paslanmaz");
    expect(row.searchText).toContain("boru");
  });
});

/**
 * Yayın denetimi 2026-09-28 Bölüm 6 (yerel uçtan uca koşuda yakalandı): Ürünlerim
 * ilk 50 satırı KULLANIM sıklığıyla alıp sekmeleri istemcide süzüyordu → 50'den
 * fazla ürünü olan firmada "Onay bekliyor (1)" boş, az önce eklenen ürün görünmez.
 * Sekme ve "en yeni üstte" sunucuda.
 */
describe("Ürünlerim listesi — sunucu süzgeci ve en yeni üstte", () => {
  it("55 ürünlü firmada: sekme süzgeci sunucuda, recent sıralamada en yeni ilk, publishedInReview sayılır", async () => {
    const { company, user } = await makeCompanyWithUser(prisma);
    const base = Date.now() - 60 * 86_400_000;
    for (let i = 0; i < 52; i++) {
      await makeProduct(company.id, user.id, { name: `Eski ${String(i).padStart(2, "0")}`, usageCount: 5, createdAt: new Date(base + i * 1000) });
    }
    await makeProduct(company.id, user.id, { name: "Yayında incelemede", isPublic: true, reviewStatus: "PENDING", createdAt: new Date(base + 60_000) });
    await makeProduct(company.id, user.id, { name: "Düzeltme istendi", reviewStatus: "REJECTED", createdAt: new Date(base + 61_000) });
    const newest = await makeProduct(company.id, user.id, { name: "Çelik boru yeni", reviewStatus: "PENDING", isPublic: false });

    const pending = await service().list(company.id, { status: "pending", sort: "recent" });
    expect(pending.items.map((i) => i.name)).toEqual(["Çelik boru yeni"]);

    const published = await service().list(company.id, { status: "published", sort: "recent" });
    expect(published.items.map((i) => i.name)).toEqual(["Yayında incelemede"]);

    const rejected = await service().list(company.id, { status: "rejected" });
    expect(rejected.items.map((i) => i.name)).toEqual(["Düzeltme istendi"]);

    const recent = await service().list(company.id, { sort: "recent" });
    expect(recent.items[0]!.id).toBe(newest.id);
    expect(recent.total).toBe(55);
    expect(recent.truncated).toBe(true);
    expect(recent.counts).toMatchObject({ published: 1, pending: 2, rejected: 1, publishedInReview: 1 });

    // Katalog seçicisi (varsayılan) kullanım sıklığıyla kalır: yeni ürün ilk sayfada değil.
    const usage = await service().list(company.id, {});
    expect(usage.items.some((i) => i.id === newest.id)).toBe(false);
  });
});

/**
 * Canlı doğrulama 2026-10-10, NEW-PF-3 — ürünü AÇMAK (Ürünlerim'de vitrin
 * okuması) satırı değiştiriyordu: serileştirici tamamlanma skorunu her çağrıda
 * koşulsuz ve Prisma ile yazıyor, `@updatedAt` ilerliyordu (skor 90 → 90,
 * updatedAt 19:16 → 19:37; yayındaki üründe de). `updatedAt` ürün
 * sitemap'inin lastmod'u ve çeviri kapsam denetiminin ölçüsüdür. Skor
 * türetilmiş kolondur: yalnız saklanan değer farklıysa ve `updatedAt`e
 * dokunmayan ham SQL ile yazılır.
 */
describe("vitrin okuması satırı değiştirmez (türetilmiş skor kolonu)", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedTree();
    audit.log.mockReset();
  });

  const OLD = new Date("2026-09-01T08:00:00.000Z");
  /** Satırın sürümü (`xmin` her yazmada değişir) + okunan kolonlar. */
  const rowState = async (id: string) => {
    const [row] = await prisma.$queryRaw<Array<{ version: string; completionScore: number; updatedAt: Date }>>`
      SELECT xmin::text AS version, "completionScore", "updatedAt" FROM "company_items" WHERE "id" = ${id}`;
    return row!;
  };
  /** Skor yazımı yanıtı bekletmez (ateşle-unut): tek bağlantılı test istemcisinde sıradaki okuma yazmadan sonra koşar. */
  const settleWrites = async () => {
    await new Promise((res) => setTimeout(res, 150));
    await prisma.$queryRaw`SELECT 1`;
  };

  it("saklanan skor güncelse ürünü açmak hiçbir şey yazmaz: satır sürümü ve updatedAt aynı kalır (yayındaki üründe de)", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const item = await makeProduct(company.id, user.id, {
      description: "x".repeat(120),
      images: ["a.webp"],
      keywords: ["pano"],
      isPublic: true,
      reviewStatus: "APPROVED",
      publishedAt: OLD,
      slug: "dagitim-panosu-400a",
    });
    const score = (await service().getShowcase(auth, item.id)).completion.score;
    expect(score).toBeGreaterThan(0);
    // Skor saklandı, satır eski tarihli: bundan sonrası salt okuma.
    await settleWrites();
    await prisma.$executeRaw`UPDATE "company_items" SET "completionScore" = ${score}, "updatedAt" = ${OLD} WHERE "id" = ${item.id}`;
    const before = await rowState(item.id);
    expect(before).toMatchObject({ completionScore: score, updatedAt: OLD });

    for (let i = 0; i < 3; i++) await service().getShowcase(auth, item.id);
    await settleWrites();

    expect(await rowState(item.id)).toEqual(before);
  });

  it("saklanan skor farklıysa yazılır — updatedAt ilerlemeden", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const item = await makeProduct(company.id, user.id, { description: "x".repeat(120), images: ["a.webp"], keywords: ["pano"] });
    await prisma.$executeRaw`UPDATE "company_items" SET "completionScore" = 1, "updatedAt" = ${OLD} WHERE "id" = ${item.id}`;

    const score = (await service().getShowcase(auth, item.id)).completion.score;
    expect(score).not.toBe(1);
    await settleWrites();

    expect(await rowState(item.id)).toMatchObject({ completionScore: score, updatedAt: OLD });
  });
});
