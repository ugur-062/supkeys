/**
 * Faz 4 — Kurumsal Kimlik profili: düzenlenebilir kimlik kalemleri (MERSİS/KEP/
 * IBAN) doğrulaması + kaydı.
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { expandCompanyCategorySelection } from "@rothern/shared";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyProfileService } from "../../src/modules/company-profile/company-profile.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

// Standart geçerli TR IBAN örneği (mod-97).
const VALID_IBAN = "TR330006100519786457841326";

function makeService() {
  const storage = {
    generatePresignedPut: jest.fn(),
    generatePresignedGet: jest.fn(),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  return new CompanyProfileService(
    prisma as never,
    storage as never,
    {} as never, // categories — bu spec kategori id'si göndermez
    new AuditService(prisma as never),
  );
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

/**
 * Kimlik/IBAN alanları YALNIZ doğrulama ÖNCESİ değiştirilebilir (2026-07-28
 * kilidi) — bu blok onay öncesi durumu doğrular, o yüzden firmalar UNVERIFIED
 * kurulur. Factory varsayılanı VERIFIED'dır ve kilide takılır.
 */
const makeEditableCompany = (country = "TR") =>
  makeCompanyWithUser(prisma, {
    country,
    companyVerificationStatus: "UNVERIFIED",
  });

describe("company-profile — kurumsal kimlik kalemleri", () => {
  it("geçerli MERSİS/KEP/IBAN kaydedilir (IBAN normalize)", async () => {
    const svc = makeService();
    const owner = await makeEditableCompany();
    await svc.update(owner.company.id, {
      mersisNo: "1234567890123456",
      kepAddress: "firma@hs01.kep.tr",
      iban: "tr33 0006 1005 1978 6457 8413 26",
      ibanHolder: "Örnek A.Ş.",
    } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.mersisNo).toBe("1234567890123456");
    expect(c.kepAddress).toBe("firma@hs01.kep.tr");
    expect(c.iban).toBe(VALID_IBAN); // boşluksuz + büyük harf
    expect(c.ibanHolder).toBe("Örnek A.Ş.");
  });

  it("geçersiz IBAN reddedilir", async () => {
    const svc = makeService();
    const owner = await makeEditableCompany();
    await expect(
      svc.update(owner.company.id, { iban: "TR00 1234" } as never),
    ).rejects.toThrow(/geçerli bir iban/i);
  });

  it("yabancı IBAN gevşek formatla kabul edilir (TR-dışı katı mod-97 yok)", async () => {
    const svc = makeService();
    const owner = await makeEditableCompany("DE");
    await svc.update(owner.company.id, {
      iban: "de89 3704 0044 0532 0130 00",
    } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.iban).toBe("DE89370400440532013000");
  });

  it("geçersiz KEP reddedilir", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      svc.update(owner.company.id, {
        kepAddress: "firma@gmail.com",
      } as never),
    ).rejects.toThrow(/KEP/i);
  });

  it("hassas-olmayan görünümde IBAN maskeli döner (banka listesiyle aynı kural)", async () => {
    const svc = makeService();
    const owner = await makeEditableCompany();
    await svc.update(owner.company.id, {
      iban: VALID_IBAN,
      ibanHolder: "Örnek A.Ş.",
    } as never);

    const pub = await svc.get(owner.company.id, false);
    expect(pub.iban).toBe("TR" + "*".repeat(20) + "1326");
    expect(pub.ibanHolder).toBeNull(); // maskelenmez, tamamen gizli kalır

    const full = await svc.get(owner.company.id, true);
    expect(full.iban).toBe(VALID_IBAN);
  });

  it("PATCH audit izi: changedFields alan ADLARI; IBAN değişimi critical + maskeli", async () => {
    const svc = makeService();
    const owner = await makeEditableCompany();

    await svc.update(
      owner.company.id,
      { website: "https://ornek.com", iban: VALID_IBAN } as never,
      owner.auth,
    );
    const row = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "company.profile.updated",
        entityId: owner.company.id,
      },
    });
    expect(row.actorId).toBe(owner.auth.userId);
    expect(row.tenantId).toBe(owner.company.id);
    const meta = row.metadata as Record<string, unknown>;
    expect(meta.changedFields).toEqual(
      expect.arrayContaining(["website", "iban"]),
    );
    expect(meta.ibanMaskedAfter).toBe("TR" + "*".repeat(20) + "1326");
    // Değerler metadata'ya yazılmaz (alan adları + maskeli IBAN referansı hariç).
    expect(JSON.stringify(meta)).not.toContain(VALID_IBAN);
    expect(JSON.stringify(meta)).not.toContain("ornek.com");

    // IBAN'sız değişiklik → audit var ama critical değil (para-yolu değil).
    await svc.update(
      owner.company.id,
      { aboutText: "Hakkımızda" } as never,
      owner.auth,
    );
    const rows = await prisma.auditLog.findMany({
      where: { action: "company.profile.updated" },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
  });

  it("boş IBAN → temizlenir (null)", async () => {
    const svc = makeService();
    const owner = await makeEditableCompany();
    await svc.update(owner.company.id, { iban: VALID_IBAN } as never);
    await svc.update(owner.company.id, { iban: "" } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.iban).toBeNull();
  });
});

