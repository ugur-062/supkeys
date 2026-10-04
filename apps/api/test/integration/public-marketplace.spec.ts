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
import { PublicSitemapService } from "../../src/modules/public-marketplace/public-sitemap.service";
import { ContentTranslationService } from "../../src/modules/content-translation/content-translation.service";
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
  "searchTextI18n",
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
  // Yayın denetimi 2026-09-28: sahibi bağlayan kimlik + davet/keşif ayarları.
  "companyId",
  "rothernId",
  "inviteShowName",
  "aiDiscovery",
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
const FORBIDDEN_COMPANY_KEYS = ["id", "name", "slug", "logoUrl", "hasPublicProfile"];

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
    // 2026-09-18 (kullanıcı kararı): kalem ADI ve MİKTARI herkese açık;
    // marka/açıklama/şartname ve alıcı kimliği GİTMEZ.
    expect(res.items[0].name).toBe("Dikişsiz boru");
    expect(res.items[0]).not.toHaveProperty("description");
    expect(res.items[0].quantity).toBeDefined();
    expect(res.itemSummary.count).toBe(res.items.length);
    expect(JSON.stringify(res)).not.toContain("99000");
    expect(JSON.stringify(res)).not.toContain("120");
  });

  it("İLAN SAHİBİNİN ADI hiçbir yerde geçmez — detayda", async () => {
    const { listing } = await seedPublicListing();
    const res = await service().getByNumber(listing.number as string);
    expectAnonymousOwner(res);
    expect(JSON.stringify(res)).not.toContain("Gizli Alici Sanayi");
    // Nitelik alanları DURUR: teklif verecek taraf lojistik/uygunluk kararını
    // bunlarla verir ve tek başlarına firmayı işaret etmezler. Alıcının ŞEHRİ
    // 2026-10-04'ten beri YOK (sahip kararı: talepte konum = ülke).
    expect(res.company.country).toBe("TR");
    expect(res.company).not.toHaveProperty("city");
    expect(JSON.stringify(res)).not.toContain("İstanbul");
  });

  it("İLAN SAHİBİNİN ADI hiçbir yerde geçmez — listede", async () => {
    await seedPublicListing();
    const res = await service().list({});
    expectAnonymousOwner(res);
    expect(JSON.stringify(res)).not.toContain("Gizli Alici Sanayi");
    // Kart konumu talebin açıldığı ÜLKE (2026-10-04, web şehir yerine bunu basar).
    const items = (res as unknown as { items: { company: { country: string | null } }[] }).items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.company.country === "TR")).toBe(true);
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

  it("embargo süzgeçlerle EZİLMEZ — ülke/arama/süre süzgeci verilse de görünmez (derin denetim Y-10)", async () => {
    // Regresyon: ülke süzgeci üst düzey `OR` olarak kapının embargo `OR`'unu
    // eziyordu → `?country=TR` ile açılışı gelecekteki talep listede çıkıyordu.
    const future = new Date(Date.now() + 86_400_000);
    await seedPublicListing({ bidsOpenAt: future, targetCountries: [] });
    await seedPublicListing({ bidsOpenAt: future, targetCountries: ["TR"], title: "Kablo alımı" });
    for (const q of [
      { country: "TR" },
      { country: "de" },
      { country: "TR", q: "boru" },
      { country: "TR", closesWithin: "30" as const, state: "all" as const },
    ]) {
      const res = await service().list(q);
      expect(res.items).toHaveLength(0);
      expect(res.total).toBe(0);
    }
    // Embargo bitmiş aynı talepler ülke süzgeciyle normal görünür.
    await prisma.listing.updateMany({ data: { bidsOpenAt: new Date(Date.now() - 60_000) } });
    expect((await service().list({ country: "TR" })).total).toBe(2);
    expect((await service().list({ country: "DE" })).total).toBe(1);
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

  it("sitemap her talebi yalnız HAZIR dillerinde verir (çevirisiz dil → yalnız Türkçe)", async () => {
    const { listing } = await seedPublicListing();
    const bypass = prisma as unknown as PrismaBypassService;
    const translations = new ContentTranslationService(bypass);
    const sitemap = new PublicSitemapService(bypass, translations);
    expect((await sitemap.listings(0)).map((r) => r.locales)).toEqual([["tr"]]);
    await translations.enqueue("LISTING", listing.id);
    await prisma.contentTranslation.updateMany({ where: { entityId: listing.id }, data: { status: "DONE", sourceLocale: "tr" } });
    await prisma.contentTranslation.update({
      where: { entityType_entityId_locale: { entityType: "LISTING", entityId: listing.id, locale: "en" } },
      data: { fields: { title: "Steel pipe purchase", description: null, keywords: [], items: [] } },
    });
    const row = (await sitemap.listings(0))[0]!;
    expect(row.locales).toEqual(["tr", "en"]);
    // Dil başına lastmod (2026-09-27): yalnız hazır diller; EN çeviri zamanını
    // izler (≥ varlık updatedAt), Türkçe varlığın kendi zamanı.
    expect(Object.keys(row.lastmods ?? {}).sort()).toEqual(["en", "tr"]);
    expect(row.lastmods!.tr).toBe(row.updatedAt);
    expect(row.lastmods!.en! >= row.updatedAt).toBe(true);
    // Çeviri servisi yoksa (test düzeneği / modül yok) tüm diller, lastmods yok.
    const plain = (await new PublicSitemapService(bypass).listings(0))[0]!;
    expect(plain.locales).toEqual(["tr", "en", "ru"]);
    expect(plain.lastmods).toBeUndefined();
  });

  it("talep detayı dil durumunu verir: readyLocales + sourceLocale (hreflang / lang)", async () => {
    const { listing } = await seedPublicListing();
    const bypass = prisma as unknown as PrismaBypassService;
    const translations = new ContentTranslationService(bypass);
    const svc = new PublicMarketplaceService(bypass, translations);
    const before = await svc.getByNumber(listing.number!);
    expect(before.readyLocales).toEqual(["tr"]);
    expect(before.sourceLocale).toBe("tr");
    // Çeviri servisi yoksa tüm diller hazır sayılır.
    expect((await new PublicMarketplaceService(bypass).getByNumber(listing.number!)).readyLocales).toEqual(["tr", "en", "ru"]);
  });

  it("firma sitemap'i yalnız İNDEKSLENEBİLİR profili verir (sayfanın robots kuralıyla aynı)", async () => {
    const bypass = prisma as unknown as PrismaBypassService;
    const thin = await makeCompanyWithUser(prisma);
    const rich = await makeCompanyWithUser(prisma);
    await prisma.company.update({ where: { id: thin.company.id }, data: { publicEnabled: true, slug: "ince-profil", aboutText: null } });
    await prisma.company.update({
      where: { id: rich.company.id },
      data: {
        publicEnabled: true,
        slug: "dolu-profil",
        website: "https://dolu.example.com",
        aboutText: "Paslanmaz çelik boru ve bağlantı elemanları üretiyoruz; otuz yıldır sanayi firmalarına tedarik ediyoruz.",
      },
    });
    const rows = await new PublicSitemapService(bypass).companies(0);
    expect(rows.map((r) => r.slug)).toEqual(["dolu-profil"]);
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

  it("type=ALIM süzgeci (tek tip — satış ilanı kaldırıldı) listeyi daraltmaz", async () => {
    await seedPublicListing({ type: "ALIM" });
    await seedPublicListing({ type: "ALIM", title: "Vinç alımı" });
    expect((await service().list({ type: "ALIM" })).items).toHaveLength(2);
    expect((await service().list({})).items).toHaveLength(2);
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

  it("facet seçili kategorinin adını döner — yaprak dahil (arayüz testi D-061)", async () => {
    await prisma.category.createMany({
      data: [
        { id: "50000000", code: "50000000", nameTr: "Gıda", level: 1, isActive: true },
        { id: "50131700", code: "50131700", nameTr: "Meyveler", nameEn: "Fruits", level: 3, isActive: true },
      ] as never,
    });
    await seedPublicListing({ categoryIds: ["50131700"], title: "Meyve alımı" });
    // Talep sayfası çipi yaprağa bağlanır; `categories` yalnız segment sayar,
    // aktif çip adı `selectedCategory`den.
    const leaf = await service().facets({ category: "50131700" });
    expect(leaf.selectedCategory).toEqual({ id: "50131700", name: "Meyveler", level: 3 });
    expect((await service().facets({})).selectedCategory).toBeNull();
    expect((await service().facets({ category: "99999999" })).selectedCategory).toBeNull();
  });

  it("alıcı ülkesi süzgeci firma kapısını EZMEZ", async () => {
    // Regresyon: süzgeç `company` nesnesini spread ile ezerse
    // publicListingsEnabled/isActive kontrolü düşerdi.
    await seedPublicListing({}, { country: "DE", publicListingsEnabled: false });
    expect((await service().list({ buyerCountry: "DE" })).items).toHaveLength(0);
  });

  it("ALICI ÜLKESİ süzgeci + facet'i alıcı şehrinin yerine (2026-10-04 sahip kararı)", async () => {
    await seedPublicListing({ title: "Boru alımı" }, { country: "TR", city: "Bursa" });
    await seedPublicListing({ title: "Kablo alımı" }, { country: "TR", city: "İzmir" });
    await seedPublicListing({ title: "Vana alımı", categoryIds: ["40000000"] }, { country: "DE", city: "Munich" });

    // Liste: virgüllü çoklu, küçük harf ve bozuk parça tolere edilir.
    expect((await service().list({ buyerCountry: "DE" })).total).toBe(1);
    expect((await service().list({ buyerCountry: "tr" })).total).toBe(2);
    expect((await service().list({ buyerCountry: "TR,de" })).total).toBe(3);
    expect((await service().list({ buyerCountry: "x1,DE" })).total).toBe(1);
    // ESKİ `city` parametresi yok sayılır (eski bağlantı/istemci 400 almaz, liste süzülmez).
    expect((await service().list({ city: "bursa" })).total).toBe(3);

    // Facet: ülke + sayı, eski `cities` anahtarı yok; şehir adı hiçbir yerde.
    const all = await service().facets({});
    expect(all.buyerCountries).toEqual([
      { code: "TR", count: 2 },
      { code: "DE", count: 1 },
    ]);
    expect(all).not.toHaveProperty("cities");
    expect(JSON.stringify(all)).not.toMatch(/Bursa|İzmir|Munich/);
    // Bağlamsal: kategori seçimi ülke sayılarını daraltır; ülke seçimi kendi
    // boyutunu daraltmaz (dal değiştirilebilsin).
    const vana = await service().facets({ category: "40000000" });
    expect(vana.buyerCountries).toEqual([{ code: "DE", count: 1 }]);
    const de = await service().facets({ buyerCountry: "DE" });
    expect(de.buyerCountries).toEqual([
      { code: "TR", count: 2 },
      { code: "DE", count: 1 },
    ]);
    // Sonuçsuz seçili ülke 0 ile listede kalır (çip kaldırılabilsin).
    const jp = await service().facets({ buyerCountry: "JP" });
    expect(jp.buyerCountries).toContainEqual({ code: "JP", count: 0 });
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

  it("görünürlük ülkesi facet'i: HER ülke seçilebilir, sayı = tüm ülkelere açık + açıkça hedefleyen (2026-09-27)", async () => {
    await seedPublicListing({ targetCountries: [] });
    await seedPublicListing({ targetCountries: [], title: "Vinç alımı" });
    await seedPublicListing({ targetCountries: ["TR"], title: "Kablo alımı" });
    const all = await service().facets({});
    expect(all.openToAll).toBe(2);
    expect(all.countries).toEqual([{ code: "TR", count: 1 }]);
    // Hiç hedeflenmemiş ülke (DE) seçilince 0 açık hedefle listede kalır —
    // istemci `openToAll` ekler: Alman ziyaretçi tüm ülkelere açık 2 talebi görür.
    const de = await service().facets({ country: "de" });
    expect(de.openToAll).toBe(2);
    expect(de.countries).toEqual([
      { code: "TR", count: 1 },
      { code: "DE", count: 0 },
    ]);
    // Liste AYNI kural: DE → yalnız tüm ülkelere açık iki talep; TR → üçü.
    expect((await service().list({ country: "DE" })).total).toBe(2);
    expect((await service().list({ country: "TR" })).total).toBe(3);
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

describe("pazar yeri — çok dilli talep araması (searchTextI18n)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("İngilizce sorgu çevirisi olan Türkçe talebi bulur; sütun boşken bulmaz", async () => {
    const { listing } = await seedPublicListing();
    expect((await service().list({ q: "seamless pipes" })).items).toHaveLength(0);
    await prisma.listing.update({
      where: { id: listing.id },
      data: { searchTextI18n: "celik boru alimi dikissiz steel pipe purchase seamless" },
    });
    const res = await service().list({ q: "seamless pipes" });
    expect(res.items.map((i) => i.number)).toEqual([listing.number]);
  });

  it("katlanmış kaynak: büyük İ ve aksansız yazım talebi bulur", async () => {
    const { listing } = await seedPublicListing({ title: "İskele Sistemi Alımı", keywords: [] });
    await prisma.listing.update({ where: { id: listing.id }, data: { searchTextI18n: "iskele sistemi alimi" } });
    expect((await service().list({ q: "ISKELE" })).items).toHaveLength(1);
    expect((await service().list({ q: "alimi" })).items).toHaveLength(1);
  });
});
