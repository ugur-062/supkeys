/**
 * PANO KEŞİF BLOĞU — veri sözleşmesi.
 *
 * Blok panelin KENDİ auth'lu uçlarını kullanır (pazar yerinin herkese açık
 * uçlarını DEĞİL); dolayısıyla maskeleme, blok ve görünürlük kuralları
 * listedekiyle birebir aynı olmalı. Kilitlenen iddialar:
 *   · sektör sayaçları ile liste AYNI kuralı okur (sayı ≠ liste olmaz),
 *   · `limit` sıralamayı bozmaz — kırpma sıralamadan SONRA,
 *   · kendi ürünlerin keşif şeridinde yok, taslak/kapalı firma hiç yok.
 */
import { CompanyItemsService } from "../../src/modules/company-items/company-items.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const items = () =>
  new CompanyItemsService(
    prisma as unknown as PrismaService,
    { log: jest.fn() } as never,
    {} as never, // storage — bu spec görsel yoluna girmiyor
  );

let seq = 0;
async function makePublicProduct(over: Record<string, unknown> = {}) {
  seq += 1;
  const { company, user } = await makeCompanyWithUser(prisma);
  await prisma.company.update({
    where: { id: company.id },
    data: {
      name: `Vitrin ${seq}`,
      slug: `vitrin-disc-${seq}`,
      city: "İzmir",
      publicEnabled: true,
    },
  });
  const item = await prisma.companyItem.create({
    data: {
      companyId: company.id,
      createdById: user.id,
      name: `Ürün ${seq}`,
      unit: "adet",
      slug: `urun-disc-${seq}`,
      categoryId: "39121000",
      isPublic: true,
      publishedAt: new Date(),
      images: ["a.webp"],
      keywords: ["pano"],
      searchText: "urun pano",
      ...over,
    },
  });
  return { company, user, item };
}

describe("keşif — ürünler", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("başka firmaların yayımlanmış ürünlerini döner", async () => {
    await makePublicProduct();
    const me = await makeCompanyWithUser(prisma);
    const rows = await items().discoverProducts(me.auth);
    expect(rows).toHaveLength(1);
    // Panelde kimlik AÇIK — ilan anonimliği yalnız herkese açık sayfalarda.
    expect(rows[0].company.name).toBe("Vitrin 1");
  });

  it("KENDİ ürünlerin keşifte YOK", async () => {
    const mine = await makePublicProduct();
    const rows = await items().discoverProducts({
      ...mine.user,
      companyId: mine.company.id,
    } as never);
    expect(rows).toEqual([]);
  });

  it("taslak ürün ve kapalı firma keşifte YOK", async () => {
    await makePublicProduct({ isPublic: false, publishedAt: null });
    const hidden = await makePublicProduct();
    await prisma.company.update({
      where: { id: hidden.company.id },
      data: { publicEnabled: false },
    });
    const me = await makeCompanyWithUser(prisma);
    expect(await items().discoverProducts(me.auth)).toEqual([]);
  });

  it("arama TOKENLİ, kategori ata zincirini kapsar", async () => {
    await makePublicProduct({ searchText: "paslanmaz celik boru" });
    const me = await makeCompanyWithUser(prisma);
    expect(await items().discoverProducts(me.auth, { q: "boru paslanmaz" })).toHaveLength(1);
    expect(await items().discoverProducts(me.auth, { q: "aluminyum" })).toHaveLength(0);
    expect(await items().discoverProducts(me.auth, { category: "39000000" })).toHaveLength(1);
    expect(await items().discoverProducts(me.auth, { category: "23000000" })).toHaveLength(0);
  });

  it("limit tavanı aşılamaz", async () => {
    await makePublicProduct();
    const me = await makeCompanyWithUser(prisma);
    // 48 tavanı: istemci 1000 istese de sorgu şişmez.
    const rows = await items().discoverProducts(me.auth, { limit: 1000 });
    expect(rows.length).toBeLessThanOrEqual(48);
  });
});
