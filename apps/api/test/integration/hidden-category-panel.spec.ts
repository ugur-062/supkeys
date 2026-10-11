/**
 * HIDDEN CATEGORIES in the panel API (owner rule 2026-10-09).
 *
 * "A category that is not on the home page must not be shown in requests,
 * products or anywhere else." The home page draws every VISIBLE segment, so a
 * category under a hidden prefix (`HIDDEN_CATEGORY_PREFIXES`: a whole segment,
 * or since 2026-10-10 a family / class under a visible segment) is never shown
 * or offered - not to the record's own owner either.
 * LEGACY records (saved before the branch was hidden) stay; only their hidden
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
 *  - CP-01      (live re-check) the attribute form of a hidden category is not offered
 *  - CP-06      (live re-check) a draft with a hidden AND a visible category is published
 *  - CP-07      (live re-check) request templates never carry a hidden code
 *
 * Fixtures are legacy rows written straight to the database with a 53xxxxxx
 * or 10xxxxxx code (fully hidden segments), exactly what the records of that
 * time look like.
 * Matching (who is notified, category match, relevance) keeps reading the full
 * stored codes - asserted where a display change could have dragged it along.
 *
 * LAST SECTION (2026-10-10): segment 46 is VISIBLE again ("İş Güvenliği ve
 * Yangın Ekipmanları"); only its weapon / law-enforcement families (4610 ...)
 * and the class 461825 stay hidden. A hidden family and a hidden class behave
 * like a hidden segment on every surface above, 46181500 is an ordinary
 * category, and a record stored under 4610xxxx is neither listed nor counted
 * under 46000000 - nor put first as "matches your buying category" for a buyer
 * of that sector (panel product search). The request-side `categoryMatch` is
 * the notification matcher's contract and still reads the stored codes.
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
import { CompanyItemsController } from "../../src/modules/company-items/company-items.controller";
import { CompanyItemsService } from "../../src/modules/company-items/company-items.service";
import { CompanyListingTemplatesService } from "../../src/modules/company-listing-templates/company-listing-templates.service";
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
/** A fully hidden segment (53). */
const HID_SEG = "53000000";
const HID_FAM = "53100000";
const HID_CLS = "53101500";
const HID_CLS2 = "53101600";
/** Hidden since 2026-09-19 (segment 10). */
const OLD_SEG = "10000000";
const OLD_CLS = "10101500";

const HID_SEG_NAME = "Giyim, Bavul ve Kişisel Bakım Ürünleri";
const HID_FAM_NAME = "Giyim eşyaları";
const HID_CLS_NAME = "Eski iş kıyafetleri";

/**
 * Segment 46 - VISIBLE, with hidden branches below it (2026-10-10):
 *   4610 hidden FAMILY (weapons)        -> class 461015
 *   4618 visible family (personal protection)
 *        -> visible classes 461815 / 461817, hidden CLASS 461825 -> leaf 46182501
 */
const SAFETY_SEG = "46000000";
const SAFETY_SEG_NAME = "İş Güvenliği ve Yangın Ekipmanları";
const WEAPON_FAM = "46100000";
const WEAPON_FAM_NAME = "Hafif silahlar ve mühimmat";
const WEAPON_CLS = "46101500";
const WEAPON_CLS_NAME = "Ateşli silahlar";
const PPE_FAM = "46180000";
const PPE_FAM_NAME = "Kişisel güvenlik ve koruma";
const PPE_CLS = "46181500";
const PPE_CLS_NAME = "Koruyucu giysiler";
const PPE_CLS2 = "46181700";
const SPRAY_CLS = "46182500";
const SPRAY_CLS_NAME = "Kişisel güvenlik cihazları veya silahları";
const SPRAY_LEAF = "46182501";
const SPRAY_LEAF_NAME = "Biber gazı spreyleri";

/** No hidden code and no hidden name anywhere in a response. */
function expectNoHiddenCategory(payload: unknown) {
  const json = JSON.stringify(payload);
  expect(json).not.toMatch(/"(53|10)\d{6}"/);
  // Hidden branches of the visible segment 46: families 4610-4615, 4620, 4622 and class 461825.
  expect(json).not.toMatch(/"46(1[0-5]|20|22)\d{4}"|"461825\d{2}"/);
  for (const name of [
    HID_SEG_NAME,
    HID_FAM_NAME,
    HID_CLS_NAME,
    "Çiftlik hayvanları",
    WEAPON_FAM_NAME,
    WEAPON_CLS_NAME,
    SPRAY_CLS_NAME,
    SPRAY_LEAF_NAME,
  ]) {
    expect(json).not.toContain(name);
  }
}

