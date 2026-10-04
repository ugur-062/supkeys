/**
 * ÜCRETSİZ ÜYENİN MASKELİ TALEPLERİ (2026-10-03, kullanıcı kararı: "ücretsiz
 * üyelere bunlar normal satın alma talebi gibi şirket isimleri gizli şekilde
 * gözükmeli … en yukarıda bağlantılı üyelerininki gözükmeli").
 *
 * Kilitlenen sözleşme:
 *  1. Maskeli satır ALAN KÜMESİ birebir (herkese açık kart + `format`,
 *     `itemNames`, şehir anahtarı ve izleyenin kendi eşleşme sinyalleri);
 *     alıcının adı/unvanı/slug'ı/logosu/Rothern ID'si/adresi/kişileri, iç
 *     kimlikler, ekler, kalem şartnamesi ve hedef fiyat YOK.
 *  2. Maskeli görünüm, herkese açık `/talep/<slug>` detayıyla AYNI gövde
 *     (`PublicMarketplaceService.getByNumber` ile karşılaştırılır).
 *  3. Küme: Silver'ın göreceği PUBLIC talepler − kendi/engelli/bağlı firma −
 *     davetli − teklif verdiği. Davetli/bağlı talep ASLA maskelenmez.
 *  4. Kapılar DEĞİŞMEDİ: STANDART maskeli talebe teklif veremez (403), tam
 *     detayı açamaz (403 TIER_REQUIRED), belgeleri listeleyemez.
 */
import { Prisma } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import { connect, invite, makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";
import { makeDocsService } from "./make-docs-service";
import { PublicMarketplaceService } from "../../src/modules/public-marketplace/public-marketplace.service";
import type { PrismaBypassService } from "../../src/common/prisma/prisma.service";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

/** Maskeli satırda İZİN VERİLEN anahtarlar — eklenecek her alan buraya bilinçli yazılır. */
const MASKED_ROW_KEYS = [
  // herkese açık kart (`toPublicListingCard`)
  "number",
  "slug",
  "type",
  "title",
  "status",
  "closesAt",
  "publishedAt",
  "primaryCurrency",
  "isInternational",
  "targetCountries",
  "itemCount",
  "itemSummary",
  "company",
  "categories",
  "coverImageUrl",
  "excerpt",
  // herkese açık detayın zaten verdiği
  "format",
  "itemNames",
  // kartın şehrinden türetilen süzgeç anahtarı + okuyucunun dilinde ad
  "ownerCitySlug",
  "ownerCityLabel",
  // izleyenin kendi verisinden sinyaller
  "categoryMatch",
  "productMatch",
  "matchedProduct",
  "masked",
].sort();

/** Alıcının anonim tarifi — herkese açık `PublicListingCompany` ile birebir. */
const MASKED_COMPANY_KEYS = ["activities", "city", "country", "industry", "verified"];

/** Yanıt ağacının hiçbir yerinde geçmemesi gereken anahtarlar. */
const FORBIDDEN_ANYWHERE = [
  "id",
  "companyId",
  "createdById",
  "owner",
  "name" /* yalnız kalem ve kategori adında meşru — aşağıda ayrı denetlenir */,
  "legalName",
  "logoUrl",
  "rothernId",
  "addressLine",
  "addresses",
  "deliveryAddressId",
  "billingAddressId",
  "logistics",
  "contacts",
  "email",
  "phone",
  "website",
  "documents",
  "attachments",
  "specification",
  "brand",
  "mpn",
  "targetPrice",
  "terms",
  "paymentNote",
  "internalNotes",
  "invitations",
  "bids",
  "bidStats",
  "myBid",
  "canBid",
  "tier",
];

function allKeyPaths(value: unknown, path = "", out: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((v) => allKeyPaths(v, `${path}[]`, out));
    return out;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value)) {
      out.push(`${path}.${k}`);
      allKeyPaths(v, `${path}.${k}`, out);
    }
  }
  return out;
}

/**
 * `name` yalnız kategori ve kalem satırında (`categories[].name`, `items[].name`),
 * `id` yalnız kategori kodunda (`categories[].id`) meşru; kalem satırı yalnız
 * sıra/ad/miktar/birim taşır (açıklama/şartname/marka/hedef fiyat yok).
 */