/**
 * KYC kimlik kilidi — doğrulama başladıktan/bittikten sonra MERSİS, ticaret
 * sicil ve IBAN bu uç noktadan DEĞİŞTİRİLEMEZ. Kilit daha önce yalnız
 * arayüzdeydi (Doğrulama ekranı), Ayarlar formu üzerinden baypas ediliyordu.
 */
describe("company-profile — KYC kimlik kilidi", () => {
  it.each(["PENDING", "VERIFIED"] as const)(
    "%s firmada IBAN/MERSİS/sicil değişikliği reddedilir",
    async (status) => {
      const svc = makeService();
      const owner = await makeCompanyWithUser(prisma, {
        country: "TR",
        companyVerificationStatus: status,
      });
      await expect(
        svc.update(owner.company.id, { iban: VALID_IBAN } as never),
      ).rejects.toThrow(BadRequestException);
      await expect(
        svc.update(owner.company.id, {
          mersisNo: "1234567890123456",
        } as never),
      ).rejects.toThrow(BadRequestException);
      await expect(
        svc.update(owner.company.id, { tradeRegistryNo: "999" } as never),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it("REJECTED firmada düzeltme için değişiklik SERBEST", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      companyVerificationStatus: "REJECTED",
    });
    await svc.update(owner.company.id, { iban: VALID_IBAN } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.iban).toBe(VALID_IBAN);
  });

  it.each(["PENDING", "VERIFIED"] as const)(
    "%s firmada YASAL ÜNVAN değiştirilemez",
    async (status) => {
      const svc = makeService();
      const owner = await makeCompanyWithUser(prisma, {
        country: "TR",
        companyVerificationStatus: status,
      });
      await expect(
        svc.update(owner.company.id, {
          legalName: "Bambaşka Ünvan A.Ş.",
        } as never),
      ).rejects.toThrow(/ünvan, kimlik ve IBAN bilgileri değiştirilemez/);
    },
  );

  it.each(["PENDING", "VERIFIED"] as const)(
    "%s firmada FİRMA ADI değiştirilemez (vitrindeki 'Doğrulanmış' rozeti ada kefildir)",
    async (status) => {
      const svc = makeService();
      const owner = await makeCompanyWithUser(prisma, {
        country: "TR",
        companyVerificationStatus: status,
      });
      await expect(
        svc.update(owner.company.id, { name: "Bambaşka Marka" } as never),
      ).rejects.toThrow(/firma adı, ünvan, kimlik ve IBAN bilgileri değiştirilemez/);
    },
  );

  it("REJECTED/UNVERIFIED firmada firma adı SERBEST", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      companyVerificationStatus: "UNVERIFIED",
    });
    await svc.update(owner.company.id, { name: "Yeni Marka" } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.name).toBe("Yeni Marka");
  });

  it("kilitli alan AYNI değerle gönderilirse istek geçer (form her kayıtta gönderiyor)", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      companyVerificationStatus: "VERIFIED",
    });
    const before = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    // Ad/ünvan değişmiyor, şehir değişiyor → kilit tetiklenmemeli.
    await svc.update(owner.company.id, {
      name: before.name,
      legalName: before.legalName ?? undefined,
      city: "Ankara",
    } as never);
    const after = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(after.city).toBe("Ankara");
  });

  it("kilitli firmada kimlik-DIŞI alanlar (hakkında) güncellenebilir", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      companyVerificationStatus: "VERIFIED",
    });
    await svc.update(owner.company.id, { aboutText: "Merhaba" } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.aboutText).toBe("Merhaba");
  });
});

