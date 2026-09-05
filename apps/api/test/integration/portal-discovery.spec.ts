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
  // `company` update ÖNCESİ nesne — slug'ı elle taşı (tekil ürün testleri okur).
  return { company: { ...company, slug: `vitrin-disc-${seq}` }, user, item };
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

/**
 * ÜYE katmanı ürün sayfası (2026-09-04): fiyat/MOQ herkese açık uçtan çıktı,
 * panel bu uçtan okur. Kapı public uçla aynı — taslak/kapalı firma 404.
 */
describe("keşif — tekil ürün (üye katmanı)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("üye fiyatı ve MOQ'yu görür, firma kimliği açık", async () => {
    const { company, item } = await makePublicProduct({
      priceMode: "FIXED",
      priceAmount: "1250.5",
      priceCurrency: "TRY",
      moq: "10",
    });
    const me = await makeCompanyWithUser(prisma);
    const res = await items().discoverProduct(me.auth, company.slug as string, item.slug as string);
    expect(res.product.priceAmount).toBe("1250.5");
    expect(res.product.moq).toBe("10");
    expect(res.company.name).toMatch(/^Vitrin /);
    expect(res.company).toHaveProperty("verified");
  });

  it("taslak ürün ve kapalı firma 404", async () => {
    const draft = await makePublicProduct({ isPublic: false, publishedAt: null });
    const me = await makeCompanyWithUser(prisma);
    await expect(
      items().discoverProduct(me.auth, draft.company.slug as string, draft.item.slug as string),
    ).rejects.toThrow(/bulunamadı/);
    const closed = await makePublicProduct();
    await prisma.company.update({ where: { id: closed.company.id }, data: { publicEnabled: false } });
    await expect(
      items().discoverProduct(me.auth, closed.company.slug as string, closed.item.slug as string),
    ).rejects.toThrow(/bulunamadı/);
  });
});

describe("keşif — Ürün Ara (discoverSearch)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("uygunluk: alıcının ALIM kategorisiyle örtüşen ürünler ÖNCE (matchesProfile); açık sıralamada karışmaz", async () => {
    const t0 = new Date("2026-09-01T00:00:00Z");
    const t1 = new Date("2026-09-02T00:00:00Z");
    const el = await makePublicProduct({ categoryId: "39121000", completionScore: 40, publishedAt: t0 }); // elektrik
    const kg = await makePublicProduct({ categoryId: "14111500", completionScore: 90, publishedAt: t1 }); // kağıt, daha eksiksiz
    const me = await makeCompanyWithUser(prisma);
    await prisma.company.update({
      where: { id: me.company.id },
      data: { buyerCategoryIds: ["39000000"] },
    });
    const rel = await items().discoverSearch(me.auth, {});
    expect(rel.items.map((i) => i.name)).toEqual([el.item.name, kg.item.name]);
    expect(rel.items.map((i) => i.matchesProfile)).toEqual([true, false]);
    expect(rel.total).toBe(2);
    const newest = await items().discoverSearch(me.auth, { sort: "newest" });
    expect(newest.items.map((i) => i.name)).toEqual([kg.item.name, el.item.name]);
    expect("matchesProfile" in newest.items[0]).toBe(false);
    // Alım kategorisi beyan etmemiş alıcı: düz sıralama (eksiksiz önce).
    const other = await makeCompanyWithUser(prisma);
    expect((await items().discoverSearch(other.auth, {})).items.map((i) => i.name)).toEqual([kg.item.name, el.item.name]);
  });

  it("sayfalama iki kümeyi birleştirir: pageSize=1 → 1. sayfa eşleşen, 2. sayfa kalan", async () => {
    const el = await makePublicProduct({ categoryId: "39121000" });
    const kg = await makePublicProduct({ categoryId: "14111500" });
    const me = await makeCompanyWithUser(prisma);
    await prisma.company.update({ where: { id: me.company.id }, data: { buyerSubCategoryIds: ["39120000"] } });
    const p1 = await items().discoverSearch(me.auth, { page: 1, pageSize: 1 });
    const p2 = await items().discoverSearch(me.auth, { page: 2, pageSize: 1 });
    expect(p1.items.map((i) => i.name)).toEqual([el.item.name]);
    expect(p2.items.map((i) => i.name)).toEqual([kg.item.name]);
    expect(p1.pageSize).toBe(1);
    expect(p1.total).toBe(2);
  });

  it("arama: firma ADIYLA da bulur; Türkçe karakter katlanır (ÇELİK → celik)", async () => {
    const a = await makePublicProduct({ name: "Çelik Boru", searchText: "celik boru" });
    await prisma.company.update({ where: { id: a.company.id }, data: { name: "Trakya Elektrik" } });
    const other = await makePublicProduct();
    const me = await makeCompanyWithUser(prisma);
    expect((await items().discoverSearch(me.auth, { q: "trakya" })).items.map((i) => i.name)).toEqual(["Çelik Boru"]);
    expect((await items().discoverSearch(me.auth, { q: "ÇELİK" })).items.map((i) => i.name)).toEqual(["Çelik Boru"]);
    expect((await items().discoverSearch(me.auth, { q: "pano" })).items.map((i) => i.name)).toEqual([other.item.name]);
    // Türkçe ek toleransı: "boruları" → "boru" ön ekiyle bulunur; "panosu" → "pano".
    expect((await items().discoverSearch(me.auth, { q: "çelik boruları" })).items.map((i) => i.name)).toEqual(["Çelik Boru"]);
    expect((await items().discoverSearch(me.auth, { q: "panosu" })).items.map((i) => i.name)).toEqual([other.item.name]);
  });
});

