/**
 * HIDDEN SEGMENTS in the panel API (owner rule 2026-10-09).
 *
 * "A category that is not on the home page must not be shown in requests,
 * products or anywhere else." The home page draws every VISIBLE segment, so a
 * category under a hidden segment (`HIDDEN_SEGMENTS`, 31 today, 46 and 77 the
 * newest) is never shown or offered - not to the record's own owner either.
 * LEGACY records (saved before the segment was hidden) stay; only their hidden
 * category disappears from every read.
 *
 * This spec is the contract of the panel side (audit round 5):
 *  - F03 / F04  request lists (supplier "Open requests", buyer "My requests")
 *  - F23        request detail, owner and bidder
 *  - F14 / F15  request edit (stored codes never block) and publish of a draft
 *  - F13 / F21  product category gate (only when the value changes), import
 *  - F08 / F20  panel product page, `?category=<hidden>` on search and facets
 *  - F09        panel company profile
 *  - F19        dashboard breakdowns
 *  - DATA-09    affinity builder
 *  - R2         (review) an edit of a PUBLISHED request keeps its hidden codes
 *  - R3         (review) `?category=<hidden>` on the legacy member directory
 *
 * Fixtures are legacy rows written straight to the database with a 46xxxxxx
 * or 10xxxxxx code, exactly what the records of that time look like.
 * Matching (who is notified, category match, relevance) keeps reading the full
 * stored codes - asserted where a display change could have dragged it along.
 */
import { BadRequestException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Prisma } from "@prisma/client";
import { isHiddenCategory } from "@rothern/shared";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyAffinityService } from "../../src/modules/company-affinity/company-affinity.service";
import { CompanyApprovalsService } from "../../src/modules/company-approvals/company-approvals.service";
import { CompanyBlocksService } from "../../src/modules/company-blocks/company-blocks.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { CompanyDirectoryService } from "../../src/modules/company-directory/company-directory.service";
import { breakdownSegmentOf } from "../../src/modules/company-dashboard/category-breakdown";
import { CompanyDashboardService } from "../../src/modules/company-dashboard/company-dashboard.service";
import { DashboardAnalyticsService } from "../../src/modules/company-dashboard/dashboard-analytics.service";
import { CompanyItemsService } from "../../src/modules/company-items/company-items.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";
import { prisma, truncateAll } from "./test-db";

const DAY = 86_400_000;
const FUTURE = new Date(Date.now() + 7 * DAY);

/** Visible branch. */
const SEG = "31000000";
const FAM = "31160000";
const CLS = "31161500";
const CLS2 = "31161600";
/** Hidden on 2026-10-09 (segment 46). */
const HID_SEG = "46000000";
const HID_FAM = "46180000";
const HID_CLS = "46181500";
const HID_CLS2 = "46181700";
/** Hidden since 2026-09-19 (segment 10). */
const OLD_SEG = "10000000";
const OLD_CLS = "10101500";

const HID_SEG_NAME = "Kolluk, Ulusal Güvenlik ve Emniyet Ekipmanları";
const HID_CLS_NAME = "Koruyucu giysiler";

/** No hidden code and no hidden name anywhere in a response. */
function expectNoHiddenCategory(payload: unknown) {
  const json = JSON.stringify(payload);
  expect(json).not.toMatch(/"(46|10)\d{6}"/);
  expect(json).not.toContain(HID_SEG_NAME);
  expect(json).not.toContain(HID_CLS_NAME);
  expect(json).not.toContain("Güvenlik ve koruma");
  expect(json).not.toContain("Çiftlik hayvanları");
}

async function seedCatalogue() {
  const rows: Array<[string, string, number, string | null]> = [
    [SEG, "İmalat Bileşenleri", 1, null],
    [FAM, "Bağlantı elemanları", 2, SEG],
    [CLS, "Vidalar", 3, FAM],
    [CLS2, "Cıvatalar", 3, FAM],
    [HID_SEG, HID_SEG_NAME, 1, null],
    [HID_FAM, "Güvenlik ve koruma", 2, HID_SEG],
    [HID_CLS, HID_CLS_NAME, 3, HID_FAM],
    [HID_CLS2, "Koruyucu ayakkabılar", 3, HID_FAM],
    [OLD_SEG, "Canlı Bitki ve Hayvan Malzemeleri", 1, null],
    ["10100000", "Canlı hayvanlar", 2, OLD_SEG],
    [OLD_CLS, "Çiftlik hayvanları", 3, "10100000"],
  ];
  for (const [code, nameTr, level, parentId] of rows) {
    await prisma.category.create({
      data: {
        id: code, code, nameTr, keywords: "", searchText: nameTr.toLowerCase(),
        level, parentId, isActive: true, sortOrder: 0, inDiscovery: true,
      },
    });
  }
}

beforeAll(() => {
  // The fixture codes ARE hidden - if the single source ever drops them, this
  // spec would silently test nothing.
  expect([HID_SEG, HID_CLS, HID_CLS2, OLD_SEG, OLD_CLS].every((c) => isHiddenCategory(c))).toBe(true);
  expect([SEG, FAM, CLS, CLS2].some((c) => isHiddenCategory(c))).toBe(false);
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
  await seedCatalogue();
});

