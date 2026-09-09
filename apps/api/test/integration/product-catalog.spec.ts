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
    expect(await service().resolveAttributes("77000000")).toEqual([]);
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
