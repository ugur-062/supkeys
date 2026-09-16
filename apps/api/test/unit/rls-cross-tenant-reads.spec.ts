/**
 * RLS — ÇAPRAZ FİRMA OKUMALARI BYPASS CLIENT'TAN GEÇER (2026-09-16).
 *
 * Staging'de RLS açıldığında (kısıtlı rol + RLS_ENABLED=true) panel ürün keşfi
 * BOŞ döndü: `company_items` politikası yalnız bağlamdaki firmanın satırına izin
 * veriyor, keşif ise başka firmaların ürünlerini okuyor. Herkese açık pazar yeri
 * etkilenmedi çünkü bypass client kullanıyordu. Bu spec, aynı yolun keşif ve
 * herkese açık görüntülenme beacon'ına da bağlandığını kilitler.
 *
 * Rig: bypass VERİLİRSE çapraz okuma ondan gider ve ana client'a hiç
 * dokunulmaz; bypass YOKSA (elle kurulan eski rig'ler) ana client'a düşer —
 * davranış geriye uyumlu.
 */
import { CompanyItemsService } from "../../src/modules/company-items/company-items.service";
import { CompanyViewsService } from "../../src/modules/company-views/company-views.service";

const user = { companyId: "firma-A", userId: "u1", email: "a@x.test" } as never;

function itemsRig(withBypass: boolean) {
  const prisma = { companyItem: { findMany: jest.fn().mockResolvedValue([]) } };
  const bypass = { companyItem: { findMany: jest.fn().mockResolvedValue([]) } };
  const svc = new CompanyItemsService(
    prisma as never,
    { log: jest.fn() } as never, // audit
    {} as never, // storage
    undefined, // views
    undefined, // seo
    withBypass ? (bypass as never) : undefined,
  );
  return { svc, prisma, bypass };
}

describe("RLS çapraz okuma — ürün keşfi", () => {
  it("bypass verilince başka firmaların ürünleri BYPASS client'tan okunur", async () => {
    const { svc, prisma, bypass } = itemsRig(true);
    await svc.discoverProducts(user, { limit: 5 });
    expect(bypass.companyItem.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.companyItem.findMany).not.toHaveBeenCalled();
    // Kendi ürünleri HARİÇ ve görünürlük kapısı sorguda (tek kaynak publicProductWhere).
    const where = bypass.companyItem.findMany.mock.calls[0]![0].where;
    expect(where.companyId).toEqual({ not: "firma-A" });
    expect(where.isPublic).toBe(true);
  });

  it("bypass yoksa (eski rig) ana client'a düşer — geriye uyumlu", async () => {
    const { svc, prisma } = itemsRig(false);
    await svc.discoverProducts(user, {});
    expect(prisma.companyItem.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("RLS çapraz okuma — herkese açık görüntülenme beacon'ı", () => {
  function viewsRig(withBypass: boolean) {
    const prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: "firma-B", publicEnabled: true, isActive: true, isBlocked: false }),
      },
      companyItem: { findFirst: jest.fn().mockResolvedValue({ id: "urun-1" }) },
      companyView: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const bypass = { companyItem: { findFirst: jest.fn().mockResolvedValue({ id: "urun-1" }) } };
    const svc = new CompanyViewsService(prisma as never, withBypass ? (bypass as never) : undefined);
    return { svc, prisma, bypass };
  }

  it("firma bağlamı olmayan beacon ürünü BYPASS ile bulur ve görüntülenmeyi kaydeder", async () => {
    const { svc, prisma, bypass } = viewsRig(true);
    const res = await svc.recordPublicView({
      type: "product",
      companySlug: "firma-b",
      productSlug: "urun-1",
      ip: "1.2.3.4",
      userAgent: "Mozilla/5.0 gerçek tarayıcı",
    });
    expect(res).toEqual({ recorded: true });
    expect(bypass.companyItem.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.companyItem.findFirst).not.toHaveBeenCalled();
    expect(prisma.companyView.createMany).toHaveBeenCalledTimes(1);
  });

  it("bypass yoksa ana client'a düşer", async () => {
    const { svc, prisma } = viewsRig(false);
    await svc.recordPublicView({ type: "product", companySlug: "firma-b", productSlug: "urun-1", ip: "1.2.3.4", userAgent: "Mozilla/5.0 gerçek tarayıcı" });
    expect(prisma.companyItem.findFirst).toHaveBeenCalledTimes(1);
  });
});