async function seedCatalogue() {
  const rows: Array<[string, string, number, string | null]> = [
    [SEG, "İmalat Bileşenleri", 1, null],
    [FAM, "Bağlantı elemanları", 2, SEG],
    [CLS, "Vidalar", 3, FAM],
    [CLS2, "Cıvatalar", 3, FAM],
    [HID_SEG, HID_SEG_NAME, 1, null],
    [HID_FAM, HID_FAM_NAME, 2, HID_SEG],
    [HID_CLS, HID_CLS_NAME, 3, HID_FAM],
    [HID_CLS2, "Eski iş ayakkabıları", 3, HID_FAM],
    [OLD_SEG, "Canlı Bitki ve Hayvan Malzemeleri", 1, null],
    ["10100000", "Canlı hayvanlar", 2, OLD_SEG],
    [OLD_CLS, "Çiftlik hayvanları", 3, "10100000"],
    [SAFETY_SEG, SAFETY_SEG_NAME, 1, null],
    [WEAPON_FAM, WEAPON_FAM_NAME, 2, SAFETY_SEG],
    [WEAPON_CLS, WEAPON_CLS_NAME, 3, WEAPON_FAM],
    [PPE_FAM, PPE_FAM_NAME, 2, SAFETY_SEG],
    [PPE_CLS, PPE_CLS_NAME, 3, PPE_FAM],
    [PPE_CLS2, "Yüz ve baş koruması", 3, PPE_FAM],
    [SPRAY_CLS, SPRAY_CLS_NAME, 3, PPE_FAM],
    [SPRAY_LEAF, SPRAY_LEAF_NAME, 4, SPRAY_CLS],
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
  expect([WEAPON_FAM, WEAPON_CLS, SPRAY_CLS, SPRAY_LEAF].every((c) => isHiddenCategory(c))).toBe(true);
  expect([SEG, FAM, CLS, CLS2, SAFETY_SEG, PPE_FAM, PPE_CLS, PPE_CLS2].some((c) => isHiddenCategory(c))).toBe(false);
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
    // MATCHING IS UNCHANGED: the seller declared the hidden segment -> still a category
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

  it("CP-06 a draft with one hidden and one visible category is published: the hidden codes leave the stored list, the visible ones stay in order", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    // What the owner sees on the detail and in the edit form: the current
    // categories, no note - the request looks complete.
    const draft = await legacyListing(owner, [HID_CLS, CLS2, OLD_CLS, CLS], { status: "DRAFT" });
    await makeItem(prisma, draft.id);
    expect(((await service.getOne(owner.auth, draft.id)) as { categoryIds: string[] }).categoryIds).toEqual([CLS2, CLS]);

    // It used to answer 400 "select a current category" although one was shown.
    const published = await service.publishListing(owner.auth, draft.id);

    expect(published.status).toBe("OPEN");
    expect(await stored(draft.id)).toEqual([CLS2, CLS]);
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: draft.id } });
    expect(row.publishedAt).toBeInstanceOf(Date);
    expectNoHiddenCategory(published);
    // A second publish is the usual "only a draft can be published".
    await expect(service.publishListing(owner.auth, draft.id)).rejects.toThrow(BadRequestException);
  });

  it("F15 a draft with NO visible category left cannot be published; the message asks for a current category", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const draft = await legacyListing(owner, [HID_CLS, OLD_CLS], { status: "DRAFT" });
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
    // Refused = nothing written: the stored codes are still there.
    expect(await stored(draft.id)).toEqual([HID_CLS, OLD_CLS]);

    // The way out the message describes: choose a current category in the edit form, save, publish again.
    const detail = (await service.getOne(owner.auth, draft.id)) as { categoryIds: string[] };
    expect(detail.categoryIds).toEqual([]);
    await service.updateListing(owner.auth, draft.id, body({ asDraft: true, categoryIds: [CLS] }));
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

/* ------------------------------------------------------------------ */
/* ATTRIBUTE FORM (live re-check CP-01)                                 */
/* ------------------------------------------------------------------ */

describe("CP-01 the attribute form of a hidden category is not offered - also to the product's owner", () => {
  /** Field sets as the catalogue seeds them: one per segment, inherited by every code below. */
  async function seedAttributes() {
    await prisma.categoryAttribute.createMany({
      data: [
        { categoryId: HID_SEG, groupKey: "urun_grubu", nameTr: "Ürün grubu", type: "SINGLE_SELECT", options: ["Kişisel koruyucu donanım", "Yangın güvenliği"], isRequired: true, sortOrder: 0 },
        { categoryId: HID_SEG, groupKey: "sertifika", nameTr: "Sertifika", type: "MULTI_SELECT", options: ["CE", "EN 166"], isRequired: true, sortOrder: 1 },
        { categoryId: OLD_SEG, groupKey: "urun_grubu", nameTr: "Ürün grubu", type: "SINGLE_SELECT", options: ["Canlı hayvan", "Yem", "Gübre"], isRequired: true, sortOrder: 0 },
        { categoryId: SEG, groupKey: "malzeme", nameTr: "Malzeme", type: "SINGLE_SELECT", options: ["Çelik", "Paslanmaz"], isRequired: true, sortOrder: 0 },
      ],
    });
  }
  const storedAttributes = async (id: string) => (await prisma.companyItem.findUniqueOrThrow({ where: { id } })).attributes;

  it("GET company/items/attributes/:categoryId: a hidden code answers like 'no category' - no fields, no segment code", async () => {
    await seedAttributes();
    const controller = new CompanyItemsController(items());

    for (const code of [HID_SEG, HID_FAM, HID_CLS, HID_CLS2, OLD_SEG, OLD_CLS]) {
      expect(await controller.attributes(code)).toEqual([]);
    }
    // A visible category still gets its inherited fields.
    const visible = await controller.attributes(CLS);
    expect(visible.map((d) => [d.key, d.definedAt, d.isRequired])).toEqual([["malzeme", SEG, true]]);
  });

  it("owner's showcase of a legacy product: no attribute definitions and no 'required attributes' step from the hidden category; the stored values are still returned", async () => {
    await seedAttributes();
    const owner = await makeCompanyWithUser(prisma, {});
    const kept = { urun_grubu: "Canlı hayvan" };
    // A steel pipe stored under segment 10: it was offered "live animal / feed / fertilizer".
    const published = await legacyProduct(owner, {
      name: "Çelik boru",
      categoryId: OLD_CLS,
      attributes: kept,
      isPublic: true,
      publishedAt: new Date(),
      reviewStatus: "APPROVED",
      slug: "celik-boru",
    });
    // A draft under the hidden segment with none of that segment's required fields filled.
    const draft = await legacyProduct(owner, { name: "Koruyucu gözlük", categoryId: HID_CLS, attributes: Prisma.DbNull });

    const a = await items().getShowcase(owner.auth, published.id);
    const b = await items().getShowcase(owner.auth, draft.id);

    expect(a.attributeDefs).toEqual([]);
    expect(b.attributeDefs).toEqual([]);
    expect(a.attributes).toEqual(kept);
    // The rail does not ask for starred fields of a category the owner cannot see.
    expect(a.completion.missing.map((m) => m.key)).not.toContain("attributes");
    expect(b.completion.missing.map((m) => m.key)).not.toContain("attributes");
    // The draft still has its category step open (unchanged rule).
    expect(b.completion.missing.map((m) => m.key)).toContain("category");
    for (const showcase of [a, b]) {
      const json = JSON.stringify(showcase.attributeDefs) + JSON.stringify(showcase.completion);
      expect(json).not.toContain(HID_SEG);
      expect(json).not.toContain(OLD_SEG);
      expect(json).not.toMatch(/Canlı hayvan|Yem|Gübre|Kişisel koruyucu donanım|Yangın güvenliği/);
    }
  });

  it("saving a legacy product keeps its stored attribute values: the form has no fields for them and sends none back", async () => {
    await seedAttributes();
    const owner = await makeCompanyWithUser(prisma, {});
    const kept = { urun_grubu: "Kişisel koruyucu donanım", sertifika: ["CE"] };
    const product = await legacyProduct(owner, {
      attributes: kept,
      isPublic: true,
      publishedAt: new Date(),
      reviewStatus: "APPROVED",
      slug: "koruyucu-is-elbisesi",
    });

    // The form sends an empty attribute set (no field is drawn).
    const saved = await items().updateShowcase(owner.auth, product.id, { ...COMPLETE, attributes: {} });
    expect(await storedAttributes(product.id)).toEqual(kept);
    expect(saved.attributes).toEqual(kept);
    // Nothing changed in the content: the product is not sent back to review.
    expect(saved.reviewStatus).toBe("APPROVED");
    // A hand-made request cannot write a value under the hidden category's keys either.
    await items().updateShowcase(owner.auth, product.id, { attributes: { urun_grubu: "Yangın güvenliği", uydurma: "x" } });
    expect(await storedAttributes(product.id)).toEqual(kept);
    // The stored category did not move.
    expect(await categoryOf(product.id)).toBe(HID_CLS);
  });

  it("moving the product to a current category: that category's fields apply, the hidden category's values are not carried over", async () => {
    await seedAttributes();
    const owner = await makeCompanyWithUser(prisma, {});
    const product = await legacyProduct(owner, { attributes: { urun_grubu: "Kişisel koruyucu donanım" } });

    const saved = await items().updateShowcase(owner.auth, product.id, {
      categoryId: CLS,
      attributes: { malzeme: "Çelik", urun_grubu: "Kişisel koruyucu donanım" },
    });

    expect(saved.attributeDefs.map((d) => d.key)).toEqual(["malzeme"]);
    expect(await storedAttributes(product.id)).toEqual({ malzeme: "Çelik" });
  });
});

/* ------------------------------------------------------------------ */
/* REQUEST TEMPLATES (live re-check CP-07)                              */
/* ------------------------------------------------------------------ */

describe("CP-07 request templates never carry a category under a hidden segment", () => {
  const templates = () => new CompanyListingTemplatesService(prisma as unknown as PrismaService);
  const storedPayload = async (id: string) =>
    (await prisma.listingTemplate.findUniqueOrThrow({ where: { id } })).payload as Record<string, unknown>;

  it("save: hidden codes sent by hand are stripped before the row is written; everything else is stored as sent", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const payload = {
      title: "Baret ve vida alımı",
      description: "Eski şartname no 53101500",
      categoryIds: [HID_CLS, CLS, OLD_CLS, CLS2],
      keywords: ["baret", "vida"],
      items: [
        { name: "Baret", quantity: 5, unit: "adet", categoryId: HID_CLS2 },
        { name: "Vida M8", quantity: 100, unit: "adet", categoryId: CLS },
      ],
      // Free text in a category-named field is not a code and is left alone.
      categoryHint: "53 numaralı şartnameye göre",
      visibility: "PUBLIC",
    };

    const saved = await templates().save(owner.auth, { name: "  Baret şablonu ", payload });

    expect(saved.name).toBe("Baret şablonu");
    expect(await storedPayload(saved.id)).toEqual({
      ...payload,
      categoryIds: [CLS, CLS2],
      items: [
        { name: "Baret", quantity: 5, unit: "adet", categoryId: null },
        { name: "Vida M8", quantity: 100, unit: "adet", categoryId: CLS },
      ],
    });
    // The caller's object is not changed.
    expect(payload.categoryIds).toEqual([HID_CLS, CLS, OLD_CLS, CLS2]);
  });

  it("read: a template saved before its segment was hidden is listed without the hidden code; the row is not rewritten", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const legacy = await prisma.listingTemplate.create({
      data: {
        companyId: owner.company.id,
        createdById: owner.user.id,
        name: "Eski şablon",
        payload: { title: "Koruyucu giysi", categoryIds: [HID_CLS, CLS], items: [{ name: "Tulum", quantity: 1, unit: "adet" }] },
      },
    });

    const rows = await templates().list(owner.company.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload).toEqual({
      title: "Koruyucu giysi",
      categoryIds: [CLS],
      items: [{ name: "Tulum", quantity: 1, unit: "adet" }],
    });
    expectNoHiddenCategory(rows);
    expect((await storedPayload(legacy.id)).categoryIds).toEqual([HID_CLS, CLS]);
  });

  it("a template without a hidden code is stored and listed exactly as sent", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const payload = { title: "Vida alımı", categoryIds: [CLS], items: [{ name: "Vida", quantity: 10, unit: "adet" }], note: null };

    const saved = await templates().save(owner.auth, { name: "Vida", payload });

    expect(await storedPayload(saved.id)).toEqual(payload);
    expect((await templates().list(owner.company.id))[0]!.payload).toEqual(payload);
  });
});

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

