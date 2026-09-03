/**
 * PAZAR YERİ SÖZLEŞMESİ — giriş yapmamış ziyaretçiye ne gider, ne GİTMEZ.
 *
 * Bu spec iki ayrı şeyi kilitliyor:
 *
 *  1. KAPALI ZARF, YAPISAL. Yanıt ağacı gezilip yasaklı anahtar aranıyor.
 *     Projeksiyona (`PUBLIC_LISTING_SELECT`) alan eklerken biri teklif/adres/
 *     bütçe alanını dahil ederse test kırılır — kod incelemesine bırakılmıyor.
 *
 *  2. GÖRÜNÜRLÜK KAPISI. Vitrin ve indeks AYRI kapılar; hangi kaydın hangi
 *     kapıdan geçtiği burada tek tek yazılı.
 */
import { NotFoundException } from "@nestjs/common";
import {
  MarketplaceLiveGuard,
  isMarketplaceLive,
} from "../../src/common/http/marketplace-live.guard";
import { Prisma } from "@rothern/db";
import { PublicMarketplaceService } from "../../src/modules/public-marketplace/public-marketplace.service";
import type { PrismaBypassService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";

const service = () =>
  new PublicMarketplaceService(prisma as unknown as PrismaBypassService);

/**
 * Ziyaretçiye ASLA gitmeyecek anahtarlar. Gerekçeler projeksiyon dosyasında
 * tek tek yazılı — burada yalnız liste tutuluyor.
 */
const FORBIDDEN_KEYS = [
  "createdById",
  "bids",
  "bidStats",
  "bidCount",
  "invitations",
  "internalNotes",
  "terms",
  "paymentNote",
  "logistics",
  "deliveryAddressId",
  "billingAddressId",
  "targetPrice",
  "minPrice",
  "minUnitPrice",
  // Görünürlük katmanı (2026-09-04): ziyaretçiye fiyat ve kalem gövdesi yok.
  "buyNowPrice",
  "buyNowUnitPrice",
  "quantity",
  "specification",
  "brand",
  "mpn",
  "auctionRateSnapshot",
  "bidVisibility",
  "showTargetToSuppliers",
  "publicEnabled",
  "tier",
  "membershipEndAt",
  "isActive",
  "isBlocked",
  "iban",
  "mersisNo",
  "taxNumber",
  "email",
  "phone",
];

/** Yanıt ağacındaki TÜM anahtarları (iç içe dahil) toplar. */
function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) allKeys(v, out);
    return out;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

/**
 * İlan sahibinin kimliği. Ayrı liste tutmamın sebebi `name`: kalem adı
 * (`items[].name`) meşru olarak public, firma adı değil. Ağacın tamamında
 * "name yasak" desem kalem adları da kırardı — kontrol company nesnesine
 * özel olmalı.
 */
const FORBIDDEN_COMPANY_KEYS = ["name", "slug", "logoUrl", "hasPublicProfile"];

function expectNoForbidden(payload: unknown) {
  const keys = allKeys(payload);
  const leaked = FORBIDDEN_KEYS.filter((k) => keys.has(k));
  expect(leaked).toEqual([]);
}

/** Yanıttaki HER `company` nesnesinde kimlik alanı olmamalı. */
function expectAnonymousOwner(payload: unknown) {
  const companies: Record<string, unknown>[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object" && !(v instanceof Date)) {
      for (const [k, child] of Object.entries(v)) {
        if (k === "company" && child && typeof child === "object") {
          companies.push(child as Record<string, unknown>);
        }
        walk(child);
      }
    }
  };
  walk(payload);
  expect(companies.length).toBeGreaterThan(0);
  for (const c of companies) {
    expect(FORBIDDEN_COMPANY_KEYS.filter((k) => k in c)).toEqual([]);
  }
}

let seq = 0;

async function seedPublicListing(
  over: Partial<Prisma.ListingUncheckedCreateInput> = {},
  companyOver: Partial<Prisma.CompanyUncheckedCreateInput> = {},
) {
  seq += 1;
  // Faktörinin desteklediği alanlar dışındakiler (publicEnabled, slug, city…)
  // kurulumdan SONRA yazılır — factory imzasını bu spec için genişletmemek
  // için bilinçli: imza genişletmesi tüm rig'lere dokunur (rig stub gotcha).
  const { company, user } = await makeCompanyWithUser(prisma, {
    tier: (companyOver.tier as never) ?? undefined,
  });
  const patched = await prisma.company.update({
    where: { id: company.id },
    data: {
      // Ayırt edici ad: yanıt metninde geçip geçmediğini arayabilelim.
      name: `Gizli Alici Sanayi ${seq}`,
      city: "İstanbul",
      publicEnabled: true,
      slug: `firma-${seq}-${Math.random().toString(36).slice(2, 8)}`,
      ...companyOver,
    },
  });
  void patched;
  const listing = await makeListing(prisma, {
    companyId: company.id,
    createdById: user.id,
    visibility: "PUBLIC",
    status: "OPEN",
    number: `ROT-${String(100000 + seq)}`,
    publishedAt: new Date(),
    title: "Çelik Boru Alımı",
    description: "40 ton dikişsiz çelik boru alınacaktır.",
    categoryIds: ["31000000"],
    keywords: ["boru", "çelik"],
    ...over,
  });
  await makeItem(prisma, listing.id, { name: "Dikişsiz boru", targetPrice: new Prisma.Decimal(120) });
  return { company, user, listing };
}