// Fix1/Fix2 — görsel URL host doğrulama + upload boyut. Zengin storage mock:
// assertOwnPublicImageUrl'in GERÇEK mantığı upload-validation.spec'te; burada
// update()'in orkestasyonu (grandfather: yalnız DEĞİŞEN değeri doğrular) + boyut.
function makeServiceEx(overrides: Record<string, unknown> = {}) {
  const storage = {
    generatePresignedPut: jest.fn(),
    generatePresignedGet: jest.fn(),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    buildTenantProfilePrefix: (id: string) => `prod/tenant-profile/${id}/`,
    checkExists: jest.fn().mockResolvedValue({
      exists: true,
      size: 1000,
      contentType: "image/png",
    }),
    getPublicUrl: jest.fn((k: string) => `https://cdn/${k}`),
    resolveImageUrl: jest.fn(),
    // testte "kötü" = tenant-profile içermeyen / evil / data:
    assertOwnPublicImageUrl: jest.fn((v: string) => {
      if (
        v.startsWith("data:") ||
        v.startsWith("https://evil") ||
        !v.includes("tenant-profile/")
      ) {
        throw new BadRequestException("Görsel yalnız kendi profil deponuzdan olabilir");
      }
    }),
    ...overrides,
  };
  return {
    svc: new CompanyProfileService(
      prisma as never,
      storage as never,
      {} as never,
      new AuditService(prisma as never),
    ),
    storage,
  };
}

describe("company-profile — görsel URL host doğrulama (Fix1)", () => {
  it("harici URL PATCH → 400 (assertOwnPublicImageUrl kendi companyId ile çağrılır)", async () => {
    const { svc, storage } = makeServiceEx();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      svc.update(owner.company.id, {
        logoUrl: "https://evil.com/x.jpg",
      } as never),
    ).rejects.toThrow(/kendi profil/);
    expect(storage.assertOwnPublicImageUrl).toHaveBeenCalledWith(
      "https://evil.com/x.jpg",
      owner.company.id,
    );
  });

  it("kendi R2 URL'i geçer + saklanır", async () => {
    const { svc } = makeServiceEx();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const good = "https://cdn/prod/tenant-profile/x/logo.jpg";
    await svc.update(owner.company.id, { logoUrl: good } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.logoUrl).toBe(good);
  });

  it("GRANDFATHER: değişmeyen legacy değer YENİDEN doğrulanmaz (kırılmaz)", async () => {
    const { svc, storage } = makeServiceEx();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    // Yeni kuralı GEÇMEYECEK legacy değer (tenant-profile yok) doğrudan DB'de.
    const legacy = "https://old-host.example/legacy-logo.png";
    await prisma.company.update({
      where: { id: owner.company.id },
      data: { logoUrl: legacy },
    });
    // Aynı değeri tekrar gönder + alakasız alan → doğrulama ATLANIR (400 YOK).
    // (Factory VERIFIED doğurur; firma adı KYC kilidinde → şehir kullanılır.)
    await svc.update(owner.company.id, {
      logoUrl: legacy,
      city: "Yeni Şehir",
    } as never);
    expect(storage.assertOwnPublicImageUrl).not.toHaveBeenCalled();
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.city).toBe("Yeni Şehir");
  });

  it("photos[]: yalnız YENİ eleman doğrulanır (eski korunur)", async () => {
    const { svc, storage } = makeServiceEx();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const old = "https://old/legacy-photo.jpg";
    await prisma.company.update({
      where: { id: owner.company.id },
      data: { photos: [old] },
    });
    const fresh = "https://cdn/prod/tenant-profile/x/photo.jpg";
    await svc.update(owner.company.id, { photos: [old, fresh] } as never);
    expect(storage.assertOwnPublicImageUrl).toHaveBeenCalledTimes(1);
    expect(storage.assertOwnPublicImageUrl).toHaveBeenCalledWith(
      fresh,
      owner.company.id,
    );
  });
});

describe("company-profile — resolveUploadedImage boyut (Fix2)", () => {
  it("10MB aşan → 400 + orphan silinir", async () => {
    const { svc, storage } = makeServiceEx({
      checkExists: jest
        .fn()
        .mockResolvedValue({ exists: true, size: 11 * 1024 * 1024 }),
    });
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const key = `prod/tenant-profile/${owner.company.id}/logo-x.jpg`;
    await expect(
      svc.resolveUploadedImage(owner.company.id, key),
    ).rejects.toThrow(/MB sınırını/);
    expect(storage.deleteObject).toHaveBeenCalledWith("public", key);
  });

  it("≤10MB → URL döner", async () => {
    const { svc } = makeServiceEx({
      checkExists: jest.fn().mockResolvedValue({
        exists: true,
        size: 500,
        contentType: "image/png",
      }),
    });
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const key = `prod/tenant-profile/${owner.company.id}/logo-x.jpg`;
    const res = await svc.resolveUploadedImage(owner.company.id, key);
    expect(res.url).toContain(key);
  });
});

