/**
 * Public (auth'suz) SEO profili — INV-TIER-1 (T7): görünürlük efektif tier'a bağlı.
 * Süresi-dolmuş (lazy) PAKET firmanın public profili görünmemeli (efektif STANDARD).
 * membershipEndAt iç hesap alanı yanıtta sızmamalı.
 */
import { prisma, truncateAll } from "./test-db";
import { makeCompany } from "./factories";
import { PublicProfileService } from "../../src/modules/public-profile/public-profile.service";

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

  it("süresi DOLMUŞ PAKET profili GÖRÜNÜR kalır (paket şartı yok, 2026-09-06) ama Gold rozeti düşer (efektif STANDART)", async () => {
    const slug = await publicCompany({
      tier: "GOLD",
      membershipEndAt: new Date(Date.now() - 86_400_000),
    });
    const res = (await svc.getBySlug(slug)) as { goldMember: boolean };
    expect(res.goldMember).toBe(false);
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
 * iletişim/web, puan dağılımı, sipariş sayıları, değerlendirme metinleri.
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
    for (const k of ["rothernId", "website", "linkedinUrl", "instagramUrl", "rating", "reviewSummary"]) {
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