describe("pazar yeri — kapalı zarf yapısal güvence", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("detay yanıtında YASAKLI hiçbir anahtar yok — teklif varken bile", async () => {
    const { company, user, listing } = await seedPublicListing();
    // Teklif VAR: sızarsa test görsün diye gerçek bir teklif yazıyoruz.
    const bidder = await makeCompanyWithUser(prisma);
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 99000,
    });
    void company;
    void user;

    const res = await service().getByNumber(listing.number as string);
    expectNoForbidden(res);
    expect(res.title).toBe("Çelik Boru Alımı");
    // Kalem ADI gider (kapsam) ama gövdesi ve alıcının bütçesi GİTMEZ.
    expect(res.itemPreview[0]).toBe("Dikişsiz boru");
    expect(res).not.toHaveProperty("items");
    expect(JSON.stringify(res)).not.toContain("99000");
    expect(JSON.stringify(res)).not.toContain("120");
  });

  it("İLAN SAHİBİNİN ADI hiçbir yerde geçmez — detayda", async () => {
    const { listing } = await seedPublicListing();
    const res = await service().getByNumber(listing.number as string);
    expectAnonymousOwner(res);
    expect(JSON.stringify(res)).not.toContain("Gizli Alici Sanayi");
    // Nitelik alanları DURUR: teklif verecek taraf lojistik/uygunluk kararını
    // bunlarla verir ve tek başlarına firmayı işaret etmezler.
    expect(res.company.city).toBe("İstanbul");
    expect(res.company.country).toBe("TR");
  });

  it("İLAN SAHİBİNİN ADI hiçbir yerde geçmez — listede", async () => {
    await seedPublicListing();
    const res = await service().list({});
    expectAnonymousOwner(res);
    expect(JSON.stringify(res)).not.toContain("Gizli Alici Sanayi");
  });

  it("firma profil sayfasına bağlantı kurulamaz (slug dönmez)", async () => {
    // Slug dönseydi ad gizli olsa bile `/firma/<slug>` bağlantısı kimliği
    // ele verirdi — kimliği gizlemenin yolu adı silmek DEĞİL, ona giden her
    // tanımlayıcıyı kesmek.
    const { listing } = await seedPublicListing();
    const res = await service().getByNumber(listing.number as string);
    expect("slug" in res.company).toBe(false);
  });

  it("liste yanıtında da yasaklı anahtar yok", async () => {
    await seedPublicListing();
    const res = await service().list({});
    expect(res.items).toHaveLength(1);
    expectNoForbidden(res);
  });

  it("serbest metin alanları (terms/paymentNote) hiç dönmez", async () => {
    const { listing } = await seedPublicListing({
      terms: "Ödeme için IBAN TR11 ... arayın 0555 111 22 33",
      paymentNote: "Peşin — 0555 111 22 33",
    });
    const res = await service().getByNumber(listing.number as string);
    const json = JSON.stringify(res);
    expect(json).not.toContain("0555");
    expect(json).not.toContain("IBAN");
  });
});