describe("company-profile — görsel anahtarları benzersiz (2026-08-22)", () => {
  it("aynı firma logo için iki upload-url → FARKLI anahtar (object-lock 409 / önbellek sorunu kapanır)", async () => {
    const { svc } = makeServiceEx({
      buildTenantProfileKey: (tenant: string, kind: string, id: string, name: string) =>
        `prod/tenant-profile/${tenant}/${kind}-${id}-${name}`,
      generatePresignedPut: jest.fn().mockResolvedValue("https://r2/put"),
    } as never);
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a = await svc.requestImageUploadUrl(owner.company.id, "logo", "a.png", "image/png");
    const b = await svc.requestImageUploadUrl(owner.company.id, "logo", "a.png", "image/png");
    expect(a.key).not.toBe(b.key);
    for (const k of [a.key, b.key]) {
      expect(k.startsWith(`prod/tenant-profile/${owner.company.id}/logo-`)).toBe(true);
      expect(k).not.toContain(`logo-${owner.company.id}-`);
    }
  });
});

/**
 * FAALİYET TİPİ + ALT KATEGORİ (Faz 4-5, 2026-09-01).
 *
 * Faaliyet tipi: kategori firmanın NE'sini söyler, faaliyet tipi NASIL'ını
 * (üretici mi, bayi mi, fason mu). Europages'in ikinci ekseni; bizde hiç yoktu
 * — `CompanyType` yalnız hukuki biçim.
 *
 * Alt kategori: `buyerSubCategoryIds`/`sellerSubCategoryIds` kolonları ve
 * eşleştirmesi (`deriveCategoryMatchCandidates`) ZATEN vardı; eksik olan tek
 * şey bu alanları KABUL eden bir uçtu — profil DTO'su onları hiç taşımıyordu,
 * dolayısıyla firma ana segmentten daha ince bir şey söyleyemiyordu.
 */
describe("company-profile — faaliyet tipi", () => {
  it("geçerli faaliyet tipleri kaydedilir ve yinelenen ayıklanır", async () => {
    const svc = makeService();
    const owner = await makeEditableCompany();

    await svc.update(owner.company.id, {
      activities: ["MANUFACTURER", "IMPORTER_EXPORTER", "MANUFACTURER"],
    } as never);

    const row = await prisma.company.findUnique({
      where: { id: owner.company.id },
      select: { activities: true },
    });
    expect(row?.activities).toEqual(["MANUFACTURER", "IMPORTER_EXPORTER"]);
  });

  it("boş dizi gönderilebilir (seçimi kaldırma)", async () => {
    const svc = makeService();
    const owner = await makeEditableCompany();

    await svc.update(owner.company.id, {
      activities: ["DISTRIBUTOR"],
    } as never);
    await svc.update(owner.company.id, {
      activities: [],
    } as never);

    const row = await prisma.company.findUnique({
      where: { id: owner.company.id },
      select: { activities: true },
    });
    expect(row?.activities).toEqual([]);
  });
});

