/**
 * HERKESE AÇIK ÜRÜN — kapı ve sızıntı sözleşmesi.
 *
 * Kritik ayrım burada kilitleniyor:
 *   ilan sayfası = İŞLEM  → sahip ANONİM
 *   ürün sayfası = VİTRİN → firma ADIYLA (opt-in, satılan özellik)
 * İkisi karışırsa ya vitrin işe yaramaz ya alıcının kimliği sızar.
 */
import { NotFoundException } from "@nestjs/common";
import { PublicProfileController } from "../../src/modules/public-profile/public-profile.controller";
import { PublicProfileService } from "../../src/modules/public-profile/public-profile.service";
import type { PrismaBypassService } from "../../src/common/prisma/prisma.service";
import { FREE_PERIOD } from "../../src/common/company/effective-tier";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const service = () =>
  new PublicProfileService(prisma as unknown as PrismaBypassService);

/** Ürün yanıtında ASLA görünmemesi gerekenler. */
const FORBIDDEN = [
  "code", // firma içi stok kodu
  "targetPrice", // kalem kataloğunun ALIŞ hedefi — maliyet sızar
  "usageCount",
  "lastUsedAt",
  "createdById",
  "completionScore", // iç kalite ölçütü
  "companyId",
  "isPublic",
  "isActive",
  "searchText",
  "searchTextI18n",
];

function allKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) { v.forEach((x) => allKeys(x, out)); return out; }
  if (v && typeof v === "object" && !(v instanceof Date)) {
    for (const [k, c] of Object.entries(v)) { out.add(k); allKeys(c, out); }
  }
  return out;
}

let seq = 0;
async function seedCompanyWithProduct(
  companyOver: Record<string, unknown> = {},
  productOver: Record<string, unknown> = {},
) {
  seq += 1;
  const { company, user } = await makeCompanyWithUser(prisma);
  const patched = await prisma.company.update({
    where: { id: company.id },
    data: {
      name: `Vitrin Sanayi ${seq}`,
      slug: `vitrin-${seq}`,
      city: "İstanbul",
      publicEnabled: true,
      ...companyOver,
    },
  });
  const product = await prisma.companyItem.create({
    data: {
      companyId: company.id,
      createdById: user.id,
      name: "Dağıtım panosu 400A",
      unit: "adet",
      slug: `pano-${seq}`,
      code: "GIZLI-KOD-1",
      targetPrice: 7654321,
      description: "x".repeat(120),
      images: ["a.webp"],
      keywords: ["pano"],
      isPublic: true,
      publishedAt: new Date(),
      searchText: "dagitim panosu 400a pano",
      ...productOver,
    },
  });
  return { company: patched, product };
}