type Party = Awaited<ReturnType<typeof makeCompanyWithUser>>;

/** A request written before its category was hidden. */
function legacyListing(owner: Party, categoryIds: string[], over: Record<string, unknown> = {}) {
  return makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    format: "RFQ",
    closesAt: FUTURE,
    categoryIds,
    ...over,
  });
}

/* ------------------------------------------------------------------ */
/* REQUEST LISTS AND DETAIL                                             */
/* ------------------------------------------------------------------ */

describe("request lists and detail - a hidden category is not shown, the request stays", () => {
  it("F04 buyer 'My requests': no name, no raw code, no count for the hidden category - also for the owner", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const mixed = await legacyListing(owner, [HID_CLS, CLS, OLD_CLS, CLS2], { title: "Karışık" });
    const onlyHidden = await legacyListing(owner, [HID_CLS, HID_CLS2, OLD_CLS], { title: "Yalnız gizli" });

    const rows = (await service.listTenders(owner.company.id, "ALIM")) as Array<{
      id: string;
      categories: { code: string; name: string }[];
      extraCategoryCount: number;
      categoryIds: string[];
    }>;
    const a = rows.find((r) => r.id === mixed.id)!;
    const b = rows.find((r) => r.id === onlyHidden.id)!;

    // The legacy requests are still listed.
    expect(rows).toHaveLength(2);
    expect(a.categories).toEqual([
      { code: CLS, name: "Vidalar" },
      { code: CLS2, name: "Cıvatalar" },
    ]);
    // 4 stored codes, 2 visible -> nothing "extra" (the old count said +2).
    expect(a.extraCategoryCount).toBe(0);
    expect(a.categoryIds).toEqual([CLS, CLS2]);
    expect(b.categories).toEqual([]);
    expect(b.extraCategoryCount).toBe(0);
    expect(b.categoryIds).toEqual([]);
    expectNoHiddenCategory(rows);
    // Nothing was rewritten: the record keeps its stored codes.
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: onlyHidden.id } })).categoryIds).toEqual([
      HID_CLS, HID_CLS2, OLD_CLS,
    ]);
  });

  it("F03 supplier 'Open requests': hidden category not shown; category match and relevance still read the stored codes", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { sellerCategoryIds: [HID_SEG] },
    });
    // Stored order matters: the first two STORED codes are the affinity keys.
    const listing = await legacyListing(owner, [HID_CLS, CLS, HID_CLS2]);
    await prisma.companyAffinity.create({
      data: { companyId: seller.company.id, categoryId: HID_CLS, sellScore: 42, buyScore: 0, reasons: { bids: 3 } },
    });

    const rows = (await service.sellerTenders(seller.auth, "ALIM")) as unknown as Array<{
      id: string;
      categories: { code: string; name: string }[];
      extraCategoryCount: number;
      categoryMatch: boolean;
      matchScore: number;
    }>;
    const row = rows.find((r) => r.id === listing.id)!;

    expect(row).toBeDefined();
    expect(row.categories).toEqual([{ code: CLS, name: "Vidalar" }]);
    expect(row.extraCategoryCount).toBe(0);
    expectNoHiddenCategory(rows);
    // MATCHING IS UNCHANGED: the seller declared segment 46 -> still a category
    // match; the affinity score of the stored hidden code still ranks the row.
    expect(row.categoryMatch).toBe(true);
    expect(row.matchScore).toBe(42);
    // Internal helper fields do not leak.
    expect(Object.keys(row).some((k) => k.startsWith("_"))).toBe(false);
  });

  it("F23 request detail: owner and bidder both get the visible codes only", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const bidder = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await legacyListing(owner, [HID_CLS, CLS, OLD_CLS]);
    await makeItem(prisma, listing.id);

    const asOwner = (await service.getOne(owner.auth, listing.id)) as {
      isOwner: boolean;
      categoryIds: string[];
      hasRetiredCategory?: boolean;
    };
    const asBidder = (await service.getOne(bidder.auth, listing.id)) as {
      isOwner: boolean;
      categoryIds: string[];
      hasRetiredCategory?: boolean;
    };
    // The owner learns THAT a retired category is stored (edit form note), never which one;
    // the bidder gets no such flag.
    expect(asOwner.hasRetiredCategory).toBe(true);
    expect(asBidder).not.toHaveProperty("hasRetiredCategory");

    expect(asOwner.isOwner).toBe(true);
    expect(asOwner.categoryIds).toEqual([CLS]);
    expect(asBidder.isOwner).toBe(false);
    expect(asBidder.categoryIds).toEqual([CLS]);
    expectNoHiddenCategory(asOwner);
    expectNoHiddenCategory(asBidder);
  });

  it("masked rows and masked detail of a free member: chips come from visible categories only", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    await prisma.company.update({ where: { id: owner.company.id }, data: { slug: "maskeli-alici" } });
    const viewer = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    const listing = await legacyListing(owner, [HID_CLS, CLS], {
      number: "ROT-460001",
      publishedAt: new Date(),
      title: "Maskeli eski talep",
    });
    await makeItem(prisma, listing.id);

    const rows = await service.maskedPublicTenders(viewer.auth);
    const detail = await service.maskedPublicTender(viewer.auth, "ROT-460001");

    // The legacy request is still offered to the free member.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.categories.map((c) => c.id)).toEqual([CLS]);
    expect((detail as { categories: { id: string }[] }).categories.map((c) => c.id)).toEqual([CLS]);
    expectNoHiddenCategory(rows);
    expectNoHiddenCategory(detail);
  });

  it("approval detail (decision context): the request's hidden category is not sent", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const supplier = await makeCompanyWithUser(prisma, {});
    const listing = await legacyListing(owner, [HID_CLS, CLS], { status: "IN_AWARD" });
    const item = await makeItem(prisma, listing.id);
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: supplier.company.id,
      createdById: supplier.user.id,
      amount: 100,
      items: [{ itemId: item.id, unitPrice: 100 }],
    });
    const req = await prisma.approvalRequest.create({
      data: {
        companyId: owner.company.id,
        listingId: listing.id,
        type: "LISTING_AWARD",
        status: "PENDING",
        amount: 100,
        currency: "TRY",
        payload: { kind: "full", bidId: bid.id },
        createdById: owner.user.id,
        steps: { create: [{ approverUserId: owner.user.id, order: 1, status: "PENDING" }] },
      },
    });
    const approvals = new CompanyApprovalsService(
      prisma as never,
      prisma as never,
      new EventEmitter2(),
      { send: jest.fn() } as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      new NotificationService(prisma as never),
      new AuditService(prisma as never),
    );

    const d = await approvals.getDetail(owner.auth, req.id);

    expect(d.listing.categoryIds).toEqual([CLS]);
    expectNoHiddenCategory(d);
  });
});

