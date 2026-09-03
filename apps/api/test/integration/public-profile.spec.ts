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

  it("süresi DOLMUŞ PAKET profil 404 (efektif STANDARD)", async () => {
    const slug = await publicCompany({
      tier: "GOLD",
      membershipEndAt: new Date(Date.now() - 86_400_000),
    });
    await expect(svc.getBySlug(slug)).rejects.toThrow(/bulunamadı/i);
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
 * GÖRÜNÜRLÜK KATMANI (2026-09-04): herkese açık profil YALNIZ anonim
 * katmanı döndürür. Rakip analizi / kazıyıcı değeri taşıyan alanlar
 * (Rothern ID, kuruluş, çalışan, puan, hizmet, sertifika, iletişim) panelde.
 */
describe("PublicProfile getBySlug — anonim katman", () => {
  const PROSE =
    "Endüstriyel elektrik panoları ve şalt malzemeleri üretiyoruz. 1998'den beri OSB'lerde anahtar teslim projeler yürütüyoruz.\nİkinci satır: İstanbul ve Kocaeli'de iki tesisimiz var.\nÜçüncü satır buraya sığmamalı.";

  it("kimlik ve ölçüm alanları yanıtta YOK", async () => {
    const slug = await publicCompany({
      aboutText: PROSE,
      foundedYear: 1998,
      employeeCount: "50-100",
      services: ["Montaj"],
      certifications: ["ISO 9001"],
      website: "https://ornek.com",
    });
    const res = (await svc.getBySlug(slug)) as Record<string, unknown>;
    for (const k of [
      "rothernId",
      "foundedYear",
      "employeeCount",
      "services",
      "certifications",
      "certificateImages",
      "website",
      "linkedinUrl",
      "instagramUrl",
      "rating",
      "reviewSummary",
      "aboutText",
    ]) {
      expect(res).not.toHaveProperty(k);
    }
    expect(res.name).toBeTruthy();
    expect(res).toHaveProperty("verified");
    expect(res).toHaveProperty("goldMember");
  });

  it("Hakkında yalnız ilk 2 satır + kesildi bayrağı", async () => {
    const slug = await publicCompany({ aboutText: PROSE });
    const res = (await svc.getBySlug(slug)) as { aboutExcerpt: string; aboutTruncated: boolean };
    expect(res.aboutTruncated).toBe(true);
    expect(res.aboutExcerpt).not.toContain("Üçüncü satır");
    expect(res.aboutExcerpt).toContain("Endüstriyel elektrik");
  });

  it("test verisi (anlamsız harf dizisi) Hakkında olarak HİÇ dönmez", async () => {
    const slug = await publicCompany({
      aboutText: "PSKDFMOKANDFASJNMFOJKANSFOJMAPSKDFMOKANDFASJNMFOJKANSFOJMA",
    });
    const res = (await svc.getBySlug(slug)) as { aboutExcerpt: string | null };
    expect(res.aboutExcerpt).toBeNull();
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
    // Firma adı/slug'ı yok — özet kimlik taşımaz.
    expect(JSON.stringify(res)).not.toMatch(/firma-\d+/);
  });
});
