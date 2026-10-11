/**
 * Public (auth'suz) SEO profili — INV-TIER-1 (T7): görünürlük efektif tier'a bağlı.
 * Süresi-dolmuş (lazy) PAKET firmanın public profili görünmemeli (efektif STANDARD).
 * membershipEndAt iç hesap alanı yanıtta sızmamalı.
 */
import { prisma, truncateAll } from "./test-db";
import { makeCompany, makeCompanyWithUser } from "./factories";
import { PublicProfileService } from "../../src/modules/public-profile/public-profile.service";
import { buildDirectory } from "../../src/common/company/company-directory";
import { FREE_PERIOD } from "../../src/common/company/effective-tier";

const svc = new PublicProfileService(prisma as never);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function publicCompany(over: Record<string, unknown>) {
  const slug = `firma-${Math.floor(Math.random() * 1e9)}`;
  await makeCompany(prisma, {
    country: "TR",
    tier: "GOLD",
    slug,
    publicEnabled: true,
    ...over,
  } as never);
  return slug;
}

describe("PublicProfile getBySlug — INV-TIER-1 (T7)", () => {
  it("efektif PAKET (süresiz) profil görünür", async () => {
    const slug = await publicCompany({ membershipEndAt: null });
    await expect(svc.getBySlug(slug)).resolves.toBeTruthy();
  });

  describe("saklı paket süresi (ücretsiz dönem anahtarı KAPALI)", () => {
    // Üyelik süresi makinesi anahtar kapalıyken geçerlidir; açıkken doğrulanmış firma hep en üst kademede.
    beforeEach(() => {
      jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("süresi DOLMUŞ PAKET profili GÖRÜNÜR kalır (paket şartı yok, 2026-09-06) ama Gold rozeti düşer (efektif STANDART)", async () => {
      const slug = await publicCompany({
        tier: "GOLD",
        membershipEndAt: new Date(Date.now() - 86_400_000),
      });
      const res = (await svc.getBySlug(slug)) as { goldMember: boolean };
      expect(res.goldMember).toBe(false);
    });
  });

  it("ücretsiz dönem: rozet alanı efektif kademeyi izler — doğrulanmış firmada saklı paket dolsa da düşmez; doğrulanmamış firmada süresi dolmuş saklı paket düşer, profil GÖRÜNÜR kalır", async () => {
    const expired = { tier: "GOLD", membershipEndAt: new Date(Date.now() - 86_400_000) };
    const verified = (await svc.getBySlug(await publicCompany(expired))) as {
      goldMember: boolean;
      verified: boolean;
    };
    expect(verified).toMatchObject({ goldMember: true, verified: true });
    for (const status of ["UNVERIFIED", "PENDING", "REJECTED"]) {
      const res = (await svc.getBySlug(
        await publicCompany({ ...expired, companyVerificationStatus: status }),
      )) as { goldMember: boolean; verified: boolean };
      expect(res).toMatchObject({ goldMember: false, verified: false });
    }
    // Saklı kademesi STANDART olan doğrulanmamış firma da aynı (sınırlı firma).
    const limited = (await svc.getBySlug(
      await publicCompany({ tier: "STANDART", companyVerificationStatus: "UNVERIFIED" }),
    )) as { goldMember: boolean };
    expect(limited.goldMember).toBe(false);
  });

  it("yanıtta membershipEndAt / tier iç alanları sızmaz", async () => {
    const slug = await publicCompany({
      membershipEndAt: new Date(Date.now() + 86_400_000),
    });
    const res = (await svc.getBySlug(slug)) as Record<string, unknown>;
    expect(res).not.toHaveProperty("membershipEndAt");
    expect(res).not.toHaveProperty("tier");
  });
});

/**
 * GÖRÜNÜRLÜK v2 (2026-09-04): profil TAMAMEN gezilebilir (kuruluş, çalışan,
 * Hakkında, hizmet, sertifika, ortalama puan). ÜYEYE kalan: Rothern ID,
 * iletişim, Instagram, puan dağılımı, sipariş sayıları, değerlendirme metinleri
 * (web sitesi + LinkedIn 2026-09-09'dan beri AÇIK — SEO `sameAs`).
 */
describe("PublicProfile getBySlug — v2 anonim katman", () => {
  const PROSE =
    "Endüstriyel elektrik panoları ve şalt malzemeleri üretiyoruz. 1998'den beri OSB'lerde anahtar teslim projeler yürütüyoruz.";

  it("açık alanlar VAR, üye alanları YOK", async () => {
    const slug = await publicCompany({
      aboutText: PROSE,
      foundedYear: 1998,
      employeeCount: "50-100",
      services: ["Montaj"],
      certifications: ["ISO 9001"],
      website: "https://ornek.com",
    });
    const res = (await svc.getBySlug(slug)) as Record<string, unknown>;
    expect(res.aboutText).toBe(PROSE);
    expect(res.foundedYear).toBe(1998);
    expect(res.employeeCount).toBe("50-100");
    expect(res.services).toEqual(["Montaj"]);
    expect(res.certifications).toEqual(["ISO 9001"]);
    expect(res).toHaveProperty("ratingAvg");
    expect(res).toHaveProperty("productCount");
    // Web sitesi + LinkedIn HERKESE AÇIK (SEO Parça 7, kullanıcı kararı
    // 2026-09-09): JSON-LD `sameAs` için kimlik, istihbarat değil. Instagram
    // ve Rothern ID üyeye kalır.
    expect(res.website).toBe("https://ornek.com");
    expect(res).toHaveProperty("linkedinUrl");
    for (const k of ["rothernId", "instagramUrl", "rating", "reviewSummary"]) {
      expect(res).not.toHaveProperty(k);
    }
  });

  it("test verisi (anlamsız harf dizisi) Hakkında olarak HİÇ dönmez", async () => {
    const slug = await publicCompany({
      aboutText: "PSKDFMOKANDFASJNMFOJKANSFOJMAPSKDFMOKANDFASJNMFOJKANSFOJMA",
    });
    const res = (await svc.getBySlug(slug)) as { aboutText: string | null };
    expect(res.aboutText).toBeNull();
  });

  it("kategoriler L1 adıyla çözülür", async () => {
    await prisma.category.create({
      data: {
        id: "39000000", code: "39000000", nameTr: "Elektrik Malzemeleri",
        keywords: "", searchText: "elektrik", level: 1, parentId: null,
        isActive: true, sortOrder: 0,
      },
    });
    const slug = await publicCompany({ sellerCategoryIds: ["39000000"] });
    const res = (await svc.getBySlug(slug)) as { categories: { id: string; name: string }[] };
    expect(res.categories).toEqual([{ id: "39000000", name: "Elektrik Malzemeleri" }]);
  });
});

describe("PublicProfile publicDirectory — listelenme koşulu", () => {
  const PROSE =
    "Endüstriyel elektrik panoları ve şalt malzemeleri üretiyoruz. 1998'den beri OSB'lerde anahtar teslim projeler yürütüyoruz.";

  it("boş profil listelenmez; tamlık ≥ %60 VEYA yayında ürün listelenir", async () => {
    await publicCompany({ name: "Boş Firma" }); // tamlık düşük, ürün yok
    await publicCompany({
      name: "Dolu Firma",
      aboutText: PROSE,
      logoUrl: "l.png",
      coverImageUrl: "c.png",
      services: ["Montaj"],
      photos: ["p.png"],
      foundedYear: 1998,
      employeeCount: "10-50",
      city: "İzmir",
      industry: "Elektrik",
    });
    const res = await svc.publicDirectory({});
    expect(res.items.map((i) => i.name)).toEqual(["Dolu Firma"]);
    expect(res.items[0]).not.toHaveProperty("rothernId");
    expect(res.items[0]).toHaveProperty("productCount");
    expect(res.items[0]).toHaveProperty("verified");
  });

  it("test verili Hakkında tamlığa sayılmaz", async () => {
    await publicCompany({
      name: "Sahte Firma",
      aboutText: "PSKDFMOKANDFASJNMFOJKANSFOJMAPSKDFMOKANDFASJNMFOJKANSFOJMA",
      logoUrl: "l.png",
      coverImageUrl: "c.png",
      services: ["Montaj"],
      photos: ["p.png"],
      foundedYear: 1998,
      employeeCount: "10-50",
    });
    // 11 alanın 6'sı dolu (Hakkında sayılmadı) → %55 < 60 → listelenmez.
    expect((await svc.publicDirectory({})).total).toBe(0);
  });

  it("Rothern ID ile arama public dizinde eşleşmez (kimlik kâhini yok), panelde eşleşir", async () => {
    await publicCompany({
      name: "Kimlik Firma",
      rothernId: "QZX-4821",
      aboutText: PROSE,
      logoUrl: "l.png",
      coverImageUrl: "c.png",
      services: ["Montaj"],
      photos: ["p.png"],
      foundedYear: 1998,
      employeeCount: "10-50",
      city: "İzmir",
      industry: "Elektrik",
    });
    expect((await svc.publicDirectory({ q: "QZX-4821" })).total).toBe(0);
    expect((await svc.publicDirectoryFacets({ q: "QZX-4821" })).total).toBe(0);
    expect((await svc.publicDirectory({ q: "Kimlik" })).total).toBe(1);
    const panel = await buildDirectory(prisma as never, { q: "QZX-4821" }, { matchRothernId: true });
    expect(panel.items.map((i) => i.name)).toEqual(["Kimlik Firma"]);
  });
});

describe("Firma dizini ürün önizlemesi — firma başına (arayüz testi O-060)", () => {
  async function companyWithProducts(name: string, n: number, score: number) {
    const { company, user } = await makeCompanyWithUser(prisma, { name });
    await prisma.company.update({
      where: { id: company.id },
      data: { slug: `onizleme-${Math.floor(Math.random() * 1e9)}`, publicEnabled: true },
    });
    for (let i = 0; i < n; i++) {
      await prisma.companyItem.create({
        data: {
          companyId: company.id,
          createdById: user.id,
          name: `${name} urun ${i}`,
          unit: "adet",
          slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${i}`,
          isPublic: true,
          publishedAt: new Date(),
          images: ["x.webp"],
          searchText: `${name.toLowerCase()} urun`,
          completionScore: score,
        },
      });
    }
  }

  it("çok ürünlü firma önizleme bütçesini tüketmez: her firma kendi ilk 4 ürününü alır", async () => {
    await companyWithProducts("Buyuk Firma", 9, 90);
    await companyWithProducts("Kucuk Firma", 2, 10);
    const res = await svc.publicDirectory({});
    const byName = new Map(res.items.map((i) => [i.name, i]));
    expect(byName.get("Buyuk Firma")?.productPreview).toHaveLength(4);
    // Eski tek sorgu `take: 2 × 4 = 8` satırın hepsini Büyük Firma'dan alıyordu.
    expect(byName.get("Kucuk Firma")?.productPreview).toHaveLength(2);
  });

  it("'aramanıza uyan' şeridi de firma başına", async () => {
    await companyWithProducts("Buyuk Firma", 9, 90);
    await companyWithProducts("Kucuk Firma", 2, 10);
    const res = await buildDirectory(prisma as never, { q: "urun" });
    const byName = new Map(res.items.map((i) => [i.name, i]));
    expect(byName.get("Buyuk Firma")?.matchedProducts).toHaveLength(3);
    expect(byName.get("Kucuk Firma")?.matchedProducts).toHaveLength(2);
  });
});

describe("PublicProfile directorySummary — sayı var, kimlik yok", () => {
  it("doğrulanmış firma sayısı + en çok temsil edilen kategoriler", async () => {
    await prisma.category.create({
      data: {
        id: "39000000", code: "39000000", nameTr: "Elektrik Malzemeleri",
        keywords: "", searchText: "elektrik", level: 1, parentId: null,
        isActive: true, sortOrder: 0,
      },
    });
    await publicCompany({ companyVerificationStatus: "VERIFIED", sellerCategoryIds: ["39121000"] });
    await publicCompany({ companyVerificationStatus: "VERIFIED", buyerCategoryIds: ["39000000"] });
    await publicCompany({ companyVerificationStatus: "UNVERIFIED", publicEnabled: false });
    const res = await svc.directorySummary();
    expect(res.verifiedCompanies).toBe(2);
    expect(res.topCategories).toEqual([{ id: "39000000", name: "Elektrik Malzemeleri", count: 2 }]);
    expect(JSON.stringify(res)).not.toMatch(/firma-\d+/);
  });
});