/* ------------------------------------------------------------------ */
/* REQUEST EDIT AND PUBLISH                                             */
/* ------------------------------------------------------------------ */

describe("request edit (F14) and publish of a draft (F15)", () => {
  const body = (over: Record<string, unknown> = {}) =>
    ({
      type: "ALIM",
      format: "RFQ",
      visibility: "PUBLIC",
      title: "Düzenlenmiş talep",
      closesAt: FUTURE.toISOString(),
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY"],
      items: [{ name: "Kalem", quantity: 1, unit: "adet" }],
      ...over,
    }) as never;

  const stored = async (id: string) => (await prisma.listing.findUniqueOrThrow({ where: { id } })).categoryIds;

  it("an edit that sends the stored hidden code back is saved (it used to answer 400 on every edit)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const listing = await legacyListing(owner, [HID_CLS, CLS]);

    await service.updateListing(owner.auth, listing.id, body({ categoryIds: [HID_CLS, CLS] }));

    const row = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.title).toBe("Düzenlenmiş talep");
    expect(row.categoryIds).toEqual([HID_CLS, CLS]);
  });

  it("a NEWLY added hidden code is still rejected - on a legacy request too; nothing is written", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const listing = await legacyListing(owner, [HID_CLS, CLS]);

    for (const added of [HID_CLS2, OLD_CLS]) {
      const err = await service
        .updateListing(owner.auth, listing.id, body({ categoryIds: [HID_CLS, added] }))
        .then(() => null, (e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        i18nKey: "api.companyListings.gecersizKategoriSecimi",
      });
    }
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.categoryIds).toEqual([HID_CLS, CLS]);
    expect(row.title).not.toBe("Düzenlenmiş talep");
  });

  it("a newly added code is fully gated (unknown, family level) while the stored codes pass", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const listing = await legacyListing(owner, [HID_CLS]);

    await expect(
      service.updateListing(owner.auth, listing.id, body({ categoryIds: [HID_CLS, "31999900"] })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.updateListing(owner.auth, listing.id, body({ categoryIds: [HID_CLS, FAM] })),
    ).rejects.toThrow(BadRequestException);
    // A visible class next to the stored hidden one is fine.
    await service.updateListing(owner.auth, listing.id, body({ categoryIds: [HID_CLS, CLS2] }));
    expect(await stored(listing.id)).toEqual([HID_CLS, CLS2]);
  });

  /** What the edit form sends back: it is seeded from the owner detail (visible codes only). */
  const formCategoryIds = async (service: ReturnType<typeof makeService>["service"], owner: Party, id: string) =>
    ((await service.getOne(owner.auth, id)) as { categoryIds: string[] }).categoryIds;

  /** The supplier's row of that request in "Open requests". */
  const sellerRow = async (service: ReturnType<typeof makeService>["service"], seller: Party, id: string) =>
    ((await service.sellerTenders(seller.auth, "ALIM")) as unknown as Array<{
      id: string;
      title: string;
      categoryMatch: boolean;
      categories: { code: string }[];
    }>).find((r) => r.id === id)!;

  it("R2 PUBLISHED request: an unrelated edit keeps the stored hidden codes (the owner cannot see them, so cannot keep them) - category match unchanged", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({ where: { id: seller.company.id }, data: { sellerCategoryIds: [HID_SEG] } });
    // The reviewed scenario: an OPEN public request with nothing but a hidden category.
    const onlyHidden = await legacyListing(owner, [HID_CLS]);
    // Stored ORDER matters as well (the first two stored codes are the relevance keys).
    const mixed = await legacyListing(owner, [HID_CLS, HID_CLS2, CLS]);
    await makeItem(prisma, onlyHidden.id);
    await makeItem(prisma, mixed.id);
    expect((await sellerRow(service, seller, onlyHidden.id)).categoryMatch).toBe(true);

    expect(await formCategoryIds(service, owner, onlyHidden.id)).toEqual([]);
    expect(await formCategoryIds(service, owner, mixed.id)).toEqual([CLS]);
    // The owner changes the title only.
    await service.updateListing(owner.auth, onlyHidden.id, body({ categoryIds: await formCategoryIds(service, owner, onlyHidden.id) }));
    await service.updateListing(owner.auth, mixed.id, body({ categoryIds: await formCategoryIds(service, owner, mixed.id) }));

    expect(await stored(onlyHidden.id)).toEqual([HID_CLS]);
    expect(await stored(mixed.id)).toEqual([HID_CLS, HID_CLS2, CLS]);
    // The edit itself was written, and matching still reads the stored codes.
    const after = await sellerRow(service, seller, onlyHidden.id);
    expect(after.title).toBe("Düzenlenmiş talep");
    expect(after.categoryMatch).toBe(true);
    expect((await sellerRow(service, seller, mixed.id)).categoryMatch).toBe(true);
    // Display is unchanged: nobody is shown the hidden category, the owner included.
    expect(after.categories).toEqual([]);
    expect((await sellerRow(service, seller, mixed.id)).categories.map((c) => c.code)).toEqual([CLS]);
    expectNoHiddenCategory(await service.getOne(owner.auth, mixed.id));
    expect(await formCategoryIds(service, owner, mixed.id)).toEqual([CLS]);
  });

  it("R2 PUBLISHED request: the owner changes or removes the visible category - the new choice is written first, the hidden codes stay", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const changed = await legacyListing(owner, [HID_CLS, CLS, HID_CLS2]);
    const emptied = await legacyListing(owner, [HID_CLS, CLS]);

    await service.updateListing(owner.auth, changed.id, body({ categoryIds: [CLS2] }));
    await service.updateListing(owner.auth, emptied.id, body({ categoryIds: [] }));

    expect(await stored(changed.id)).toEqual([CLS2, HID_CLS, HID_CLS2]);
    expect(await stored(emptied.id)).toEqual([HID_CLS]);
    // A request without hidden codes is written exactly as submitted.
    const plain = await legacyListing(owner, [CLS]);
    await service.updateListing(owner.auth, plain.id, body({ categoryIds: [CLS2] }));
    expect(await stored(plain.id)).toEqual([CLS2]);
  });

  it("DRAFT: saving the form (visible codes only) drops the hidden legacy code - the publish gate needs it to leave", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const draft = await legacyListing(owner, [HID_CLS, CLS], { status: "DRAFT" });
    await makeItem(prisma, draft.id);

    await service.updateListing(
      owner.auth,
      draft.id,
      body({ asDraft: true, categoryIds: await formCategoryIds(service, owner, draft.id) }),
    );

    expect(await stored(draft.id)).toEqual([CLS]);
  });

  it("a NEW request cannot carry a hidden code (create gate unchanged)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    await expect(
      service.create(owner.auth, body({ asDraft: true, categoryIds: [HID_CLS] })),
    ).rejects.toThrow(BadRequestException);
    expect(await prisma.listing.count()).toBe(0);
  });

  it("F15 a draft that still carries a hidden category cannot be published; the message asks for a current category", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const draft = await legacyListing(owner, [HID_CLS, CLS], { status: "DRAFT" });
    await makeItem(prisma, draft.id);

    const err = await service.publishListing(owner.auth, draft.id).then(() => null, (e: unknown) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({
      i18nKey: "api.companyListings.taslakKategorisiGuncelDegil",
      code: "LISTING_CATEGORY_NOT_CURRENT",
    });
    expect((err as BadRequestException).message).toBe(
      "Bu taslaktaki bir kategori artık kullanılmıyor. Talebi düzenleyip güncel bir kategori seçin ve kaydedin; ardından yeniden yayınlayın.",
    );
    // The message does not name the hidden category.
    expect((err as BadRequestException).message).not.toContain(HID_CLS_NAME);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("DRAFT");

    // The way out the message describes: save the edit form, publish again.
    const detail = (await service.getOne(owner.auth, draft.id)) as { categoryIds: string[] };
    await service.updateListing(owner.auth, draft.id, body({ asDraft: true, categoryIds: detail.categoryIds }));
    const published = await service.publishListing(owner.auth, draft.id);
    expect(published.status).toBe("OPEN");
    expect(await stored(draft.id)).toEqual([CLS]);
  });

  it("a draft in a visible category is published as before", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const draft = await legacyListing(owner, [CLS], { status: "DRAFT" });
    await makeItem(prisma, draft.id);
    expect((await service.publishListing(owner.auth, draft.id)).status).toBe("OPEN");
  });
});