/* ------------------------------------------------------------------ */
/* 2026-10-10 - HIDDEN FAMILY / CLASS UNDER THE VISIBLE SEGMENT 46      */
/* ------------------------------------------------------------------ */

describe("segment 46 is visible - its hidden family (4610) and hidden class (461825) behave like a hidden segment", () => {
  const requestBody = (over: Record<string, unknown> = {}) =>
    ({
      type: "ALIM",
      format: "RFQ",
      visibility: "PUBLIC",
      title: "İş güvenliği talebi",
      closesAt: FUTURE.toISOString(),
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY"],
      items: [{ name: "Kalem", quantity: 1, unit: "adet" }],
      ...over,
    }) as never;
  const storedCodes = async (id: string) => (await prisma.listing.findUniqueOrThrow({ where: { id } })).categoryIds;

  it("request lists and detail: hidden family / class codes are never shown, 46181500 is an ordinary category", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const bidder = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const mixed = await legacyListing(owner, [WEAPON_CLS, PPE_CLS, SPRAY_LEAF, CLS], { title: "Karışık" });
    const onlyHidden = await legacyListing(owner, [WEAPON_CLS, SPRAY_LEAF], { title: "Yalnız gizli" });
    const plain = await legacyListing(owner, [PPE_CLS], { title: "Yalnız görünür" });
    for (const l of [mixed, onlyHidden, plain]) await makeItem(prisma, l.id);

    const mine = (await service.listTenders(owner.company.id, "ALIM")) as Array<{
      id: string;
      categories: { code: string; name: string }[];
      extraCategoryCount: number;
      categoryIds: string[];
    }>;
    expect(mine).toHaveLength(3); // legacy requests are still listed
    const a = mine.find((r) => r.id === mixed.id)!;
    expect(a.categories).toEqual([
      { code: PPE_CLS, name: PPE_CLS_NAME },
      { code: CLS, name: "Vidalar" },
    ]);
    // 4 stored codes, 2 visible -> nothing "extra".
    expect(a.extraCategoryCount).toBe(0);
    expect(a.categoryIds).toEqual([PPE_CLS, CLS]);
    const b = mine.find((r) => r.id === onlyHidden.id)!;
    expect(b.categories).toEqual([]);
    expect(b.categoryIds).toEqual([]);
    expectNoHiddenCategory(mine);

    const open = (await service.sellerTenders(bidder.auth, "ALIM")) as unknown as Array<{
      id: string;
      categories: { code: string; name: string }[];
    }>;
    expect(open.find((r) => r.id === mixed.id)!.categories.map((c) => c.code)).toEqual([PPE_CLS, CLS]);
    expect(open.find((r) => r.id === onlyHidden.id)!.categories).toEqual([]);
    expect(open.find((r) => r.id === plain.id)!.categories).toEqual([{ code: PPE_CLS, name: PPE_CLS_NAME }]);
    expectNoHiddenCategory(open);

    const asOwner = (await service.getOne(owner.auth, mixed.id)) as { categoryIds: string[]; hasRetiredCategory?: boolean };
    const asBidder = (await service.getOne(bidder.auth, mixed.id)) as { categoryIds: string[] };
    expect(asOwner.categoryIds).toEqual([PPE_CLS, CLS]);
    expect(asOwner.hasRetiredCategory).toBe(true);
    expect(asBidder.categoryIds).toEqual([PPE_CLS, CLS]);
    expect(asBidder).not.toHaveProperty("hasRetiredCategory");
    expectNoHiddenCategory(asOwner);
    expectNoHiddenCategory(asBidder);
    // A request with visible codes under 46 only carries no "retired category" note.
    expect(((await service.getOne(owner.auth, plain.id)) as { hasRetiredCategory?: boolean }).hasRetiredCategory).toBe(false);
    // Nothing was rewritten.
    expect(await storedCodes(mixed.id)).toEqual([WEAPON_CLS, PPE_CLS, SPRAY_LEAF, CLS]);
  });

  it("supplier sector counters: a request stored only under a hidden branch is not counted under segment 46", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await legacyListing(owner, [WEAPON_CLS]);
    await legacyListing(owner, [SPRAY_LEAF]);
    await legacyListing(owner, [PPE_CLS]);
    await legacyListing(owner, [WEAPON_CLS, PPE_CLS2]);
    await legacyListing(owner, [CLS]);

    const res = await service.discoverFacets(seller.auth, "ALIM");

    expect(res.total).toBe(5); // the requests themselves stay visible
    expect(res.segments.map((s) => [s.id, s.count]).sort()).toEqual(
      [
        [SAFETY_SEG, 2],
        [SEG, 1],
      ].sort(),
    );
    expect(res.segments.find((s) => s.id === SAFETY_SEG)?.name).toBe(SAFETY_SEG_NAME);
    expectNoHiddenCategory(res);
  });

  it("request write gates: a NEW hidden family / class code is rejected, 46181500 is accepted, a stored one never blocks", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});

    for (const code of [WEAPON_CLS, SPRAY_CLS, SPRAY_LEAF]) {
      const err = await service
        .create(owner.auth, requestBody({ asDraft: true, categoryIds: [code] }))
        .then(() => null, (e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        i18nKey: "api.companyListings.gecersizKategoriSecimi",
      });
    }
    expect(await prisma.listing.count()).toBe(0);
    // A visible class of segment 46 is an ordinary request category.
    await service.create(owner.auth, requestBody({ asDraft: true, categoryIds: [PPE_CLS] }));
    expect((await prisma.listing.findFirstOrThrow({ where: { companyId: owner.company.id } })).categoryIds).toEqual([PPE_CLS]);

    // PUBLISHED legacy request: the stored hidden-family code is carried over by an unrelated edit ...
    const legacy = await legacyListing(owner, [WEAPON_CLS, PPE_CLS]);
    await service.updateListing(owner.auth, legacy.id, requestBody({ categoryIds: [PPE_CLS] }));
    expect(await storedCodes(legacy.id)).toEqual([WEAPON_CLS, PPE_CLS]);
    // ... while ADDING a hidden class code is refused and nothing is written.
    await expect(
      service.updateListing(owner.auth, legacy.id, requestBody({ categoryIds: [PPE_CLS, SPRAY_LEAF] })),
    ).rejects.toThrow(BadRequestException);
    expect(await storedCodes(legacy.id)).toEqual([WEAPON_CLS, PPE_CLS]);
  });

  it("publish of a draft: hidden family / class codes leave the list when a visible one remains; with none left it is refused", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const mixed = await legacyListing(owner, [WEAPON_CLS, PPE_CLS, SPRAY_LEAF], { status: "DRAFT" });
    const onlyHidden = await legacyListing(owner, [WEAPON_CLS, SPRAY_LEAF], { status: "DRAFT" });
    await makeItem(prisma, mixed.id);
    await makeItem(prisma, onlyHidden.id);

    expect((await service.publishListing(owner.auth, mixed.id)).status).toBe("OPEN");
    expect(await storedCodes(mixed.id)).toEqual([PPE_CLS]);

    const err = await service.publishListing(owner.auth, onlyHidden.id).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({ code: "LISTING_CATEGORY_NOT_CURRENT" });
    expect(await storedCodes(onlyHidden.id)).toEqual([WEAPON_CLS, SPRAY_LEAF]);
  });

  it("product gate: no new product under a hidden family / class; 46181500 is accepted; a legacy product stays editable", async () => {
    const owner = await makeCompanyWithUser(prisma, {});

    for (const categoryId of [WEAPON_FAM, WEAPON_CLS, SPRAY_CLS, SPRAY_LEAF]) {
      const err = await items()
        .createProduct(owner.auth, { name: `Ürün ${categoryId}`, categoryId })
        .then(() => null, (e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        i18nKey: "api.companyItems.kategoriGecersizYaDaGuncelDegil",
      });
    }
    await expect(
      items().create(owner.auth, { name: "Kalem", unit: "adet", categoryId: SPRAY_LEAF }),
    ).rejects.toThrow(BadRequestException);
    expect(await prisma.companyItem.count()).toBe(0);
    expect((await items().createProduct(owner.auth, { name: "Baret", categoryId: PPE_CLS2 })).categoryId).toBe(PPE_CLS2);

    // Legacy product under the hidden family: unchanged value passes, an empty one keeps it.
    const legacy = await legacyProduct(owner, { name: "Eski tüfek kılıfı", categoryId: WEAPON_CLS });
    await items().updateShowcase(owner.auth, legacy.id, { categoryId: WEAPON_CLS, description: "y".repeat(130) });
    await items().updateShowcase(owner.auth, legacy.id, { categoryId: null, description: "z".repeat(130) });
    expect(await categoryOf(legacy.id)).toBe(WEAPON_CLS);
    // A CHANGE to another hidden branch is a new value -> rejected.
    await expect(items().updateShowcase(owner.auth, legacy.id, { categoryId: SPRAY_LEAF })).rejects.toThrow(
      /Seçilen kategori geçersiz ya da artık kullanılmıyor/,
    );
    expect(await categoryOf(legacy.id)).toBe(WEAPON_CLS);

    // Not public yet + hidden branch = no category for the review queue.
    const showcase = await items().getShowcase(owner.auth, legacy.id);
    expect(showcase.publishBlockers).toEqual(["Kategori artık kullanılmıyor, güncel bir kategori seçilmeli"]);
    await expect(items().publish(owner.auth, legacy.id)).rejects.toThrow(BadRequestException);
    // Moved to the visible class of the same segment it goes to review.
    await items().updateShowcase(owner.auth, legacy.id, { categoryId: PPE_CLS, ...COMPLETE });
    expect((await items().publish(owner.auth, legacy.id)).reviewStatus).toBe("PENDING");
  });

  it("attribute form: not offered for a hidden family / class; a visible code under 46 inherits the segment's fields", async () => {
    await prisma.categoryAttribute.create({
      data: { categoryId: SAFETY_SEG, groupKey: "urun_grubu", nameTr: "Ürün grubu", type: "SINGLE_SELECT", options: ["Kişisel koruyucu donanım", "Yangın güvenliği"], isRequired: true, sortOrder: 0 },
    });
    const controller = new CompanyItemsController(items());

    for (const code of [WEAPON_FAM, WEAPON_CLS, SPRAY_CLS, SPRAY_LEAF]) {
      expect(await controller.attributes(code)).toEqual([]);
    }
    for (const code of [SAFETY_SEG, PPE_FAM, PPE_CLS]) {
      expect((await controller.attributes(code)).map((d) => [d.key, d.definedAt])).toEqual([["urun_grubu", SAFETY_SEG]]);
    }
  });

  it("request templates: hidden family / class codes are stripped on save and on read; visible 46 codes stay", async () => {
    const templates = new CompanyListingTemplatesService(prisma as unknown as PrismaService);
    const owner = await makeCompanyWithUser(prisma, {});
    const payload = {
      title: "Baret alımı",
      categoryIds: [WEAPON_CLS, PPE_CLS, SPRAY_LEAF, CLS, WEAPON_FAM],
      items: [
        { name: "Sprey", quantity: 5, unit: "adet", categoryId: SPRAY_CLS },
        { name: "Baret", quantity: 5, unit: "adet", categoryId: PPE_CLS2 },
      ],
    };

    const saved = await templates.save(owner.auth, { name: "Baret şablonu", payload });
    const row = (await prisma.listingTemplate.findUniqueOrThrow({ where: { id: saved.id } })).payload;
    expect(row).toEqual({
      title: "Baret alımı",
      categoryIds: [PPE_CLS, CLS],
      items: [
        { name: "Sprey", quantity: 5, unit: "adet", categoryId: null },
        { name: "Baret", quantity: 5, unit: "adet", categoryId: PPE_CLS2 },
      ],
    });

    // A template stored before the branch was hidden: read without the hidden code, row untouched.
    const legacy = await prisma.listingTemplate.create({
      data: {
        companyId: owner.company.id,
        createdById: owner.user.id,
        name: "Eski şablon",
        payload: { title: "Eski", categoryIds: [WEAPON_CLS, PPE_CLS] },
      },
    });
    const listed = (await templates.list(owner.company.id)).find((t) => t.id === legacy.id)!;
    expect(listed.payload).toEqual({ title: "Eski", categoryIds: [PPE_CLS] });
    expectNoHiddenCategory(await templates.list(owner.company.id));
    expect(((await prisma.listingTemplate.findUniqueOrThrow({ where: { id: legacy.id } })).payload as { categoryIds: string[] }).categoryIds)
      .toEqual([WEAPON_CLS, PPE_CLS]);
  });

  it("panel product discovery: `category=46000000` lists and counts the visible branches only; a hidden code is no filter", async () => {
    const weapon = await seedSeller({ categoryId: WEAPON_CLS });
    await seedSeller({ categoryId: SPRAY_LEAF });
    const ppe = await seedSeller({ categoryId: PPE_CLS });
    await seedSeller({ categoryId: CLS });
    const buyer = await makeCompanyWithUser(prisma, {});
    const viewer = { companyId: buyer.company.id, userId: buyer.user.id } as never;

    // Search: the product stored under 4610 / 461825 is not listed under 46 or under 4618.
    const all = await items().discoverSearch(viewer, {});
    expect(all.total).toBe(4);
    expectNoHiddenCategory(all);
    const underSegment = await items().discoverSearch(viewer, { category: SAFETY_SEG });
    expect(underSegment.items.map((i) => i.name)).toEqual([ppe.item.name]);
    expect(underSegment.total).toBe(1);
    expect((await items().discoverSearch(viewer, { category: PPE_FAM })).total).toBe(1);
    expect((await items().discoverSearch(viewer, { category: PPE_CLS })).total).toBe(1);
    for (const hidden of [WEAPON_FAM, WEAPON_CLS, SPRAY_CLS, SPRAY_LEAF]) {
      expect((await items().discoverSearch(viewer, { category: hidden })).total).toBe(4);
      expect(await items().discoverProducts(viewer, { category: hidden })).toHaveLength(4);
    }
    // Strip.
    expect((await items().discoverProducts(viewer, { category: SAFETY_SEG })).map((p) => p.name)).toEqual([ppe.item.name]);
    expect(await items().discoverProducts(viewer, { category: PPE_FAM })).toHaveLength(1);

    // Facets: sector counter, selected category, one level down.
    const none = await items().discoverFacets(viewer, {});
    expect(none.categories.map((c) => [c.id, c.count]).sort()).toEqual(
      [
        [SAFETY_SEG, 1],
        [SEG, 1],
      ].sort(),
    );
    const seg = await items().discoverFacets(viewer, { category: SAFETY_SEG });
    expect(seg.selectedCategory).toEqual({ id: SAFETY_SEG, name: SAFETY_SEG_NAME, level: 1 });
    expect(seg.subCategories).toEqual([{ id: PPE_FAM, name: PPE_FAM_NAME, level: 2, count: 1 }]);
    expect(seg.price.has + seg.price.request).toBe(1);
    const fam = await items().discoverFacets(viewer, { category: PPE_FAM });
    expect(fam.subCategories).toEqual([{ id: PPE_CLS, name: PPE_CLS_NAME, level: 3, count: 1 }]);
    for (const hidden of [WEAPON_FAM, SPRAY_CLS, SPRAY_LEAF]) {
      const facets = await items().discoverFacets(viewer, { category: hidden });
      expect(facets.selectedCategory).toBeNull();
      expect(facets.subCategories).toEqual([]);
      expect(facets.categories).toEqual(none.categories);
    }
    for (const payload of [none, seg, fam]) expectNoHiddenCategory(payload);

    // Product page: the legacy product opens without a category, the visible one with it.
    const a = await items().discoverProduct(viewer, weapon.company.slug as string, weapon.item.slug as string);
    expect(a.product.name).toBe(weapon.item.name);
    expect(a.product.category).toBeNull();
    expect(a.product.categoryId).toBeNull();
    expectNoHiddenCategory(a);
    const b = await items().discoverProduct(viewer, ppe.company.slug as string, ppe.item.slug as string);
    expect(b.product.category).toEqual({ id: PPE_CLS, name: PPE_CLS_NAME });
  });

  /**
   * BUYER RELEVANCE (review of 2026-10-10). With no sort chosen the panel
   * search lists the products that match the company's BUYING declaration first
   * and their card says "Alım kategorinizle eşleşiyor" (`matchesProfile`). The match walks the
   * subtree of each declared category, so a visible sector must not pull in
   * the records of its hidden branches, and a sector stored only as the
   * ancestor of a hidden pick is not a declared category. A stored pick that
   * is itself hidden keeps matching the products under it (stored codes).
   */
  it("panel product search relevance: a product under a hidden branch does not match the buyer's visible sector", async () => {
    const weapon = await seedSeller({ categoryId: WEAPON_CLS });
    const spray = await seedSeller({ categoryId: SPRAY_LEAF });
    const ppe = await seedSeller({ categoryId: PPE_CLS });
    const screw = await seedSeller({ categoryId: CLS });
    const clothes = await seedSeller({ categoryId: HID_CLS });
    const sellers = [weapon, spray, ppe, screw, clothes];
    /** Names of the products the buyer sees first with the "matches your buying category" badge. */
    const matched = async (declaration: Record<string, string[]>) => {
      const buyer = await makeCompanyWithUser(prisma, {});
      await prisma.company.update({ where: { id: buyer.company.id }, data: declaration });
      const res = await items().discoverSearch({ companyId: buyer.company.id, userId: buyer.user.id } as never, {});
      // The products themselves stay in the list, without their hidden category.
      expect(res.total).toBe(sellers.length);
      expect(res.items).toHaveLength(sellers.length);
      expectNoHiddenCategory(res);
      const flags = res.items.map((i) => (i as { matchesProfile?: boolean }).matchesProfile);
      // The matching products are the HEAD of the list.
      expect(flags).toEqual([...flags].sort((a, b) => Number(b) - Number(a)));
      return res.items.filter((_, n) => flags[n]).map((i) => i.name).sort();
    };
    const names = (...list: Array<{ item: { name: string } }>) => list.map((s) => s.item.name).sort();

    // "İş Güvenliği ve Yangın Ekipmanları" as a whole sector: only its visible branches match.
    expect(await matched({ buyerCategoryIds: [SAFETY_SEG] })).toEqual(names(ppe));
    // A visible family with a hidden class below it (4618 -> 461825).
    expect(await matched({ buyerCategoryIds: [SAFETY_SEG], buyerSubCategoryIds: [PPE_FAM] })).toEqual(names(ppe));
    // Next to another sector: the hidden branch is still not pulled in.
    expect(await matched({ buyerCategoryIds: [SAFETY_SEG, SEG] })).toEqual(names(ppe, screw));

    // The buyer's only pick under 46 is a hidden one: the sector is stored as its
    // ancestor, not as a declared category -> the visible 46 products do not match.
    // The stored hidden pick itself keeps matching (matching reads the stored codes).
    expect(
      await matched({ buyerCategoryIds: [SAFETY_SEG], buyerSubCategoryIds: [WEAPON_FAM, WEAPON_CLS] }),
    ).toEqual(names(weapon));
    expect(
      await matched({ buyerCategoryIds: [SAFETY_SEG], buyerSubCategoryIds: [PPE_FAM, SPRAY_CLS, SPRAY_LEAF] }),
    ).toEqual(names(spray));
    // A visible pick and a hidden one in the same family: both chains match, the other hidden family does not.
    expect(
      await matched({ buyerCategoryIds: [SAFETY_SEG], buyerSubCategoryIds: [PPE_FAM, PPE_CLS, SPRAY_CLS, SPRAY_LEAF] }),
    ).toEqual(names(ppe, spray));

    // A fully hidden segment behaves as before the family / class rule.
    expect(await matched({ buyerCategoryIds: [HID_SEG], buyerSubCategoryIds: [HID_FAM, HID_CLS] })).toEqual(names(clothes));
    // No declaration at all: plain order, no card carries the flag.
    expect(await matched({})).toEqual([]);

    // Paging walks the two groups (matching first, then the rest) without losing or repeating a product.
    const pager = await makeCompanyWithUser(prisma, {});
    await prisma.company.update({ where: { id: pager.company.id }, data: { buyerCategoryIds: [SAFETY_SEG] } });
    const paged: string[] = [];
    for (const page of [1, 2, 3]) {
      const res = await items().discoverSearch({ companyId: pager.company.id, userId: pager.user.id } as never, { page, pageSize: 2 });
      paged.push(...res.items.map((i) => i.name));
    }
    expect(paged[0]).toBe(ppe.item.name);
    expect([...paged].sort()).toEqual(names(...sellers));
  });

  /**
   * REQUEST-SIDE TWIN of the relevance above - KNOWINGLY KEPT (review of
   * 2026-10-10; owner decision pending). `categoryMatch` ("Profilinizle
   * eşleşti") follows the contract of the notification matcher: the request's
   * STORED codes go up to their ancestors and meet the seller's stored codes
   * (`deriveCategoryMatchCandidates`, which also decides who is notified and
   * invited). A seller of the whole sector 46 therefore still matches a legacy
   * request stored only under 4610; the row shows no category.
   */
  it("supplier 'Open requests': categoryMatch keeps reading the stored codes of a legacy request under a hidden branch", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({ where: { id: seller.company.id }, data: { sellerCategoryIds: [SAFETY_SEG] } });
    const legacy = await legacyListing(owner, [WEAPON_CLS], { title: "Yalnız gizli" });
    const other = await legacyListing(owner, [CLS], { title: "Vida" });

    const rows = (await service.sellerTenders(seller.auth, "ALIM")) as unknown as Array<{
      id: string;
      categoryMatch: boolean;
      categories: unknown[];
    }>;

    expect(rows.find((r) => r.id === legacy.id)).toMatchObject({ categoryMatch: true, categories: [] });
    expect(rows.find((r) => r.id === other.id)).toMatchObject({ categoryMatch: false });
    expectNoHiddenCategory(rows);
  });

  /** Declarations as they are stored: every pick with its ancestor chain. */
  const DECLARED = {
    weaponOnly: { sellerCategoryIds: [SAFETY_SEG], sellerSubCategoryIds: [WEAPON_FAM, WEAPON_CLS] },
    sprayOnly: { buyerCategoryIds: [SAFETY_SEG], buyerSubCategoryIds: [PPE_FAM, SPRAY_CLS, SPRAY_LEAF] },
    ppe: { sellerCategoryIds: [SAFETY_SEG], sellerSubCategoryIds: [PPE_FAM, PPE_CLS, WEAPON_FAM, WEAPON_CLS] },
    whole: { sellerCategoryIds: [SAFETY_SEG] },
  };

  it("legacy member directory: a company whose only pick under 46 is hidden is not listed under 46000000 / 46180000", async () => {
    const make = async (name: string, slug: string, data: Record<string, unknown>) => {
      const c = await makeCompanyWithUser(prisma, { name });
      await prisma.company.update({ where: { id: c.company.id }, data: { publicEnabled: true, slug, ...data } });
    };
    await make("Silah Beyan", "silah-beyan", DECLARED.weaponOnly);
    await make("Sprey Beyan", "sprey-beyan", DECLARED.sprayOnly);
    await make("Koruyucu Beyan", "koruyucu-beyan", DECLARED.ppe);
    await make("Sektor Geneli", "sektor-geneli", DECLARED.whole);
    const directory = new CompanyDirectoryService(prisma as never);
    const names = async (q: Parameters<CompanyDirectoryService["listPublic"]>[0]) =>
      (await directory.listPublic(q)).items.map((c) => c.name).sort();
    const everyone = ["Koruyucu Beyan", "Sektor Geneli", "Silah Beyan", "Sprey Beyan"];

    expect(await names({})).toEqual(everyone);
    expect(await names({ category: SAFETY_SEG })).toEqual(["Koruyucu Beyan", "Sektor Geneli"]);
    // The total is that of the list (the page is cut from the same set).
    expect((await directory.listPublic({ category: SAFETY_SEG })).total).toBe(2);
    expect(await names({ category: PPE_FAM })).toEqual(["Koruyucu Beyan"]);
    expect(await names({ category: PPE_CLS })).toEqual(["Koruyucu Beyan"]);
    // A hidden family / class code is no filter at all.
    for (const hidden of [WEAPON_FAM, WEAPON_CLS, SPRAY_CLS, SPRAY_LEAF]) {
      expect(await names({ category: hidden })).toEqual(everyone);
    }
    // Other filters keep working next to the category.
    expect(await names({ category: SAFETY_SEG, q: "sektor" })).toEqual(["Sektor Geneli"]);
  });

  it("panel company profile: a sector stored only as the ancestor of a hidden pick is not a declared category", async () => {
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
    const target = async (rothernId: string, slug: string, data: Record<string, unknown>) => {
      const c = await makeCompanyWithUser(prisma, { tier: "GOLD" });
      await prisma.company.update({ where: { id: c.company.id }, data: { rothernId, publicEnabled: true, slug, ...data } });
      return (await service.getProfile(viewer.auth, rothernId)).profile;
    };

    const weaponOnly = await target("TEST-4610", "silah-beyanli", {
      sellerCategoryIds: [SAFETY_SEG, SEG],
      sellerSubCategoryIds: [WEAPON_FAM, WEAPON_CLS, FAM, CLS],
    });
    expect(weaponOnly.categories).toEqual([{ id: SEG, name: "İmalat Bileşenleri" }]);
    expectNoHiddenCategory(weaponOnly);
    expect(JSON.stringify(weaponOnly)).not.toContain(SAFETY_SEG_NAME);

    const sprayOnly = await target("TEST-4618", "sprey-beyanli", DECLARED.sprayOnly);
    expect(sprayOnly.categories).toEqual([]);

    const ppe = await target("TEST-4619", "koruyucu-beyanli", DECLARED.ppe);
    expect(ppe.categories).toEqual([{ id: SAFETY_SEG, name: SAFETY_SEG_NAME }]);
    expectNoHiddenCategory(ppe);
    // The sub arrays are read for the rule only; they are not part of the answer.
    expect(JSON.stringify(ppe)).not.toContain(PPE_CLS);
  });

  it("dashboard breakdown: a hidden branch is never rounded up to its visible segment", () => {
    expect(breakdownSegmentOf([WEAPON_CLS])).toBeNull();
    expect(breakdownSegmentOf([SPRAY_LEAF, WEAPON_CLS])).toBeNull();
    expect(breakdownSegmentOf([WEAPON_CLS, PPE_CLS])).toBe(SAFETY_SEG);
    expect(breakdownSegmentOf([SPRAY_LEAF, CLS, PPE_CLS])).toBe(SEG);
    expect(breakdownSegmentOf([PPE_CLS])).toBe(SAFETY_SEG);
  });

  it("affinity builder: the visible ancestors of a hidden pick are not copied as a declaration", async () => {
    const company = await makeCompanyWithUser(prisma, {});
    await prisma.company.update({
      where: { id: company.company.id },
      // Selling: only a hidden pick. Buying: a visible pick and a hidden one in the same family.
      data: {
        ...DECLARED.weaponOnly,
        buyerCategoryIds: [SAFETY_SEG],
        buyerSubCategoryIds: [PPE_FAM, PPE_CLS, SPRAY_CLS, SPRAY_LEAF],
      },
    });

    await new CompanyAffinityService(prisma as never).recomputeAll();

    const rows = await prisma.companyAffinity.findMany({ where: { companyId: company.company.id } });
    const declared = rows.filter((r) => (r.reasons as { declared?: boolean } | null)?.declared).map((r) => r.categoryId);
    expect(declared.sort()).toEqual([SAFETY_SEG, PPE_FAM, PPE_CLS].sort());
    // Nothing was declared on the selling side (its only pick is hidden) ...
    expect(rows.every((r) => r.sellScore === 0)).toBe(true);
    // ... and no row exists for a hidden code.
    expect(rows.some((r) => isHiddenCategory(r.categoryId))).toBe(false);
  });
});