function expectNoForbiddenKeys(payload: unknown) {
  const paths = allKeyPaths(payload);
  const leaked = paths.filter((p) => {
    const key = p.slice(p.lastIndexOf(".") + 1);
    if (key === "name") return !/\.(categories|items)\[\]\.name$/.test(p);
    if (key === "id") return !/\.categories\[\]\.id$/.test(p);
    if (/\.items\[\]\.[^.]+$/.test(p)) return !["lineNo", "name", "quantity", "unit"].includes(key);
    return FORBIDDEN_ANYWHERE.includes(key);
  });
  expect(leaked).toEqual([]);
}

let seq = 0;
const BUYER_NAME = "Gizli Alıcı Çelik Sanayi";
const BUYER_LEGAL = "Gizli Alıcı Çelik Sanayi ve Ticaret A.Ş.";

async function publicListing(opts: { verified?: boolean } = {}) {
  seq += 1;
  const owner = await makeCompanyWithUser(prisma, {
    country: "TR",
    name: `${BUYER_NAME} ${seq}`,
    companyVerificationStatus: opts.verified === false ? "UNVERIFIED" : "VERIFIED",
  });
  await prisma.company.update({
    where: { id: owner.company.id },
    data: {
      legalName: `${BUYER_LEGAL} ${seq}`,
      slug: `gizli-alici-${seq}-${Math.random().toString(36).slice(2, 7)}`,
      rothernId: `RTH-MASK-${seq}-${Math.random().toString(36).slice(2, 7)}`,
      logoUrl: `https://cdn.test/logo-${seq}.png`,
      city: "İstanbul",
      addressLine: "Gizli Sokak No: 7",
      website: "https://gizli-alici.test",
      industry: "Metal",
    },
  });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    status: "OPEN",
    visibility: "PUBLIC",
    closesAt: FUTURE,
    publishedAt: new Date(),
    number: `ROT-${String(700000 + seq)}`,
    title: `Dikişsiz Boru Alımı ${seq}`,
    description: "40 ton dikişsiz çelik boru alınacaktır, teslim İstanbul deposu.",
    terms: "IBAN TR00 0000 · telefon 0555 000 00 00",
    paymentNote: "ödeme notu gizli",
    internalNotes: "iç not gizli",
    categoryIds: ["31000000"],
  });
  const item = await makeItem(prisma, listing.id, {
    name: "Dikişsiz boru 3 inç",
    description: "kalem açıklaması gizli",
    specification: "şartname gizli",
    brand: "MarkaGizli",
    targetPrice: new Prisma.Decimal(123.45),
    quantity: new Prisma.Decimal(40),
    unit: "ton",
  });
  return { owner, listing, item };
}