/* ------------------------------------------------------------------ */
/* PRODUCTS                                                             */
/* ------------------------------------------------------------------ */

const items = () =>
  new CompanyItemsService(prisma as unknown as PrismaService, { log: jest.fn() } as never, {} as never);

/** Content that passes the publish gate (everything except the category). */
const COMPLETE = {
  description: "x".repeat(120),
  images: ["a.webp"],
  keywords: ["koruyucu"],
};

async function legacyProduct(owner: Party, over: Record<string, unknown> = {}) {
  return prisma.companyItem.create({
    data: {
      companyId: owner.company.id,
      createdById: owner.user.id,
      name: "Koruyucu iş elbisesi",
      unit: "adet",
      categoryId: HID_CLS,
      ...COMPLETE,
      ...over,
    },
  });
}

const categoryOf = async (id: string) => (await prisma.companyItem.findUniqueOrThrow({ where: { id } })).categoryId;

describe("product category gate (F13) - only when the value changes", () => {
  it("a NEW product cannot be created under a hidden segment or with a code that is not in the catalogue; no orphan draft is left", async () => {
    const owner = await makeCompanyWithUser(prisma, {});

    for (const categoryId of [HID_CLS, OLD_CLS, "31999900", "abc"]) {
      const err = await items()
        .createProduct(owner.auth, { name: `Ürün ${categoryId}`, categoryId })
        .then(() => null, (e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        i18nKey: "api.companyItems.kategoriGecersizYaDaGuncelDegil",
      });
    }
    await expect(
      items().create(owner.auth, { name: "Kalem", unit: "adet", categoryId: HID_CLS }),
    ).rejects.toThrow(BadRequestException);
    expect(await prisma.companyItem.count()).toBe(0);

    // A visible catalogue code is accepted on both paths.
    const product = await items().createProduct(owner.auth, { name: "Vida M8", categoryId: CLS });
    expect(product.categoryId).toBe(CLS);
    const item = await items().create(owner.auth, { name: "Cıvata M8", unit: "adet", categoryId: CLS2 });
    expect(item.categoryId).toBe(CLS2);
  });

  it("a legacy product stays editable: the unchanged stored code passes, an empty value keeps it, a CHANGE is gated", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const product = await legacyProduct(owner);

    // The form sends the stored value back.
    await items().updateShowcase(owner.auth, product.id, { categoryId: HID_CLS, description: "y".repeat(130) });
    expect(await categoryOf(product.id)).toBe(HID_CLS);
    // The form does not show the hidden category and sends nothing for it.
    await items().updateShowcase(owner.auth, product.id, { categoryId: null, description: "z".repeat(130) });
    expect(await categoryOf(product.id)).toBe(HID_CLS);
    // Changing it to another hidden code is a NEW value -> rejected.
    await expect(
      items().updateShowcase(owner.auth, product.id, { categoryId: HID_CLS2 }),
    ).rejects.toThrow(/Seçilen kategori geçersiz ya da artık kullanılmıyor/);
    expect(await categoryOf(product.id)).toBe(HID_CLS);
    // Replacing it with a current category works.
    await items().updateShowcase(owner.auth, product.id, { categoryId: CLS });
    expect(await categoryOf(product.id)).toBe(CLS);
  });

  it("catalogue item path (PATCH company/items/:id): same rule", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const product = await legacyProduct(owner, { description: null, images: [], keywords: [] });

    await items().update(owner.auth, product.id, { name: "Yeni ad", categoryId: HID_CLS });
    expect(await categoryOf(product.id)).toBe(HID_CLS);
    await items().update(owner.auth, product.id, { name: "Yeni ad 2", categoryId: "" });
    expect(await categoryOf(product.id)).toBe(HID_CLS);
    await expect(
      items().update(owner.auth, product.id, { categoryId: OLD_CLS }),
    ).rejects.toThrow(BadRequestException);
    await items().update(owner.auth, product.id, { categoryId: CLS });
    expect(await categoryOf(product.id)).toBe(CLS);
    // A VISIBLE stored category can still be cleared on this path.
    await items().update(owner.auth, product.id, { categoryId: "" });
    expect(await categoryOf(product.id)).toBeNull();
  });

  it("a legacy PUBLISHED product is not blocked: content edit and re-review keep working, on both paths", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const product = await legacyProduct(owner, {
      isPublic: true,
      publishedAt: new Date(),
      reviewStatus: "APPROVED",
      slug: "koruyucu-is-elbisesi",
    });

    // Showcase path: description changes, category unchanged -> re-review, stays public.
    const saved = await items().updateShowcase(owner.auth, product.id, {
      categoryId: HID_CLS,
      ...COMPLETE,
      description: "q".repeat(140),
    });
    expect(saved.reviewStatus).toBe("PENDING");
    expect(saved.isPublic).toBe(true);
    expect(saved.publishBlockers).toEqual([]);

    await prisma.companyItem.update({ where: { id: product.id }, data: { reviewStatus: "APPROVED" } });
    // Catalogue path with an EMPTY category (the form cannot show the hidden
    // one): without the keep rule this answered "Kategori seçilmeli".
    await items().update(owner.auth, product.id, { name: "Koruyucu iş elbisesi (yeni)", categoryId: "" });
    expect(await categoryOf(product.id)).toBe(HID_CLS);

    await prisma.companyItem.update({ where: { id: product.id }, data: { reviewStatus: "APPROVED" } });
    // Sending an already public product for review again is not "publishing a draft".
    const again = await items().publish(owner.auth, product.id);
    expect(again.reviewStatus).toBe("PENDING");
  });

  it("a DRAFT that still carries a hidden category cannot be sent for review; the text asks for a current category", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const draft = await legacyProduct(owner);

    const showcase = await items().getShowcase(owner.auth, draft.id);
    expect(showcase.publishBlockers).toEqual(["Kategori artık kullanılmıyor, güncel bir kategori seçilmeli"]);
    expect(showcase.completion.missing.map((m) => m.key)).toContain("category");

    const err = await items().publish(owner.auth, draft.id).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe(
      "Onaya gönderilemedi — Kategori artık kullanılmıyor, güncel bir kategori seçilmeli",
    );
    expect((await prisma.companyItem.findUniqueOrThrow({ where: { id: draft.id } })).reviewStatus).toBe("DRAFT");

    // With a current category the same draft goes to the review queue.
    await items().updateShowcase(owner.auth, draft.id, { categoryId: CLS, ...COMPLETE });
    expect((await items().publish(owner.auth, draft.id)).reviewStatus).toBe("PENDING");
  });

  it("F21 import from a request: new catalogue items get the first VISIBLE category, never the hidden one", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const mixed = await legacyListing(owner, [HID_CLS, CLS2, CLS]);
    await makeItem(prisma, mixed.id, { name: "Karışık talebin kalemi" });
    const onlyHidden = await legacyListing(owner, [HID_CLS, OLD_CLS]);
    await makeItem(prisma, onlyHidden.id, { name: "Gizli talebin kalemi" });

    expect(await items().importFromListing(owner.auth, mixed.id)).toMatchObject({ added: 1 });
    expect(await items().importFromListing(owner.auth, onlyHidden.id)).toMatchObject({ added: 1 });

    const rows = await prisma.companyItem.findMany({ select: { name: true, categoryId: true } });
    expect(rows.find((r) => r.name === "Karışık talebin kalemi")?.categoryId).toBe(CLS2);
    expect(rows.find((r) => r.name === "Gizli talebin kalemi")?.categoryId).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* PANEL PRODUCT DISCOVERY                                              */
/* ------------------------------------------------------------------ */

let sellerSeq = 0;
async function seedSeller(product: Record<string, unknown>) {
  sellerSeq += 1;
  const seller = await makeCompanyWithUser(prisma, {});
  const company = await prisma.company.update({
    where: { id: seller.company.id },
    data: { slug: `satici-${sellerSeq}`, publicEnabled: true, city: "İstanbul" },
  });
  const item = await prisma.companyItem.create({
    data: {
      companyId: company.id,
      createdById: seller.user.id,
      name: `Ürün ${sellerSeq}`,
      unit: "adet",
      slug: `urun-${sellerSeq}`,
      ...COMPLETE,
      isPublic: true,
      reviewStatus: "APPROVED",
      publishedAt: new Date(),
      searchText: `urun ${sellerSeq}`,
      ...product,
    },
  });
  return { company, item };
}

describe("panel product discovery", () => {
  it("F08 panel product page: a legacy product is shown without its hidden category (no name, no code)", async () => {
    const legacy = await seedSeller({ categoryId: HID_CLS });
    const current = await seedSeller({ categoryId: CLS });
    const buyer = await makeCompanyWithUser(prisma, {});
    const viewer = { companyId: buyer.company.id, userId: buyer.user.id } as never;

    const a = await items().discoverProduct(viewer, legacy.company.slug as string, legacy.item.slug as string);
    const b = await items().discoverProduct(viewer, current.company.slug as string, current.item.slug as string);

    // The product itself is still there.
    expect(a.product.name).toBe(legacy.item.name);
    expect(a.product.category).toBeNull();
    expect(a.product.categoryId).toBeNull();
    expectNoHiddenCategory(a);
    // A visible category is resolved as before.
    expect(b.product.category).toEqual({ id: CLS, name: "Vidalar" });
    expect(b.product.categoryId).toBe(CLS);
  });

  it("F20 `category=<hidden code>` behaves as if no category filter was given (search, facets, strip, own list)", async () => {
    await seedSeller({ categoryId: HID_CLS });
    await seedSeller({ categoryId: CLS });
    const buyer = await makeCompanyWithUser(prisma, {});
    const viewer = { companyId: buyer.company.id, userId: buyer.user.id } as never;

    for (const hidden of [HID_SEG, HID_CLS, OLD_SEG]) {
      const unfiltered = await items().discoverSearch(viewer, {});
      const search = await items().discoverSearch(viewer, { category: hidden });
      expect(search.total).toBe(unfiltered.total);
      expect(search.total).toBe(2);
      expectNoHiddenCategory(search);

      const facets = await items().discoverFacets(viewer, { category: hidden });
      expect(facets.selectedCategory).toBeNull();
      expect(facets.subCategories).toEqual([]);
      // Counts are those of the unfiltered index; the hidden segment is not an option.
      expect(facets.categories).toEqual([{ id: SEG, name: "İmalat Bileşenleri", level: 1, count: 1 }]);
      expectNoHiddenCategory(facets);

      const strip = await items().discoverProducts(viewer, { category: hidden });
      expect(strip).toHaveLength(2);
      expectNoHiddenCategory(strip);
    }
    // A visible code still filters.
    expect((await items().discoverSearch(viewer, { category: SEG })).total).toBe(1);
    expect(await items().discoverProducts(viewer, { category: SEG })).toHaveLength(1);
    const visible = await items().discoverFacets(viewer, { category: SEG });
    expect(visible.selectedCategory).toEqual({ id: SEG, name: "İmalat Bileşenleri", level: 1 });

    // The company's own catalogue list: a hidden `categoryId` is not a filter either.
    const owner = await makeCompanyWithUser(prisma, {});
    await legacyProduct(owner);
    await legacyProduct(owner, { name: "Vida", categoryId: CLS });
    expect((await items().list(owner.company.id, { categoryId: HID_CLS })).total).toBe(2);
    expect((await items().list(owner.company.id, { categoryId: CLS })).total).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* MEMBER DIRECTORY (legacy endpoint)                                   */
/* ------------------------------------------------------------------ */

describe("R3 member directory `GET company/directory` (still mounted, any signed-in member)", () => {
  it("`category=<hidden code>` behaves as if no category filter was given; a visible code still filters", async () => {
    const hidden = await makeCompanyWithUser(prisma, { name: "Emniyet Ekipman" });
    const visible = await makeCompanyWithUser(prisma, { name: "Vida Sanayi" });
    await prisma.company.update({
      where: { id: hidden.company.id },
      data: { publicEnabled: true, slug: "emniyet-ekipman", sellerCategoryIds: [HID_SEG], sellerSubCategoryIds: [HID_FAM, HID_CLS] },
    });
    await prisma.company.update({
      where: { id: visible.company.id },
      data: { publicEnabled: true, slug: "vida-sanayi", sellerCategoryIds: [SEG], buyerSubCategoryIds: [FAM, CLS] },
    });
    const directory = new CompanyDirectoryService(prisma as never);
    const names = async (q: Parameters<CompanyDirectoryService["listPublic"]>[0]) =>
      (await directory.listPublic(q)).items.map((c) => c.name).sort();
    const both = ["Emniyet Ekipman", "Vida Sanayi"];

    expect(await names({})).toEqual(both);
    // A hidden code must not single out the companies that declared the hidden
    // segment: main axis, family, class, and a segment hidden earlier (10).
    for (const code of [HID_SEG, HID_FAM, HID_CLS, OLD_SEG]) {
      expect(await names({ category: code })).toEqual(both);
    }
    // A visible code still filters, on every one of the four declared arrays.
    expect(await names({ category: SEG })).toEqual(["Vida Sanayi"]);
    expect(await names({ category: CLS })).toEqual(["Vida Sanayi"]);
    // The other filters are not affected by a hidden category next to them.
    expect(await names({ category: HID_SEG, q: "vida" })).toEqual(["Vida Sanayi"]);
  });
});

/* ------------------------------------------------------------------ */
/* PANEL COMPANY PROFILE                                                */
/* ------------------------------------------------------------------ */

describe("F09 panel company profile", () => {
  it("declared categories and the open request rows carry visible categories only", async () => {
    const audit = new AuditService(prisma as never);
    const service = new CompanyConnectionsService(
      prisma as never,
      prisma as never,
      new CompanyBlocksService(prisma as never, audit),
      { send: jest.fn() } as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      { pushToCompany: jest.fn(), pushToUser: jest.fn() } as never,
      audit,
    );
    const viewer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const target = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({
      where: { id: target.company.id },
      data: {
        rothernId: "TEST-4601",
        publicEnabled: true,
        slug: "legacy-beyanli-firma",
        sellerCategoryIds: [HID_SEG, SEG],
        buyerCategoryIds: [OLD_SEG, HID_SEG],
      },
    });
    const request = await legacyListing(target, [HID_CLS, CLS]);

    const res = await service.getProfile(viewer.auth, "TEST-4601");

    expect(res.profile.categories).toEqual([{ id: SEG, name: "İmalat Bileşenleri" }]);
    const row = res.listings.find((l) => l.id === request.id)!;
    // The legacy request is still listed on the profile.
    expect(row).toBeDefined();
    expect(row.categoryIds).toEqual([CLS]);
    expectNoHiddenCategory(res);
  });
});

/* ------------------------------------------------------------------ */
/* DASHBOARD BREAKDOWNS                                                 */
/* ------------------------------------------------------------------ */

describe("F19 dashboard breakdowns by category", () => {
  it("breakdownSegmentOf: first VISIBLE category -> its segment; all hidden / none -> null", () => {
    expect(breakdownSegmentOf([CLS])).toBe(SEG);
    expect(breakdownSegmentOf([HID_CLS, CLS])).toBe(SEG);
    expect(breakdownSegmentOf([HID_CLS, OLD_CLS])).toBeNull();
    expect(breakdownSegmentOf([HID_SEG])).toBeNull();
    expect(breakdownSegmentOf([])).toBeNull();
    expect(breakdownSegmentOf(null)).toBeNull();
  });

  /** Awarded request: one item, quantity 10, target 100, winning unit price `won`. */
  async function awarded(buyer: Party, seller: Party, categoryIds: string[], won: number) {
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "AWARDED",
      primaryCurrency: "TRY",
      awardedAt: new Date(),
      categoryIds,
    });
    const item = await makeItem(prisma, listing.id, {
      quantity: new Prisma.Decimal(10),
      targetPrice: new Prisma.Decimal(100),
    });
    const bid = await prisma.listingBid.create({
      data: {
        listingId: listing.id,
        bidderCompanyId: seller.company.id,
        createdById: seller.user.id,
        amount: new Prisma.Decimal(won * 10),
        currency: "TRY",
        status: "WON",
        submittedAt: new Date(),
      },
    });
    await prisma.listingBidItem.create({
      data: { bidId: bid.id, itemId: item.id, unitPrice: new Prisma.Decimal(won) },
    });
    return listing;
  }

  it("savings tab: the amount of a hidden segment goes to the existing 'uncategorized' bucket, never under the hidden name; totals unchanged", async () => {
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    await awarded(buyer, seller, [HID_CLS], 80); // savings 200 - all categories hidden
    await awarded(buyer, seller, [OLD_CLS, CLS], 90); // savings 100 - counted under the visible one
    await awarded(buyer, seller, [CLS2], 70); // savings 300

    const dashboard = new CompanyDashboardService(
      prisma as never,
      { getRateOnDate: jest.fn().mockResolvedValue(40) } as never,
    );
    const res = await dashboard.satinalmaTasarruf({ companyId: buyer.company.id } as never);

    const byLabel = Object.fromEntries(res.categoryYear.map((r) => [r.label, r.amount]));
    expect(Object.keys(byLabel).sort()).toEqual(["Kategorisiz", "İmalat Bileşenleri"].sort());
    expect(byLabel["Kategorisiz"]).toBeCloseTo(200, 5);
    expect(byLabel["İmalat Bileşenleri"]).toBeCloseTo(400, 5);
    // Nothing is lost: the breakdown adds up to the total.
    expect(res.year.totalSavings).toBeCloseTo(600, 5);
    expect(res.categoryYear.reduce((n, r) => n + r.amount, 0)).toBeCloseTo(res.year.totalSavings, 5);
    expectNoHiddenCategory(res);
  });

  it("analytics charts (savings by category, win rate by category): no row under a hidden segment's name", async () => {
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    await awarded(buyer, seller, [HID_CLS], 80);
    await awarded(buyer, seller, [OLD_CLS, CLS], 90);
    await awarded(buyer, seller, [CLS2], 70);
    const analytics = new DashboardAnalyticsService(prisma as unknown as PrismaService);

    const sa = await analytics.satinalma(buyer.company.id, "year");
    // Savings 100 + 300 over a won volume of 900 + 700.
    expect(sa.categorySavings).toEqual([{ label: "İmalat Bileşenleri", amount: 400, percent: 25 }]);
    expectNoHiddenCategory(sa.categorySavings);

    const st = await analytics.satis(seller.company.id, "year");
    // Three decided bids; the one whose request has only hidden categories has
    // no category row, the other two are counted under the visible segment.
    expect(st.categoryWinRate).toEqual([{ label: "İmalat Bileşenleri", winPct: 100, decided: 2 }]);
    expectNoHiddenCategory(st.categoryWinRate);
  });
});

/* ------------------------------------------------------------------ */
/* DERIVED TABLE: COMPANY AFFINITY                                      */
/* ------------------------------------------------------------------ */

describe("DATA-09 affinity builder", () => {
  it("a declaration under a hidden segment is not copied into company_affinity; behaviour signals keep their stored codes", async () => {
    const company = await makeCompanyWithUser(prisma, {});
    await prisma.company.update({
      where: { id: company.company.id },
      data: {
        sellerCategoryIds: [HID_SEG, SEG],
        sellerSubCategoryIds: [HID_FAM, HID_CLS, FAM],
        buyerCategoryIds: [OLD_SEG],
        buyerSubCategoryIds: [OLD_CLS],
      },
    });
    const other = await makeCompanyWithUser(prisma, {});
    // Behaviour: a legacy request of `other` in a hidden category, `company` bid on it.
    const request = await legacyListing(other, [HID_CLS2]);
    await makeBid(prisma, {
      listingId: request.id,
      bidderCompanyId: company.company.id,
      createdById: company.user.id,
      amount: 10,
    });

    await new CompanyAffinityService(prisma as never).recomputeAll();

    const rows = await prisma.companyAffinity.findMany({ where: { companyId: company.company.id } });
    const reasonsOf = (code: string) => rows.find((r) => r.categoryId === code)?.reasons as
      | { declared?: boolean; bids?: number }
      | undefined;
    // Visible declarations are there, as before.
    expect(reasonsOf(SEG)?.declared).toBe(true);
    expect(reasonsOf(FAM)?.declared).toBe(true);
    // No row exists BECAUSE of a hidden declaration ...
    expect(rows.filter((r) => (r.reasons as { declared?: boolean } | null)?.declared).map((r) => r.categoryId).sort())
      .toEqual([SEG, FAM]);
    expect(reasonsOf(HID_CLS)).toBeUndefined();
    expect(rows.some((r) => r.categoryId.startsWith("10"))).toBe(false);
    // ... while the bid on the legacy request still counts (matching unchanged).
    expect(reasonsOf(HID_CLS2)?.bids).toBe(1);
    expect(rows.find((r) => r.categoryId === HID_CLS2)!.sellScore).toBeGreaterThan(0);
  });
});
