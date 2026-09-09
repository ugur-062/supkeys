import { BadRequestException } from "@nestjs/common";
import { AdminProductsService } from "../../src/modules/admin-companies/admin-products.service";

/**
 * Ürün moderasyonu — sözleşme: isPublic YALNIZ approve ile true olur;
 * yalnız PENDING karar alır; red yayındaki ürünü çeker; bildirim + audit +
 * SEO kancası çağrılır; koşullu updateMany yarışı yakalar.
 */
function rig(row: Record<string, unknown>) {
  const prisma = {
    companyItem: {
      findUnique: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([row]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue({ submittedAt: new Date("2026-09-08T00:00:00Z") }),
    },
    category: { findMany: jest.fn().mockResolvedValue([{ id: "39000000", nameTr: "Elektrik" }]) },
    categoryAttribute: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const companies = { notifyCompany: jest.fn().mockResolvedValue(undefined) };
  const seo = { productChanged: jest.fn() };
  const svc = new AdminProductsService(prisma as never, audit as never, companies as never, seo as never);
  return { svc, prisma, audit, companies, seo };
}
const BASE = {
  id: "i1",
  name: "Dirsek",
  slug: "dirsek",
  code: null,
  description: "x",
  images: ["https://cdn/a.jpg"],
  keywords: [],
  attributes: { malzeme: "AISI 316" },
  brand: null,
  mpn: null,
  categoryId: "39000000",
  priceMode: "ON_REQUEST",
  priceAmount: null,
  priceTiers: null,
  priceCurrency: "TRY",
  moq: null,
  unit: "adet",
  videoUrl: null,
  externalUrl: null,
  documents: null,
  isPublic: false,
  isActive: true,
  publishedAt: null,
  reviewStatus: "PENDING",
  submittedAt: new Date("2026-09-09T00:00:00Z"),
  reviewedAt: null,
  reviewedByAdminId: null,
  rejectReason: null,
  completionScore: 70,
  createdAt: new Date(),
  updatedAt: new Date(),
  company: { id: "c1", name: "Acme", slug: "acme", city: "İzmir", country: "TR", tier: "SILVER", companyVerificationStatus: "VERIFIED", isBlocked: false },
};

describe("AdminProductsService", () => {
  it("approve: PENDING → APPROVED + isPublic + publishedAt; audit critical, bildirim, SEO", async () => {
    const { svc, prisma, audit, companies, seo } = rig(BASE);
    await svc.approve("i1", "admin1");
    const data = prisma.companyItem.updateMany.mock.calls[0][0].data;
    expect(prisma.companyItem.updateMany.mock.calls[0][0].where).toEqual({ id: "i1", reviewStatus: "PENDING" });
    expect(data).toMatchObject({ reviewStatus: "APPROVED", isPublic: true, reviewedByAdminId: "admin1", rejectReason: null });
    expect(data.publishedAt).toBeInstanceOf(Date);
    expect(audit.log.mock.calls[0][0]).toMatchObject({ action: "admin.product.approved", critical: true, tenantId: "c1" });
    expect(companies.notifyCompany.mock.calls[0][1]).toBe("Ürününüz yayına alındı");
    expect(companies.notifyCompany.mock.calls[0][4]).toEqual({ label: "Ürünü gör", path: "/firma/acme/urun/dirsek" });
    expect(seo.productChanged).toHaveBeenCalledWith("i1");
  });

  it("approve yayındaki ürünün yeniden incelemesi: publishedAt korunur, başlık 'güncellemeniz onaylandı'", async () => {
    const pub = new Date("2026-08-01T00:00:00Z");
    const { svc, prisma, companies } = rig({ ...BASE, isPublic: true, publishedAt: pub });
    await svc.approve("i1", "admin1");
    expect(prisma.companyItem.updateMany.mock.calls[0][0].data.publishedAt).toBe(pub);
    expect(companies.notifyCompany.mock.calls[0][1]).toBe("Ürün güncellemeniz onaylandı");
  });

  it("reject: gerekçe yazılır, yayındaysa vitrinden çekilir ve SEO tazelenir; taslakta SEO çağrılmaz", async () => {
    const a = rig({ ...BASE, isPublic: true });
    await a.svc.reject("i1", "  Görseller ürüne ait değil  ", "admin1");
    expect(a.prisma.companyItem.updateMany.mock.calls[0][0].data).toMatchObject({ reviewStatus: "REJECTED", isPublic: false, rejectReason: "Görseller ürüne ait değil" });
    expect(a.seo.productChanged).toHaveBeenCalled();
    expect(a.companies.notifyCompany.mock.calls[0][2].join(" ")).toContain("vitrinden çekildi");

    const b = rig(BASE);
    await b.svc.reject("i1", "Açıklama yetersiz kalmış", "admin1");
    expect(b.seo.productChanged).not.toHaveBeenCalled();
    expect(b.companies.notifyCompany.mock.calls[0][4]).toEqual({ label: "Ürünü düzenle", path: "/company/satis/urunlerim?sekme=rejected" });
  });

  it("yalnız PENDING karar alır; yarışta (count=0) 400", async () => {
    const { svc } = rig({ ...BASE, reviewStatus: "APPROVED" });
    await expect(svc.approve("i1", "a")).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.reject("i1", "gerekçe gerekçe", "a")).rejects.toBeInstanceOf(BadRequestException);
    const race = rig(BASE);
    race.prisma.companyItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(race.svc.approve("i1", "a")).rejects.toThrow(/değişti/);
    expect(race.audit.log).not.toHaveBeenCalled();
  });

  it("detail: nitelikler etiketlenir, herkese açık adres kurulur; list kuyruğu en eski önce", async () => {
    const { svc, prisma } = rig(BASE);
    prisma.categoryAttribute.findMany.mockResolvedValue([{ groupKey: "malzeme", nameTr: "Malzeme", unit: null, sortOrder: 0, categoryId: "39000000", type: "TEXT", options: [], isRequired: false, id: "a1" }]);
    const d = await svc.detail("i1");
    expect(d.attributeList).toEqual([{ key: "malzeme", label: "Malzeme", value: "AISI 316", unit: null }]);
    expect(d.publicUrl).toBe("/firma/acme/urun/dirsek");
    expect(d.categoryName).toBe("Elektrik");
    await svc.list({ status: "PENDING" });
    expect(prisma.companyItem.findMany.mock.calls[0][0].orderBy[0]).toEqual({ submittedAt: "asc" });
    const s = await svc.stats();
    expect(s.pending).toBe(1);
  });
});