const bid = (itemId: string) =>
  ({
    items: [{ itemId, unitPrice: 100 }],
    deliveryDate: FUTURE.toISOString(),
    validityDays: 30,
  }) as never;

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("maskeli talepler — ücretsiz (STANDART) tedarikçi", () => {
  it("bağsız PUBLIC talep maskeli satırda: alan kümesi birebir, alıcı kimliği yok", async () => {
    const { service } = makeService();
    const { owner, listing } = await publicListing();
    const std = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART" });

    // Tam listede YOK (kapı değişmedi) …
    const full = (await service.sellerTenders(std.auth)) as { id: string }[];
    expect(full.find((r) => r.id === listing.id)).toBeUndefined();

    // … maskeli listede VAR.
    const rows = await service.maskedPublicTenders(std.auth);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(Object.keys(row).sort()).toEqual(MASKED_ROW_KEYS);
    expect(Object.keys(row.company).sort()).toEqual(MASKED_COMPANY_KEYS);
    expect(row.masked).toBe(true);
    expect(row.number).toBe(listing.number);
    expect(row.title).toBe(listing.title);
    expect(row.company.city).toBe("İstanbul");
    expect(row.company.verified).toBe(true);
    expect(row.itemNames).toEqual(["Dikişsiz boru 3 inç"]);
    expect(row.itemSummary).toEqual({ count: 1, totalQuantity: "40", unit: "ton" });

    expectNoForbiddenKeys(rows);
    const text = JSON.stringify(rows);
    for (const secret of [
      BUYER_NAME,
      BUYER_LEGAL,
      "gizli-alici-",
      "RTH-MASK-",
      "logo-",
      "Gizli Sokak",
      "gizli-alici.test",
      listing.id,
      owner.company.id,
      owner.user.id,
      "şartname gizli",
      "kalem açıklaması gizli",
      "MarkaGizli",
      "123.45",
      "IBAN",
      "ödeme notu gizli",
      "iç not gizli",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("satırın kart kısmı herkese açık listenin kartıyla AYNI (tek serileştirici)", async () => {
    const { service } = makeService();
    const { listing } = await publicListing();
    await prisma.company.updateMany({ data: { publicListingsEnabled: true } });
    const std = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART" });
    const [row] = await service.maskedPublicTenders(std.auth);
    const pub = await new PublicMarketplaceService(prisma as unknown as PrismaBypassService).list({});
    const card = pub.items.find((c) => c.number === listing.number);
    expect(card).toBeDefined();
    const { format, itemNames, ownerCitySlug, ownerCityLabel, categoryMatch, productMatch, matchedProduct, masked, ...cardPart } =
      row!;
    void [format, itemNames, ownerCitySlug, ownerCityLabel, categoryMatch, productMatch, matchedProduct, masked];
    expect(cardPart).toEqual(card);
  });

  it("maskeli görünüm = herkese açık detay gövdesi (+ masked:true); kimlik/şartname yok", async () => {
    const { service } = makeService();
    const { listing } = await publicListing();
    await prisma.company.updateMany({ data: { publicListingsEnabled: true } });
    const std = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART" });

    const detail = await service.maskedPublicTender(std.auth, listing.number!);
    expect(detail.masked).toBe(true);
    const pub = await new PublicMarketplaceService(prisma as unknown as PrismaBypassService).getByNumber(
      listing.number!,
    );
    // Herkese açık uç dil durumunu da ekler (hreflang); gövde birebir aynı.
    const { readyLocales, sourceLocale, ...pubBody } = pub;
    void [readyLocales, sourceLocale];
    expect(detail).toEqual({ ...pubBody, masked: true });

    expectNoForbiddenKeys(detail);
    const text = JSON.stringify(detail);
    for (const secret of [BUYER_NAME, BUYER_LEGAL, "RTH-MASK-", "Gizli Sokak", listing.id, "şartname gizli", "MarkaGizli", "123.45", "IBAN"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("doğrulanmamış alıcı: verified=false (rozet çizilmez)", async () => {
    const { service } = makeService();
    await publicListing({ verified: false });
    const std = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART" });
    const [row] = await service.maskedPublicTenders(std.auth);
    expect(row!.company.verified).toBe(false);
  });

  it("DAVETLİ talep maskelenmez: tam listede tam satır, maskeli listede yok; görünüm tam detaya yönlendirir", async () => {
    const { service } = makeService();
    const { owner, listing } = await publicListing();
    const std = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART" });
    await invite(prisma, listing.id, std.company.id, owner.user.id);

    expect(await service.maskedPublicTenders(std.auth)).toEqual([]);
    const full = (await service.sellerTenders(std.auth)) as { id: string; owner: { name: string } | null; canBid: boolean }[];
    const row = full.find((r) => r.id === listing.id);
    expect(row?.owner?.name).toContain(BUYER_NAME);
    expect(row?.canBid).toBe(true);
    await expect(service.maskedPublicTender(std.auth, listing.number!)).resolves.toEqual({
      masked: false,
      id: listing.id,
    });
  });

  it("BAĞLANTILI firmanın talebi maskelenmez", async () => {
    const { service } = makeService();
    const { owner, listing } = await publicListing();
    const std = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART" });
    await connect(prisma, owner.company.id, std.company.id, owner.user.id);

    expect(await service.maskedPublicTenders(std.auth)).toEqual([]);
    const full = (await service.sellerTenders(std.auth)) as { id: string }[];
    expect(full.find((r) => r.id === listing.id)).toBeTruthy();
    await expect(service.maskedPublicTender(std.auth, listing.number!)).resolves.toEqual({
      masked: false,
      id: listing.id,
    });
  });

  it("teklif verdiği talep maskelenmez (hasBid istisnası tam satırda)", async () => {
    const { service } = makeService();
    const { listing } = await publicListing();
    const std = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART" });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: std.company.id,
      createdById: std.user.id,
      amount: 100,
      status: "SUBMITTED",
    });
    expect(await service.maskedPublicTenders(std.auth)).toEqual([]);
  });

  it("ENGELLİ firma hiç görünmez (iki uçta da); kendi talebi ve CONNECTIONS/PRIVATE talepler maskelenmez", async () => {
    const { service, blocks } = makeService();
    const { owner, listing } = await publicListing();
    const std = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART" });
    // Kendi PUBLIC talebi + başkasının CONNECTIONS ve PRIVATE talebi.
    await makeListing(prisma, {
      companyId: std.company.id,
      createdById: std.user.id,
      visibility: "PUBLIC",
      number: "ROT-799001",
      closesAt: FUTURE,
    });
    await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      visibility: "CONNECTIONS",
      number: "ROT-799002",
      closesAt: FUTURE,
    });
    await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      visibility: "PRIVATE",
      number: "ROT-799003",
      closesAt: FUTURE,
    });
    expect((await service.maskedPublicTenders(std.auth)).map((r) => r.number)).toEqual([listing.number]);
    await expect(service.maskedPublicTender(std.auth, "ROT-799002")).rejects.toMatchObject({ status: 404 });
    await expect(service.maskedPublicTender(std.auth, "ROT-799003")).rejects.toMatchObject({ status: 404 });

    blocks.blockedCompanyIds.mockResolvedValue([owner.company.id]);
    expect(await service.maskedPublicTenders(std.auth)).toEqual([]);
    await expect(service.maskedPublicTender(std.auth, listing.number!)).rejects.toMatchObject({ status: 404 });
  });

  it("vitrini KAPALI alıcı (publicListingsEnabled=false): talep maskeli de görünmez, görünüm 404 — herkese açık uçla aynı", async () => {
    const { service } = makeService();
    const { owner, listing } = await publicListing();
    const std = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART" });
    expect((await service.maskedPublicTenders(std.auth)).map((r) => r.number)).toEqual([listing.number]);

    await prisma.company.update({ where: { id: owner.company.id }, data: { publicListingsEnabled: false } });
    const pub = new PublicMarketplaceService(prisma as unknown as PrismaBypassService);
    await expect(pub.getByNumber(listing.number!)).rejects.toMatchObject({ status: 404 });
    expect(await service.maskedPublicTenders(std.auth)).toEqual([]);
    await expect(service.maskedPublicTender(std.auth, listing.number!)).rejects.toMatchObject({ status: 404 });
  });

  it("kapılar DEĞİŞMEDİ: maskeli talebe teklif 403, tam detay 403 TIER_REQUIRED, belgeler kapalı", async () => {
    const { service } = makeService();
    const { owner, listing, item } = await publicListing();
    const std = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART" });
    expect((await service.maskedPublicTenders(std.auth)).map((r) => r.number)).toEqual([listing.number]);

    await expect(service.placeBid(std.auth, listing.id, bid(item.id))).rejects.toMatchObject({ status: 403 });
    await expect(service.getOne(std.auth, listing.id)).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: "TIER_REQUIRED" }),
    });
    await prisma.listingDocument.create({
      data: {
        listingId: listing.id,
        uploadedByCompanyId: owner.company.id,
        kind: "TEKNIK_SARTNAME",
        key: `listing-docs/${listing.id}/sartname.pdf`,
        fileName: "sartname.pdf",
        mimeType: "application/pdf",
      } as Prisma.ListingDocumentUncheckedCreateInput,
    });
    const docs = makeDocsService();
    await expect(docs.service.list(std.auth, listing.id)).rejects.toThrow();
    expect(docs.storage.generatePresignedGet).not.toHaveBeenCalled();
  });

  it("SILVER: maskeli liste boş (tam satır görür); görünüm tam detaya yönlendirir", async () => {
    const { service } = makeService();
    const { listing } = await publicListing();
    const silver = await makeCompanyWithUser(prisma, { country: "TR", tier: "SILVER" });
    expect(await service.maskedPublicTenders(silver.auth)).toEqual([]);
    await expect(service.maskedPublicTender(silver.auth, listing.number!)).resolves.toEqual({
      masked: false,
      id: listing.id,
    });
  });

  it("görünüm: bilinmeyen ya da biçimsiz numara 404", async () => {
    const { service } = makeService();
    const std = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART" });
    await expect(service.maskedPublicTender(std.auth, "ROT-000000")).rejects.toMatchObject({ status: 404 });
    await expect(service.maskedPublicTender(std.auth, "x' OR 1=1")).rejects.toMatchObject({ status: 404 });
  });
});