describe("company-profile — alt kategoriler", () => {
  /** Segment → Family → Class zinciri; alt kategori seçimi için gerçek satır gerekir. */
  async function seedTree() {
    await prisma.category.create({
      data: {
        id: "31000000",
        code: "31000000",
        nameTr: "İmalat Bileşenleri",
        level: 1,
        isActive: true,
        searchText: "imalat bilesenleri",
      },
    });
    await prisma.category.create({
      data: {
        id: "31170000",
        code: "31170000",
        nameTr: "Rulmanlar",
        level: 2,
        parentId: "31000000",
        isActive: true,
        searchText: "rulmanlar",
      },
    });
    await prisma.category.create({
      data: {
        id: "31171500",
        code: "31171500",
        nameTr: "Bilyalı rulmanlar",
        level: 3,
        parentId: "31170000",
        isActive: true,
        searchText: "bilyali rulmanlar",
      },
    });
  }

  /** Gerçek CategoryService — validateIds seviye kuralını burada sınıyoruz. */
  function makeServiceWithCategories() {
    const storage = {
      generatePresignedPut: jest.fn(),
      generatePresignedGet: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {
      CategoryService,
    } = require("../../src/modules/categories/services/category.service");
    return new CompanyProfileService(
      prisma as never,
      storage as never,
      new CategoryService(prisma as never) as never,
      new AuditService(prisma as never),
    );
  }

  it("family (L2) ve class (L3) alt kategori olarak kabul edilir", async () => {
    await seedTree();
    const svc = makeServiceWithCategories();
    const owner = await makeEditableCompany();

    await svc.update(owner.company.id, {
      sellerSubCategoryIds: ["31170000", "31171500"],
    } as never);

    const row = await prisma.company.findUnique({
      where: { id: owner.company.id },
      select: { sellerSubCategoryIds: true },
    });
    expect(row?.sellerSubCategoryIds).toEqual(["31170000", "31171500"]);
  });

  it("segment (L1) alt kategori OLAMAZ — ana kategoriyle aynı eksene düşer", async () => {
    await seedTree();
    const svc = makeServiceWithCategories();
    const owner = await makeEditableCompany();

    await expect(
      svc.update(owner.company.id, {
        buyerSubCategoryIds: ["31000000"],
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it("ana kategori hâlâ YALNIZ segment kabul eder (eksen ayrımı korunur)", async () => {
    await seedTree();
    const svc = makeServiceWithCategories();
    const owner = await makeEditableCompany();

    await expect(
      svc.update(owner.company.id, {
        buyerCategoryIds: ["31171500"],
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  /** Ek satırlar: yaprak (L4), ikinci görünür segment, gizli segment zinciri. */
  async function seedExtra() {
    const rows: Array<[string, string, number, string | null]> = [
      ["31171501", "Radyal bilyalı rulmanlar", 4, "31171500"],
      ["39000000", "Elektrik", 1, null],
      ["56000000", "Mobilya", 1, null],
      ["56100000", "Konut mobilyaları", 2, "56000000"],
      ["56101500", "Mobilyalar", 3, "56100000"],
      ["44000000", "Ofis ekipmanı", 1, null],
    ];
    for (const [code, nameTr, level, parentId] of rows) {
      await prisma.category.create({
        data: { id: code, code, nameTr, level, parentId, isActive: true },
      });
    }
  }

  const beyan = (companyId: string) =>
    prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: {
        buyerCategoryIds: true,
        buyerSubCategoryIds: true,
        sellerCategoryIds: true,
        sellerSubCategoryIds: true,
      },
    });

  /**
   * code-category-8: ata zinciri ve segment türetimi yalnız tarayıcıdaydı;
   * web dışı istemci zincirsiz yaprak ya da segmenti ana listede olmayan alt
   * kod yazabiliyordu. Sunucu artık aynı dönüşümü uygular.
   */
  describe("beyan depolama biçimine sunucuda getirilir (code-category-8)", () => {
    it("yalnız yaprak gönderilirse ata zinciri ve segment de saklanır", async () => {
      await seedTree();
      await seedExtra();
      const svc = makeServiceWithCategories();
      const owner = await makeEditableCompany();

      await svc.update(owner.company.id, {
        sellerSubCategoryIds: ["31171501"],
      } as never);

      expect(await beyan(owner.company.id)).toEqual({
        buyerCategoryIds: [],
        buyerSubCategoryIds: [],
        sellerCategoryIds: ["31000000"],
        sellerSubCategoryIds: ["31171501", "31170000", "31171500"],
      });
    });

    it("web'in gönderdiği tam beyan AYNEN saklanır; kısmi PATCH öteki alanı yeniden yazmaz", async () => {
      await seedTree();
      await seedExtra();
      const svc = makeServiceWithCategories();
      const owner = await makeEditableCompany();
      // Web: sektör geneli segment (39) + seçimin zinciri.
      const web = expandCompanyCategorySelection(["31171501"], ["39000000"]);

      await svc.update(owner.company.id, {
        sellerCategoryIds: web.mainIds,
        sellerSubCategoryIds: web.subIds,
      } as never);
      const ilk = await beyan(owner.company.id);
      expect(ilk.sellerCategoryIds).toEqual(web.mainIds);
      expect(ilk.sellerSubCategoryIds).toEqual(web.subIds);

      // Form yalnız DEĞİŞEN alanı yollar: ana listenin sırası değişti, alt
      // liste gelmedi → alt liste ve ana listenin gelen sırası korunur.
      const audit = jest.spyOn(AuditService.prototype, "log");
      await svc.update(owner.company.id, {
        sellerCategoryIds: ["31000000", "39000000"],
      } as never);
      const sonra = await beyan(owner.company.id);
      expect(sonra.sellerCategoryIds).toEqual(["31000000", "39000000"]);
      expect(sonra.sellerSubCategoryIds).toEqual(web.subIds);
      expect(audit.mock.calls.at(-1)?.[0].metadata).toEqual({
        changedFields: ["sellerCategoryIds"],
      });
      audit.mockRestore();
    });

    it("yalnız ana liste gelir ve kayıtlı alt kodun segmenti çıkarılmışsa segment geri eklenir", async () => {
      await seedTree();
      await seedExtra();
      const svc = makeServiceWithCategories();
      const owner = await makeEditableCompany();
      await prisma.company.update({
        where: { id: owner.company.id },
        data: {
          sellerCategoryIds: ["31000000", "39000000"],
          sellerSubCategoryIds: ["31170000", "31171500"],
        },
      });

      await svc.update(owner.company.id, {
        sellerCategoryIds: ["39000000"],
      } as never);

      const row = await beyan(owner.company.id);
      expect(row.sellerCategoryIds).toEqual(["39000000", "31000000"]);
      expect(row.sellerSubCategoryIds).toEqual(["31170000", "31171500"]);
    });

    it("ana kategori tavanı türeyen segmentlerle birlikte sayılır", async () => {
      await seedTree();
      const svc = makeServiceWithCategories();
      const owner = await makeEditableCompany();

      await expect(
        svc.update(owner.company.id, {
          sellerCategoryIds: ["11000000", "12000000", "13000000", "14000000", "15000000"],
          sellerSubCategoryIds: ["31171500"],
        } as never),
      ).rejects.toThrow(/1-5/);
      expect((await beyan(owner.company.id)).sellerSubCategoryIds).toEqual([]);
    });

    it("isteğin dokunmadığı eski kayıt yeniden doğrulanmaz — yalnız eklenen kod denetlenir", async () => {
      await seedTree();
      const svc = makeServiceWithCategories();
      const owner = await makeEditableCompany();
      // Katalogda artık olmayan bir segment kayıtlı (eski veri).
      await prisma.company.update({
        where: { id: owner.company.id },
        data: { sellerCategoryIds: ["98000000"] },
      });

      await svc.update(owner.company.id, {
        sellerSubCategoryIds: ["31171500"],
      } as never);

      const row = await beyan(owner.company.id);
      expect(row.sellerCategoryIds).toEqual(["98000000", "31000000"]);
      expect(row.sellerSubCategoryIds).toEqual(["31171500", "31170000"]);
    });
  });

  /**
   * code-category-12 (API): segment gizlenmeden ÖNCE beyan edilmiş kod, form
   * her kayıtta geri gönderdiği için bütün kategori değişikliklerini 404 ile
   * engelliyordu. Kayıtlı kod gizli diye reddedilmez; yeni eklenen reddedilir.
   */
  /**
   * SIFIR KATEGORİ KAPISI (arayüz testi 2026-10 category-11): alış ve satış
   * beyanı birlikte boşalamaz. İleti ekranın sözcükleriyle konuşur — ekran bu
   * seçimlere "sektör" ve "ürün / hizmet" der; eski metindeki "ana kategori"
   * ekranda hiçbir yerde geçmiyordu.
   */
  describe("iki eksen birlikte boşalamaz (category-11)", () => {
    const EMPTY = {
      buyerCategoryIds: [],
      buyerSubCategoryIds: [],
      sellerCategoryIds: [],
      sellerSubCategoryIds: [],
    };

    async function declared() {
      await seedTree();
      await seedExtra();
      const svc = makeServiceWithCategories();
      const owner = await makeEditableCompany();
      await svc.update(owner.company.id, {
        buyerCategoryIds: ["39000000"],
        sellerSubCategoryIds: ["31171501"],
      } as never);
      return { svc, owner };
    }

    it("ikisi birden boşaltılırsa 400; ileti 'sektör / ürün-hizmet' der, 'ana kategori' demez; beyan değişmez", async () => {
      const { svc, owner } = await declared();
      const before = await beyan(owner.company.id);
      expect(before.buyerCategoryIds).toEqual(["39000000"]);
      expect(before.sellerCategoryIds).toEqual(["31000000"]);

      const err = await svc.update(owner.company.id, EMPTY as never).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BadRequestException);
      const message = (err as BadRequestException).message;
      expect(message).toBe(
        "En az bir sektör ya da ürün/hizmet seçili kalmalı — seçimi olmayan firmaya talep bildirimi gönderilemez.",
      );
      expect(message).not.toMatch(/ana kategori/i);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        i18nKey: "api.companyProfile.enAzBirAnaKategoriSecili",
      });
      expect(await beyan(owner.company.id)).toEqual(before);
    });

    it("yalnız ana listeler boş gönderilse de (alt listeler gelmeden) kapı çalışır", async () => {
      const { svc, owner } = await declared();
      const before = await beyan(owner.company.id);
      // Alış ekseninde alt kod yok → ana liste boşalır; satışta kayıtlı alt
      // kodun segmenti geri türetilir → firma kategorisiz kalmaz, kayıt geçer.
      await svc.update(owner.company.id, { buyerCategoryIds: [], sellerCategoryIds: [] } as never);
      const after = await beyan(owner.company.id);
      expect(after.buyerCategoryIds).toEqual([]);
      expect(after.sellerCategoryIds).toEqual(before.sellerCategoryIds);
      // Şimdi satış ekseni de (alt kodlarıyla) boşaltılırsa reddedilir.
      await expect(
        svc.update(owner.company.id, { sellerCategoryIds: [], sellerSubCategoryIds: [] } as never),
      ).rejects.toThrow(/En az bir sektör ya da ürün\/hizmet seçili kalmalı/);
      expect(await beyan(owner.company.id)).toEqual(after);
    });

    it("tek eksen boşaltılabilir: yalnız satan firma alış beyanı bırakmayabilir", async () => {
      const { svc, owner } = await declared();
      await svc.update(owner.company.id, { buyerCategoryIds: [], buyerSubCategoryIds: [] } as never);
      const row = await beyan(owner.company.id);
      expect(row.buyerCategoryIds).toEqual([]);
      expect(row.sellerCategoryIds).toEqual(["31000000"]);
    });

    it("kategoriye dokunmayan istek, kategorisiz duran eski firmada da geçer", async () => {
      const svc = makeServiceWithCategories();
      const owner = await makeEditableCompany();
      expect(await beyan(owner.company.id)).toEqual(EMPTY);
      await svc.update(owner.company.id, { district: "Kadıköy" } as never);
      const row = await prisma.company.findUniqueOrThrow({
        where: { id: owner.company.id },
        select: { district: true },
      });
      expect(row.district).toBe("Kadıköy");
    });
  });

  describe("kayıtlı gizli segment kodu kaydı engellemez (code-category-12)", () => {
    async function hiddenDeclared() {
      await seedTree();
      await seedExtra();
      const owner = await makeEditableCompany();
      await prisma.company.update({
        where: { id: owner.company.id },
        data: {
          sellerCategoryIds: ["56000000"],
          sellerSubCategoryIds: ["56100000", "56101500"],
        },
      });
      return owner;
    }

    it("kayıtlı gizli kodlar aynen gelir, yanına görünür ürün eklenir → kaydedilir", async () => {
      const owner = await hiddenDeclared();
      const svc = makeServiceWithCategories();

      await svc.update(owner.company.id, {
        sellerCategoryIds: ["56000000", "31000000"],
        sellerSubCategoryIds: ["56100000", "56101500", "31170000", "31171500"],
      } as never);

      const row = await beyan(owner.company.id);
      expect(row.sellerCategoryIds).toEqual(["56000000", "31000000"]);
      expect(row.sellerSubCategoryIds).toEqual([
        "56100000",
        "56101500",
        "31170000",
        "31171500",
      ]);
    });

    it("zincirsiz kayıtlı gizli yaprak: koddan türeyen ataları da muaf", async () => {
      const owner = await hiddenDeclared();
      await prisma.company.update({
        where: { id: owner.company.id },
        data: { sellerSubCategoryIds: ["56101500"] },
      });
      const svc = makeServiceWithCategories();

      await svc.update(owner.company.id, {
        sellerSubCategoryIds: ["56101500", "31171500"],
      } as never);

      const row = await beyan(owner.company.id);
      expect(row.sellerCategoryIds).toEqual(["56000000", "31000000"]);
      expect(row.sellerSubCategoryIds).toEqual([
        "56101500",
        "31171500",
        "56100000",
        "31170000",
      ]);
    });

    it("YENİ eklenen gizli kod reddedilir (kayıtlı gizli kodu olan firmada da)", async () => {
      const owner = await hiddenDeclared();
      const svc = makeServiceWithCategories();

      await expect(
        svc.update(owner.company.id, {
          sellerCategoryIds: ["56000000", "44000000"],
        } as never),
      ).rejects.toThrow(NotFoundException);
      expect((await beyan(owner.company.id)).sellerCategoryIds).toEqual(["56000000"]);
    });

    it("beyanında gizli kod OLMAYAN firma gizli segment ekleyemez (kural değişmedi)", async () => {
      await seedTree();
      await seedExtra();
      const svc = makeServiceWithCategories();
      const owner = await makeEditableCompany();

      await expect(
        svc.update(owner.company.id, {
          sellerCategoryIds: ["56000000"],
        } as never),
      ).rejects.toThrow(NotFoundException);
      await expect(
        svc.update(owner.company.id, {
          sellerSubCategoryIds: ["56101500"],
        } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

/**
 * Merkez adresi posta kodu (arayüz testi webC-09 yeniden doğrulama): adres
 * defteriyle aynı kural — TR'de 5 rakam, yabancıda serbest. PATCH eskiden
 * 'ABCDE' kaydediyordu; kural yalnız arayüzdeydi.
 */
describe("company-profile — TR posta kodu 5 rakam", () => {
  it("TR firması: 'ABCDE' / '3400' reddedilir, '34000' kaydedilir, boş serbest", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    for (const bad of ["ABCDE", "3400", "34 000"]) {
      await expect(
        svc.update(owner.company.id, { postalCode: bad } as never),
      ).rejects.toThrow(/5 haneli/);
    }
    await svc.update(owner.company.id, { postalCode: "34000" } as never);
    let c = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(c.postalCode).toBe("34000");
    await svc.update(owner.company.id, { postalCode: "" } as never);
    c = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(c.postalCode).toBeNull();
  });

  it("yabancı firma: harfli posta kodu serbest", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "GB" });
    await svc.update(owner.company.id, { postalCode: "SW1A 1AA" } as never);
    const c = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(c.postalCode).toBe("SW1A 1AA");
  });

  it("kuraldan önce kaydedilmiş hatalı kod aynen gelirse diğer alanların kaydını engellemez", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({ where: { id: owner.company.id }, data: { postalCode: "ABC" } });
    await svc.update(owner.company.id, { postalCode: "ABC", website: "https://ornek.com.tr" } as never);
    const c = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(c.website).toBe("https://ornek.com.tr");
    await expect(
      svc.update(owner.company.id, { postalCode: "ABCD1" } as never),
    ).rejects.toThrow(/5 haneli/);
  });
});

/**
 * Web sitesi (arayüz testi signup-tr-5): kayıtla (onboarding) aynı kural —
 * nokta taşıyan, boşluksuz alan adı; http/https isteğe bağlı. PATCH her metni
 * kaydediyordu ve değer herkese açık profilin JSON-LD `sameAs`ına gidiyordu.
 */
describe("company-profile — web sitesi alan adı olmalı", () => {
  it("alan adı olmayan metin reddedilir; geçerli adres kaydedilir; boş siler", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    for (const bad of ["ornek firma sitesi", "https://ornek firma sitesi", "firma", "info@firma.com"]) {
      await expect(
        svc.update(owner.company.id, { website: bad } as never),
      ).rejects.toMatchObject({
        status: 400,
        response: { i18nKey: "api.companyProfile.gecerliBirWebSitesiGiriniz", code: "WEBSITE_INVALID" },
      });
    }
    let c = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(c.website).toBeNull();

    await svc.update(owner.company.id, { website: " https://www.ornek.com.tr/hakkimizda " } as never);
    c = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(c.website).toBe("https://www.ornek.com.tr/hakkimizda");
    // Şemasız yazım da geçerli (kayıt biçimi bu uçta değişmedi).
    await svc.update(owner.company.id, { website: "www.ornek.com.tr" } as never);
    c = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(c.website).toBe("www.ornek.com.tr");
    await svc.update(owner.company.id, { website: "" } as never);
    c = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(c.website).toBeNull();
  });

  it("kuraldan önce kaydedilmiş hatalı adres aynen gelirse diğer alanların kaydını engellemez", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const legacy = "https://ornek firma sitesi";
    await prisma.company.update({ where: { id: owner.company.id }, data: { website: legacy } });

    // Form kayıtlı değeri geri gönderir (baştaki/sondaki boşluk fark sayılmaz).
    await svc.update(owner.company.id, { website: ` ${legacy} `, district: "Kadıköy" } as never);
    let c = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(c.district).toBe("Kadıköy");
    expect(c.website).toBe(legacy);
    // Web sitesine dokunmayan istek de etkilenmez.
    await svc.update(owner.company.id, { district: "Üsküdar" } as never);
    c = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(c.district).toBe("Üsküdar");

    // DEĞİŞEN değer denetlenir: hâlâ hatalıysa 400, düzeltilmişse kaydedilir.
    await expect(
      svc.update(owner.company.id, { website: "https://baska firma sitesi" } as never),
    ).rejects.toThrow(/web sitesi adresi/);
    await svc.update(owner.company.id, { website: "https://ornekfirma.com" } as never);
    c = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(c.website).toBe("https://ornekfirma.com");
  });
});