describe("pazar yeri — vitrin kapısı", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("CONNECTIONS ve PRIVATE ilanlar vitrine ÇIKMAZ", async () => {
    await seedPublicListing({ visibility: "CONNECTIONS" });
    await seedPublicListing({ visibility: "PRIVATE" });
    const res = await service().list({});
    expect(res.items).toHaveLength(0);
    expect(res.total).toBe(0);
  });

  it("firma pazar yeri anahtarını kapatınca ilan düşer", async () => {
    const { listing } = await seedPublicListing({}, { publicListingsEnabled: false });
    expect((await service().list({})).items).toHaveLength(0);
    await expect(
      service().getByNumber(listing.number as string),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("pasif / bloklu firmanın ilanı görünmez", async () => {
    await seedPublicListing({}, { isActive: false });
    await seedPublicListing({}, { isBlocked: true });
    expect((await service().list({})).items).toHaveLength(0);
  });

  it("yayımlanmamış (publishedAt boş) ilan görünmez", async () => {
    await seedPublicListing({ publishedAt: null, status: "DRAFT" });
    expect((await service().list({})).items).toHaveLength(0);
  });

  it("moderasyonla kapatılan (CLOSED) ve iptal (CANCELLED) ilan görünmez", async () => {
    await seedPublicListing({ status: "CLOSED" });
    await seedPublicListing({ status: "CANCELLED" });
    expect((await service().list({ state: "all" })).items).toHaveLength(0);
  });

  it("açılış embargosundaki ilan (bidsOpenAt gelecekte) görünmez", async () => {
    const future = new Date(Date.now() + 86_400_000);
    await seedPublicListing({ bidsOpenAt: future });
    expect((await service().list({})).items).toHaveLength(0);
  });

  it("bidsOpenAt NULL olan ilan görünür (NOT(gt) NULL tuzağı)", async () => {
    await seedPublicListing({ bidsOpenAt: null });
    expect((await service().list({})).items).toHaveLength(1);
  });

  it("kapanmış ilan varsayılan listede YOK, state=all ile VAR", async () => {
    await seedPublicListing({ status: "AWARDED" });
    expect((await service().list({})).items).toHaveLength(0);
    expect((await service().list({ state: "all" })).items).toHaveLength(1);
  });
});

describe("pazar yeri — indeks kapısı vitrinden DAR", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("firma profil rızası (publicEnabled) ilanın indeksini ETKİLEMEZ", async () => {
    // Bilinçli davranış değişikliği: ilan sayfası firma adını hiç
    // göstermediği için kimlik rızasına bağlamak kapsamı boş yere daraltırdı.
    // Rıza iki yerde alınıyor: publicListingsEnabled (vitrin) + publicIndexable.
    const { listing } = await seedPublicListing({}, { publicEnabled: false });
    const detail = await service().getByNumber(listing.number as string);
    expect(detail.indexable).toBe(true);
    expect(await service().sitemap()).toHaveLength(1);
  });

  it("ilan bazlı publicIndexable=false sitemap'ten düşürür", async () => {
    const { listing } = await seedPublicListing({ publicIndexable: false });
    expect((await service().getByNumber(listing.number as string)).indexable).toBe(false);
    expect(await service().sitemap()).toHaveLength(0);
    // ama sitede DURUR
    expect((await service().list({})).items).toHaveLength(1);
  });

  it("kapanmış ilan sitede durur, sitemap'ten düşer", async () => {
    const { listing } = await seedPublicListing({ status: "AWARDED" });
    expect((await service().getByNumber(listing.number as string)).indexable).toBe(false);
    expect(await service().sitemap()).toHaveLength(0);
  });

  it("üç kapı da açıkken sitemap'e girer", async () => {
    const { listing } = await seedPublicListing();
    const map = await service().sitemap();
    expect(map).toHaveLength(1);
    expect(map[0].number).toBe(listing.number);
    expect(map[0].title).toBe("Çelik Boru Alımı");
  });

  it("STANDART paketli firmanın ilanı da vitrinde ve indekste", async () => {
    // Paket kapısı `/firma/<slug>` PROFİLİNE aittir; ilan vitrinine değil.
    // İlan sayfası zaten firmayı adlandırmıyor, dolayısıyla ücretsiz üyenin
    // ilanını gizlemek envanteri azaltmaktan başka bir şey yapmazdı.
    const { listing } = await seedPublicListing({}, { tier: "STANDART" });
    expect((await service().list({})).items).toHaveLength(1);
    expect(
      (await service().getByNumber(listing.number as string)).indexable,
    ).toBe(true);
  });
});

describe("pazar yeri — süzgeç ve arama", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("tipe göre süzer", async () => {
    await seedPublicListing({ type: "ALIM" });
    await seedPublicListing({ type: "SATIS", title: "Vinç Satılık" });
    expect((await service().list({ type: "SATIS" })).items[0]?.title).toBe("Vinç Satılık");
    expect((await service().list({ type: "ALIM" })).items).toHaveLength(1);
  });

  it("kategori koduna göre süzer", async () => {
    await seedPublicListing({ categoryIds: ["31000000"] });
    await seedPublicListing({ categoryIds: ["50000000"], title: "Gıda alımı" });
    const res = await service().list({ category: "50000000" });
    // L1 seçimi ALT AĞACI kapsar: L3 kod taşıyan ilan segment süzgecine girer
    // (eskiden `has` tam eşleşme → facet "12 ilan" derken liste boş çıkıyordu).
    await seedPublicListing({ categoryIds: ["50131700"], title: "Meyve alımı" });
    expect((await service().list({ category: "50000000" })).total).toBe(2);
    expect((await service().list({ category: "51000000" })).total).toBe(0);
    expect((await service().list({ category: "50131700" })).total).toBe(1);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.title).toBe("Gıda alımı");
  });

  it("şehir süzgeci firma kapısını EZMEZ", async () => {
    // Regresyon: `city` süzgeci `company` nesnesini spread ile ezerse
    // publicListingsEnabled/isActive kontrolü düşerdi.
    await seedPublicListing({}, { city: "İzmir", publicListingsEnabled: false });
    expect((await service().list({ city: "İzmir" })).items).toHaveLength(0);
  });

  it("çok kelimeli arama AND'lenir, sıra önemsiz", async () => {
    // keywords AÇIKÇA boşaltılıyor: seed varsayılanı ["boru","çelik"] taşıyor
    // ve "çelik" ikinci ilana anahtar kelimeden eşleşirdi — testin ölçtüğü şey
    // başlık/açıklama AND'i.
    await seedPublicListing({ title: "Dikişsiz çelik boru alımı", keywords: [] });
    await seedPublicListing({
      title: "Plastik boru alımı",
      description: null,
      keywords: [],
    });
    expect((await service().list({ q: "çelik boru" })).items).toHaveLength(1);
    expect((await service().list({ q: "boru çelik" })).items).toHaveLength(1);
    expect((await service().list({ q: "boru" })).items).toHaveLength(2);
  });

  it("kapanmış ilan aramaya varsayılan olarak girmez", async () => {
    await seedPublicListing({ status: "AWARDED", title: "Kapalı boru işi" });
    expect((await service().list({ q: "boru" })).items).toHaveLength(0);
  });

  it("bilinmeyen numara 404", async () => {
    await expect(service().getByNumber("ROT-000000")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("yayın anahtarı — sunucu tarafı kapı", () => {
  const guard = new MarketplaceLiveGuard();
  const original = process.env.MARKETPLACE_LIVE;
  afterEach(() => {
    if (original === undefined) delete process.env.MARKETPLACE_LIVE;
    else process.env.MARKETPLACE_LIVE = original;
  });

  it("env yoksa KAPALI (fail-closed)", () => {
    delete process.env.MARKETPLACE_LIVE;
    expect(isMarketplaceLive()).toBe(false);
    // 404 döner (403 değil): kapalıyken ucun VAR OLDUĞUNU bile söylemiyoruz.
    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });

  it("yalnız tam olarak \"true\" açar", () => {
    for (const v of ["false", "1", "TRUE", "yes", ""]) {
      process.env.MARKETPLACE_LIVE = v;
      expect(isMarketplaceLive()).toBe(false);
    }
    process.env.MARKETPLACE_LIVE = "true";
    expect(isMarketplaceLive()).toBe(true);
    expect(guard.canActivate()).toBe(true);
  });
});

describe("ilan kapağı — TÜRETİLİR", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("sahibi kapak seçtiyse o kullanılır", async () => {
    const { listing } = await seedPublicListing({ coverImageUrl: "kapak.webp" });
    const d = await service().getByNumber(listing.number as string);
    expect(d.coverImageUrl).toBe("kapak.webp");
  });

  it("kapak yoksa İLK KALEMİN ilk görselinden türetilir", async () => {
    // Sahibe "bir de kapak seç" diye ekstra iş çıkarmıyoruz.
    const { listing } = await seedPublicListing();
    const item = await prisma.listingItem.findFirstOrThrow({
      where: { listingId: listing.id },
    });
    await prisma.listingItem.update({
      where: { id: item.id },
      data: { images: ["kalem-1.webp", "kalem-2.webp"] },
    });
    const d = await service().getByNumber(listing.number as string);
    expect(d.coverImageUrl).toBe("kalem-1.webp");
  });

  it("görselsiz ilanda null döner — web kategori görseline düşer", async () => {
    const { listing } = await seedPublicListing();
    const d = await service().getByNumber(listing.number as string);
    expect(d.coverImageUrl).toBeNull();
  });

  it("kart ve detay AYNI kapağı gösterir", async () => {
    // Ayrışsalardı ziyaretçi listede bir görsel görüp tıklayınca başkasını
    // bulurdu.
    const { listing } = await seedPublicListing();
    const item = await prisma.listingItem.findFirstOrThrow({
      where: { listingId: listing.id },
    });
    await prisma.listingItem.update({
      where: { id: item.id },
      data: { images: ["ayni.webp"] },
    });
    const card = (await service().list({})).items[0];
    const detail = await service().getByNumber(listing.number as string);
    expect(card.coverImageUrl).toBe(detail.coverImageUrl);
    expect(card.coverImageUrl).toBe("ayni.webp");
  });
});