describe("ürün vitrini — kapı", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("firma + ürün kapıdan geçince görünür", async () => {
    const { company, product } = await seedCompanyWithProduct();
    const list = await service().listPublicProducts(company.slug as string);
    expect(list.total).toBe(1);
    expect(list.items[0].slug).toBe(product.slug);

    const one = await service().getPublicProduct(
      company.slug as string,
      product.slug as string,
    );
    expect(one.product.name).toBe("Dağıtım panosu 400A");
  });

  it("FİRMA public profil rızası yoksa 404 — 'var ama gizli' bile denmez", async () => {
    const { company } = await seedCompanyWithProduct({ publicEnabled: false });
    await expect(
      service().listPublicProducts(company.slug as string),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("sınırlı (doğrulanmamış, STANDART) firmanın vitrini de AÇIK — paket şartı kalktı (2026-09-06), doğrulama da şart değil", async () => {
    const { company } = await seedCompanyWithProduct({
      tier: "STANDART",
      companyVerificationStatus: "UNVERIFIED",
    });
    const res = await service().listPublicProducts(company.slug as string);
    expect(res.total).toBe(1);
  });

  it("bloklu/pasif firma görünmez", async () => {
    const a = await seedCompanyWithProduct({ isBlocked: true });
    const b = await seedCompanyWithProduct({ isActive: false });
    for (const c of [a.company, b.company]) {
      await expect(
        service().listPublicProducts(c.slug as string),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it("YAYIMLANMAMIŞ ürün listede yok, tekil sorguda 404", async () => {
    const { company, product } = await seedCompanyWithProduct({}, {
      isPublic: false,
    });
    expect((await service().listPublicProducts(company.slug as string)).total).toBe(0);
    await expect(
      service().getPublicProduct(company.slug as string, product.slug as string),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("arşivlenmiş (isActive=false) ürün görünmez", async () => {
    const { company } = await seedCompanyWithProduct({}, { isActive: false });
    expect((await service().listPublicProducts(company.slug as string)).total).toBe(0);
  });
});

describe("ürün vitrini — sızıntı", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("iç alanlar yanıtta YOK", async () => {
    const { company, product } = await seedCompanyWithProduct();
    const one = await service().getPublicProduct(
      company.slug as string,
      product.slug as string,
    );
    const keys = allKeys(one);
    expect(FORBIDDEN.filter((k) => keys.has(k))).toEqual([]);
    // Alış hedefi ve stok kodu metin olarak da geçmemeli.
    const json = JSON.stringify(one);
    expect(json).not.toContain("GIZLI-KOD-1");
    // Ayırt edici değer: "999" rastgele cuid/zaman damgasında da çıkıp testi kararsız yapıyordu.
    expect(json).not.toContain("7654321");
  });

  it("ürün detayı segment halkasını (L1, iniş sayfası) ve dil durumunu verir", async () => {
    await prisma.category.create({
      data: { id: "39000000", code: "39000000", nameTr: "Elektrik Malzemeleri", nameEn: "Electrical supplies", level: 1, isActive: true },
    });
    const { company, product } = await seedCompanyWithProduct({}, { categoryId: "39122215" });
    const one = await service().getPublicProduct(company.slug as string, product.slug as string);
    // Ad okuyucunun dilinde (istek bağlamı yok → Türkçe), adres parçası Türkçe addan.
    expect(one.product.segment).toEqual({ id: "39000000", name: "Elektrik Malzemeleri", slug: "elektrik-malzemeleri" });
    // Çeviri servisi yok → tüm diller hazır, kaynak Türkçe, bekleyen yok.
    expect(one.product.readyLocales).toEqual(["tr", "en", "ru"]);
    expect(one.product.sourceLocale).toBe("tr");
    expect(one.product.translationPending).toBe(false);

    // Segment satırı yoksa (ya da gizli segment) halka null — kırıntı yazılmaz.
    const other = await seedCompanyWithProduct({}, { categoryId: "10101501" });
    const two = await service().getPublicProduct(other.company.slug as string, other.product.slug as string);
    expect(two.product.segment).toBeNull();
  });

  it("FİRMA ADI ürün sayfasında GÖRÜNÜR — ilanın tersi, bilinçli", async () => {
    const { company, product } = await seedCompanyWithProduct();
    const one = await service().getPublicProduct(
      company.slug as string,
      product.slug as string,
    );
    expect(one.company.name).toBe(company.name);
    expect(one.company.slug).toBe(company.slug);
  });

  it("web sitesi: yalnız VARLIĞI döner (hasWebsite), adresin kendisi ürün yanıtında YOK", async () => {
    const withSite = await seedCompanyWithProduct({ website: "https://vitrin-ornek.example" });
    const one = await service().getPublicProduct(withSite.company.slug as string, withSite.product.slug as string);
    expect(one.company.hasWebsite).toBe(true);
    expect(allKeys(one).has("website")).toBe(false);
    expect(JSON.stringify(one)).not.toContain("vitrin-ornek.example");

    // Sitesi olmayan (null ya da boşluk) firmada kapılı satır çizilmez.
    const noSite = await seedCompanyWithProduct({ website: null });
    const two = await service().getPublicProduct(noSite.company.slug as string, noSite.product.slug as string);
    expect(two.company.hasWebsite).toBe(false);
    const blank = await seedCompanyWithProduct({ website: "   " });
    const three = await service().getPublicProduct(blank.company.slug as string, blank.product.slug as string);
    expect(three.company.hasWebsite).toBe(false);
  });
});

// T-18 / D-331 / D-192 (arayüz testi 2026-10-01): belge ADI herkese açık,
// İNDİRME adresi üyeye; video ve belgeler efektif Silver+ satıcının — ücretsiz
// dönemde bu DOĞRULANMIŞ satıcı demektir (doğrulanmamış firma saklı kademesiyle kalır).
describe("ürün vitrini — belge ve video (paket + üyelik)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  const media = {
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    documents: [{ url: "https://cdn.example.com/katalog.pdf", title: "Katalog" }],
  };

  it("Silver satıcı: video döner, belge yalnız ADIYLA (indirme adresi anonim yanıtta YOK)", async () => {
    const { company, product } = await seedCompanyWithProduct({ tier: "SILVER" }, media);
    const one = await service().getPublicProduct(company.slug as string, product.slug as string);
    expect(one.product.videoUrl).toBe(media.videoUrl);
    expect(one.product.documents).toEqual([{ title: "Katalog" }]);
    expect(JSON.stringify(one)).not.toContain("katalog.pdf");
  });

  // Ücretsiz dönem: medyayı doğrulama açar — saklı kademe STANDART olsa da doğrulanmış satıcı servis eder.
  it("doğrulanmış satıcı (saklı kademe STANDART): video döner, belge yalnız ADIYLA", async () => {
    const { company, product } = await seedCompanyWithProduct({ tier: "STANDART" }, media);
    const one = await service().getPublicProduct(company.slug as string, product.slug as string);
    expect(one.product.videoUrl).toBe(media.videoUrl);
    expect(one.product.documents).toEqual([{ title: "Katalog" }]);
    expect(JSON.stringify(one)).not.toContain("katalog.pdf");
  });

  // Sınırlı firma = DOĞRULANMAMIŞ firma (UNVERIFIED / PENDING / REJECTED): saklı kademesi STANDART.
  it.each(["UNVERIFIED", "PENDING", "REJECTED"] as const)(
    "%s (sınırlı) satıcının videosu ve belgeleri servis edilmez (kayıt korunur)",
    async (status) => {
      const { company, product } = await seedCompanyWithProduct(
        { tier: "STANDART", companyVerificationStatus: status },
        media,
      );
      const one = await service().getPublicProduct(company.slug as string, product.slug as string);
      expect(one.product.videoUrl).toBeNull();
      expect(one.product.documents).toBeNull();
      const row = await prisma.companyItem.findUniqueOrThrow({ where: { id: product.id } });
      expect(row.videoUrl).toBe(media.videoUrl);
    },
  );

  // Yeniden doğrulama (webA-03): `buy:view` olmayan üye (satış koltuğu,
  // görüntüleyici) belgeyi hiçbir yerden indiremiyordu — üye ucu oturumla açık.
  it("üye ucu: oturumlu üye indirme adresini alır; sınırlı satıcıda boş, engelde 404", async () => {
    // Doğrulanmamış satıcı saklı paketiyle yaşar: süresi dolunca STANDART'a düşer (tembel kural).
    const { company, product } = await seedCompanyWithProduct(
      { tier: "SILVER", companyVerificationStatus: "UNVERIFIED" },
      media,
    );
    // İzleyicinin erişim düzeyi sorulmaz: sınırlı (doğrulanmamış) üye de indirir.
    const viewer = await makeCompanyWithUser(prisma, { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" });
    const got = await service().documentsForMember(viewer.company.id, company.slug as string, product.slug as string);
    expect(got).toEqual({ documents: [{ url: "https://cdn.example.com/katalog.pdf", title: "Katalog" }] });

    await prisma.company.update({
      where: { id: company.id },
      data: { membershipEndAt: new Date(Date.now() - 86_400_000) },
    });
    const expired = await service().documentsForMember(viewer.company.id, company.slug as string, product.slug as string);
    expect(expired).toEqual({ documents: [] });

    // Satıcı doğrulanınca (saklı paketi dolmuş olsa da) belgeler yeniden açılır.
    await prisma.company.update({ where: { id: company.id }, data: { companyVerificationStatus: "VERIFIED" } });
    const verified = await service().documentsForMember(viewer.company.id, company.slug as string, product.slug as string);
    expect(verified).toEqual({ documents: [{ url: "https://cdn.example.com/katalog.pdf", title: "Katalog" }] });

    await prisma.companyBlock.create({
      data: { blockerCompanyId: company.id, blockedCompanyId: viewer.company.id },
    });
    await expect(
      service().documentsForMember(viewer.company.id, company.slug as string, product.slug as string),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("doğrulanmamış firmanın süresi dolmuş saklı Gold'u = STANDART: medya gizlenir", async () => {
    const { company, product } = await seedCompanyWithProduct(
      {
        tier: "GOLD",
        membershipEndAt: new Date(Date.now() - 86_400_000),
        companyVerificationStatus: "UNVERIFIED",
      },
      media,
    );
    const one = await service().getPublicProduct(company.slug as string, product.slug as string);
    expect(one.product.videoUrl).toBeNull();
    expect(one.product.documents).toBeNull();
  });

  describe("saklı paket (ücretsiz dönem anahtarı KAPALI)", () => {
    // Uyuyan paket kapısı: anahtar kapalıyken medyayı doğrulama değil saklı kademe + üyelik süresi açar.
    beforeEach(() => {
      jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("doğrulanmış STANDART satıcının videosu ve belgeleri servis edilmez (kayıt korunur)", async () => {
      const { company, product } = await seedCompanyWithProduct({ tier: "STANDART" }, media);
      const one = await service().getPublicProduct(company.slug as string, product.slug as string);
      expect(one.product.videoUrl).toBeNull();
      expect(one.product.documents).toBeNull();
      const row = await prisma.companyItem.findUniqueOrThrow({ where: { id: product.id } });
      expect(row.videoUrl).toBe(media.videoUrl);
    });

    it("üye ucu: doğrulanmış Silver satıcının süresi dolunca belgeler boş döner", async () => {
      const { company, product } = await seedCompanyWithProduct({ tier: "SILVER" }, media);
      const viewer = await makeCompanyWithUser(prisma, { tier: "STANDART" });
      const got = await service().documentsForMember(viewer.company.id, company.slug as string, product.slug as string);
      expect(got).toEqual({ documents: [{ url: "https://cdn.example.com/katalog.pdf", title: "Katalog" }] });
      await prisma.company.update({
        where: { id: company.id },
        data: { membershipEndAt: new Date(Date.now() - 86_400_000) },
      });
      const expired = await service().documentsForMember(viewer.company.id, company.slug as string, product.slug as string);
      expect(expired).toEqual({ documents: [] });
    });

    it("doğrulanmış firmanın süresi dolmuş Gold'u = STANDART: medya gizlenir", async () => {
      const { company, product } = await seedCompanyWithProduct(
        { tier: "GOLD", membershipEndAt: new Date(Date.now() - 86_400_000) },
        media,
      );
      const one = await service().getPublicProduct(company.slug as string, product.slug as string);
      expect(one.product.videoUrl).toBeNull();
      expect(one.product.documents).toBeNull();
    });
  });
});

describe("ürün vitrini — arama ve sitemap", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("firma içi arama searchText üzerinden çalışır", async () => {
    const { company } = await seedCompanyWithProduct();
    expect((await service().listPublicProducts(company.slug as string, { q: "pano" })).total).toBe(1);
    expect((await service().listPublicProducts(company.slug as string, { q: "vinç" })).total).toBe(0);
  });

  it("kategori süzgeci ATA ZİNCİRİNİ kapsar — segment seçen yaprakları görür", async () => {
    const { company } = await seedCompanyWithProduct({}, { categoryId: "39122215" });
    // Segment kodu verildi; yaprak ürün yine gelmeli.
    expect((await service().listPublicProducts(company.slug as string, { categoryId: "39000000" })).total).toBe(1);
    // Başka segment eşleşmemeli.
    expect((await service().listPublicProducts(company.slug as string, { categoryId: "50000000" })).total).toBe(0);
  });

  it("sitemap yalnız kapıdan geçenleri döner", async () => {
    await seedCompanyWithProduct();
    await seedCompanyWithProduct({ publicEnabled: false });
    await seedCompanyWithProduct({}, { isPublic: false });
    const map = await service().productSitemap();
    expect(map).toHaveLength(1);
    expect(map[0].companySlug).toBeTruthy();
    expect(map[0].slug).toBeTruthy();
  });
});

describe("pazar yeri anahtarı — GÖRÜNÜRLÜK ≠ İNDEKSLENME", () => {
  /**
   * 2026-09-03: ürün sayfası anahtara bağlıydı ve panel "vitrinde yayımlandı"
   * dedikten sonra bağlantı 404 veriyordu. Ürün firmanın ZATEN AÇIK olan
   * profilinin altında yaşıyor → görünürlük profil kapısına bağlı. İndeksleme
   * ise anahtarda kalır: sitemap gated, sayfa `noindex`.
   */
  const guardsOf = (method: string): string[] =>
    (
      (Reflect.getMetadata("__guards__", PublicProfileController.prototype[method as never]) ??
        []) as { name: string }[]
    ).map((g) => g.name);

  it("firma-altı ürün uçları anahtara TABİ DEĞİL", () => {
    expect(guardsOf("products")).not.toContain("MarketplaceLiveGuard");
    expect(guardsOf("product")).not.toContain("MarketplaceLiveGuard");
  });

  it("ürün SİTEMAP'i anahtara TABİ", () => {
    expect(guardsOf("productSitemap")).toContain("MarketplaceLiveGuard");
  });
});

describe("firma profili ürün araması", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("sorgu KATLANIR (büyük harf + Türkçe harf) ve çok dilli sütuna da bakar", async () => {
    const { company, product } = await seedCompanyWithProduct({}, { searchTextI18n: "dagitim panosu distribution panel" });
    const slugs = async (q: string) =>
      (await service().listPublicProducts(company.slug as string, { q })).items.map((p) => p.slug);
    // Eskiden ham token katlanmış sütunda aranıyordu → "DAĞITIM" hiçbir şey bulmuyordu.
    expect(await slugs("DAĞITIM")).toEqual([product.slug]);
    expect(await slugs("distribution panels")).toEqual([product.slug]);
    expect(await slugs("switchboard")).toEqual([]);
  });
});
