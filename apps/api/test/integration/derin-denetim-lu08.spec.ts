/**
 * Derin denetim LU-08 (DÜŞÜK, company-items):
 *  - Ürünlerim Taslak sayacı liste süzgeciyle aynı koşul (paket düşüşünde
 *    APPROVED+isPublic=false kalan ürün sayılır);
 *  - katalog araması TR-katlanmış ('ışık' → 'Işık Direği');
 *  - engel karşılıklı görünmezlik: panel ürün sayfası 404, ziyaret yazılmaz,
 *    Ziyaret Edenler'de engel ilişkisindeki firma kimliksiz sayılır.
 */
import { NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { CompanyItemsService } from "../../src/modules/company-items/company-items.service";
import { CompanyViewsService } from "../../src/modules/company-views/company-views.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const views = () => new CompanyViewsService(prisma as unknown as PrismaService);
const items = () =>
  new CompanyItemsService(prisma as never, { log: jest.fn() } as never, {} as never, views());

async function publicSeller(tag: string) {
  const r = await makeCompanyWithUser(prisma, { tier: "SILVER" });
  await prisma.company.update({
    where: { id: r.company.id },
    data: { slug: `firma-lu08-${tag}`, publicEnabled: true },
  });
  const item = await prisma.companyItem.create({
    data: {
      companyId: r.company.id,
      createdById: r.user.id,
      name: `Ürün ${tag}`,
      unit: "adet",
      slug: `urun-lu08-${tag}`,
      isPublic: true,
      reviewStatus: "APPROVED",
      publishedAt: new Date(),
      images: ["a.webp"],
    },
  });
  return { ...r, slug: `firma-lu08-${tag}`, item };
}

describe("LU-08 — Ürünlerim sayaçları ve katalog araması", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("paket düşüşünde taslağa çekilen (APPROVED, isPublic=false) ürün Taslak sayacına girer", async () => {
    const { company, user } = await makeCompanyWithUser(prisma);
    const base = { companyId: company.id, createdById: user.id, unit: "adet" };
    await prisma.companyItem.createMany({
      data: [
        { ...base, name: "Taslak", reviewStatus: "DRAFT", isPublic: false },
        { ...base, name: "Kırpılan", reviewStatus: "APPROVED", isPublic: false },
        { ...base, name: "Yayında", reviewStatus: "APPROVED", isPublic: true },
      ],
    });
    const res = await items().list(company.id, { status: "draft" });
    expect(res.items.map((i) => i.name).sort()).toEqual(["Kırpılan", "Taslak"]);
    expect(res.counts.draft).toBe(2);
    expect(res.counts.published).toBe(1);
  });

  it("katalog araması TR-katlanmış: 'ışık' ve 'isik' 'Işık Direği'ni bulur", async () => {
    const { company, auth } = await makeCompanyWithUser(prisma);
    const svc = items();
    await svc.create(auth, { name: "Işık Direği", unit: "adet" });
    await svc.create(auth, { name: "Vana", unit: "adet" });
    for (const q of ["ışık", "isik", "IŞIK"]) {
      const res = await svc.list(company.id, { q });
      expect(res.items.map((i) => i.name)).toEqual(["Işık Direği"]);
    }
    // Kod araması ham kolla sürer.
    await svc.create(auth, { name: "Boru", unit: "m", code: "BRU-200" });
    expect((await svc.list(company.id, { q: "bru-2" })).items.map((i) => i.name)).toEqual(["Boru"]);
  });
});

describe("LU-08 — engel ve Ziyaret Edenler", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("engelleyen firma engellenenin ürününü panelde açamaz ve ziyaret yazılmaz", async () => {
    const seller = await publicSeller("b");
    const viewer = await makeCompanyWithUser(prisma);
    await prisma.companyBlock.create({
      data: { blockerCompanyId: viewer.company.id, blockedCompanyId: seller.company.id },
    });
    await expect(items().discoverProduct(viewer.auth, seller.slug, seller.item.slug!)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // Doğrudan çağrı da (başka yüzeyden) kaydetmez.
    await views().recordPanelView(
      { companyId: viewer.company.id, id: viewer.user.id },
      { companyId: seller.company.id, productId: seller.item.id },
    );
    expect(await prisma.companyView.count({ where: { targetCompanyId: seller.company.id } })).toBe(0);
  });

  it("engel yokken panel ürün sayfası açılır (regresyon)", async () => {
    const seller = await publicSeller("c");
    const viewer = await makeCompanyWithUser(prisma);
    // Görüntülenme servisi verilmez: fire-and-forget kayıt sonraki testin truncate'ına çarpmasın.
    const svc = new CompanyItemsService(prisma as never, { log: jest.fn() } as never, {} as never);
    const res = await svc.discoverProduct(viewer.auth, seller.slug, seller.item.slug!);
    expect(res).toBeTruthy();
  });

  it("engelden ÖNCE yazılmış kimlikli ziyaret Ziyaret Edenler'de kimliksiz sayılır", async () => {
    const seller = await publicSeller("d");
    const a = await makeCompanyWithUser(prisma);
    const other = await makeCompanyWithUser(prisma);
    const v = views();
    await v.recordPanelView({ companyId: a.company.id, id: a.user.id }, { companyId: seller.company.id, productId: seller.item.id });
    await v.recordPanelView({ companyId: other.company.id, id: other.user.id }, { companyId: seller.company.id });
    await prisma.companyBlock.create({
      data: { blockerCompanyId: a.company.id, blockedCompanyId: seller.company.id },
    });
    const res = await v.visitors(seller.auth);
    expect(res.total).toBe(2);
    expect(res.identified).toBe(1);
    expect(res.anonymous).toBe(1);
    expect(res.items.map((i) => i.company.id)).toEqual([other.company.id]);
  });
});
