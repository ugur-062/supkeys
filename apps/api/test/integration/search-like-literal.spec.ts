/**
 * SEARCH TEXT IS A LITERAL — every search that puts user text into a Prisma
 * `contains` filter (follow-up of arayuz testi 2026-10 category-17).
 *
 * Prisma copies the value into the LIKE pattern as it is, so `%` (any run of
 * characters) and `_` (any single character) kept their pattern meaning: a
 * visitor who typed "%%" got EVERY product, request and company, and "pan_"
 * matched "pano". Category search was fixed first (`likeLiteral`,
 * category-search.spec); this file locks the other search surfaces:
 *
 *   - product search clauses (`productSearchClauses`: product directory,
 *     typeahead, the product branch of the company directory),
 *   - request search (`PublicMarketplaceService.list` / `facets` / `suggest`),
 *   - the company directory (shared builder, its facets, the panel service),
 *   - product search inside a company profile,
 *   - the panel's own-catalogue search and its product discovery strip
 *     (`CompanyItemsService.list` / `discoverProducts`),
 *   - the AI category hint resolver.
 *
 * Each block also proves the other direction: a `%` or `_` that really is in
 * the stored text is still found, and ordinary queries are unchanged.
 */
import { productSearchClauses } from "../../src/common/company/product-index";
import { buildDirectory, directoryFacets } from "../../src/common/company/company-directory";
import { resolveCategoryHints } from "../../src/modules/ai/category-hint-resolver";
import { CompanyDirectoryService } from "../../src/modules/company-directory/company-directory.service";
import { CompanyItemsService } from "../../src/modules/company-items/company-items.service";
import { PublicMarketplaceService } from "../../src/modules/public-marketplace/public-marketplace.service";
import { PublicProfileService } from "../../src/modules/public-profile/public-profile.service";
import type { PrismaBypassService, PrismaService } from "../../src/common/prisma/prisma.service";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { prisma, truncateAll } from "./test-db";

const bypass = prisma as unknown as PrismaBypassService;
const marketplace = () => new PublicMarketplaceService(bypass);
const profiles = () => new PublicProfileService(bypass);
const panelDirectory = () => new CompanyDirectoryService(bypass);
const panelItems = () =>
  new CompanyItemsService(prisma as unknown as PrismaService, { log: jest.fn() } as never, {} as never);

/** Queries that used to match everything (or far too much) through wildcards. */
const WILDCARD_ONLY = ["%%", "__", "%_", "_%_"] as const;

let seq = 0;

/** A company with an open public profile and one published product. */
async function seedSeller(
  company: { name: string; slug: string; industry?: string; aboutText?: string; rothernId?: string },
  product: { name: string; slug: string; searchText: string; searchTextI18n?: string },
) {
  seq += 1;
  const made = await makeCompanyWithUser(prisma);
  const patched = await prisma.company.update({
    where: { id: made.company.id },
    data: { city: "İstanbul", publicEnabled: true, ...company },
  });
  await prisma.companyItem.create({
    data: {
      companyId: patched.id,
      createdById: made.user.id,
      name: product.name,
      unit: "adet",
      slug: product.slug,
      categoryId: "39121000",
      description: "x".repeat(120),
      images: ["a.webp"],
      keywords: ["urun"],
      isPublic: true,
      publishedAt: new Date(),
      searchText: product.searchText,
      searchTextI18n: product.searchTextI18n ?? "",
    },
  });
  return patched;
}

async function seedListing(over: { title: string; description?: string | null; searchTextI18n?: string }) {
  seq += 1;
  const { company, user } = await makeCompanyWithUser(prisma);
  await prisma.company.update({
    where: { id: company.id },
    data: { city: "İstanbul", publicEnabled: true, slug: `alici-${seq}` },
  });
  const listing = await makeListing(prisma, {
    companyId: company.id,
    createdById: user.id,
    visibility: "PUBLIC",
    status: "OPEN",
    number: `ROT-${String(200000 + seq)}`,
    publishedAt: new Date(),
    title: over.title,
    description: over.description ?? null,
    categoryIds: ["31000000"],
    keywords: [],
  });
  if (over.searchTextI18n) {
    await prisma.listing.update({ where: { id: listing.id }, data: { searchTextI18n: over.searchTextI18n } });
  }
  await makeItem(prisma, listing.id, { name: "Kalem" });
  return listing;
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("productSearchClauses: the clauses themselves", () => {
  it("escapes %, _ and \\ in every pattern value and leaves ordinary tokens alone", () => {
    expect(productSearchClauses("pano")).toEqual([
      {
        OR: [
          { searchText: { contains: "pano" } },
          { searchTextI18n: { contains: "pano" } },
          { company: { name: { contains: "pano", mode: "insensitive" } } },
        ],
      },
    ]);
    expect(productSearchClauses("%% pan_ a\\b", { includeCompanyName: false })).toEqual([
      { OR: [{ searchText: { contains: "\\%\\%" } }, { searchTextI18n: { contains: "\\%\\%" } }] },
      { OR: [{ searchText: { contains: "pan\\_" } }, { searchTextI18n: { contains: "pan\\_" } }] },
      { OR: [{ searchText: { contains: "a\\\\b" } }, { searchTextI18n: { contains: "a\\\\b" } }] },
    ]);
    // The company-name branch takes the RAW token (not folded): escaped too.
    expect(productSearchClauses("Vitr_n")).toEqual([
      {
        OR: [
          { searchText: { contains: "vitr\\_n" } },
          { searchTextI18n: { contains: "vitr\\_n" } },
          { company: { name: { contains: "Vitr\\_n", mode: "insensitive" } } },
        ],
      },
    ]);
  });
});

describe("product search (directory, typeahead, company profile)", () => {
  beforeEach(async () => {
    await seedSeller(
      { name: "Vitrin Sanayi", slug: "vitrin-sanayi" },
      { name: "Dağıtım panosu", slug: "dagitim-panosu", searchText: "dagitim panosu pano" },
    );
    await seedSeller(
      { name: "Metal %50 Ticaret", slug: "metal-ticaret" },
      {
        name: "Çinko külçe %99 saf",
        slug: "cinko-kulce",
        searchText: "cinko kulce %99 saf",
        searchTextI18n: "cinko kulce %99 saf zinc ingot 99_pure",
      },
    );
  });

  it("wildcard-only queries find nothing; before they returned every product", async () => {
    expect((await marketplace().listProducts({})).total).toBe(2);
    for (const q of WILDCARD_ONLY) {
      expect({ q, total: (await marketplace().listProducts({ q })).total }).toEqual({ q, total: 0 });
      expect({ q, products: (await marketplace().suggest(q, "products")).products }).toEqual({ q, products: [] });
    }
  });

  it("_ is not 'any character' and % is not 'anything' inside a word", async () => {
    // "pan_" matched "pano", "c%k" matched "cinko kulce", "Vitr_n" the company name.
    for (const q of ["pan_", "c%k", "Vitr_n", "d_g_t_m"]) {
      expect({ q, total: (await marketplace().listProducts({ q })).total }).toEqual({ q, total: 0 });
    }
  });

  it("a % or _ that IS in the text is found, and only there", async () => {
    const names = async (q: string) => (await marketplace().listProducts({ q })).items.map((i) => i.name);
    expect(await names("%99")).toEqual(["Çinko külçe %99 saf"]);
    expect(await names("99_pure")).toEqual(["Çinko külçe %99 saf"]); // searchTextI18n
    expect(await names("%50")).toEqual(["Çinko külçe %99 saf"]); // company name "Metal %50 Ticaret"
    expect(await names("%98")).toEqual([]);
  });

  it("ordinary queries are unchanged (stem, fold, AND of words)", async () => {
    const names = async (q: string) => (await marketplace().listProducts({ q })).items.map((i) => i.name);
    expect(await names("pano")).toEqual(["Dağıtım panosu"]);
    expect(await names("panoları")).toEqual(["Dağıtım panosu"]);
    expect(await names("DAĞITIM pano")).toEqual(["Dağıtım panosu"]);
    expect(await names("zinc ingots")).toEqual(["Çinko külçe %99 saf"]);
    expect(await names("Vitrin")).toEqual(["Dağıtım panosu"]);
  });

  it("search inside a company profile follows the same rule", async () => {
    const total = async (q: string) => (await profiles().listPublicProducts("metal-ticaret", { q })).total;
    expect(await total("çinko")).toBe(1);
    expect(await total("%99")).toBe(1);
    for (const q of [...WILDCARD_ONLY, "c_nko", "k%e"]) {
      expect({ q, total: await total(q) }).toEqual({ q, total: 0 });
    }
  });
});

describe("panel product searches (own catalogue, discovery strip)", () => {
  it("own catalogue: the typed text is a literal in name, code, brand, MPN and searchText", async () => {
    const { company, user } = await makeCompanyWithUser(prisma);
    const item = (name: string, over: Record<string, unknown> = {}) =>
      prisma.companyItem.create({
        data: { companyId: company.id, createdById: user.id, name, unit: "adet", searchText: name.toLowerCase(), ...over },
      });
    await item("Rulman 6205", { code: "AB_12", mpn: "6205-2RS", searchText: "rulman 6205 6205-2rs" });
    await item("Rulman 6206", { code: "AB-12", mpn: "6206_2RS", searchText: "rulman 6206 6206_2rs" });
    await item("Conta %100 kaucuk", { code: "ABX12", brand: "Kar_el", searchText: "conta %100 kaucuk kar_el" });

    const names = async (q: string) =>
      (await panelItems().list(company.id, { q })).items.map((i) => i.name).sort();
    expect(await names("rulman")).toEqual(["Rulman 6205", "Rulman 6206"]);
    // Before: "%%" and "__" listed the whole catalogue, "AB_12" all three codes.
    for (const q of WILDCARD_ONLY) expect({ q, names: await names(q) }).toEqual({ q, names: [] });
    expect(await names("AB_12")).toEqual(["Rulman 6205"]);
    expect(await names("AB-12")).toEqual(["Rulman 6206"]);
    expect(await names("6206_2RS")).toEqual(["Rulman 6206"]);
    expect(await names("620__2RS")).toEqual([]);
    expect(await names("Kar_el")).toEqual(["Conta %100 kaucuk"]);
    expect(await names("%100")).toEqual(["Conta %100 kaucuk"]);
    expect(await names("r%n")).toEqual([]);
  });

  it("discovery strip: wildcard-only text finds nothing, a real word still does", async () => {
    await seedSeller(
      { name: "Vitrin Sanayi", slug: "vitrin-sanayi" },
      { name: "Dağıtım panosu", slug: "dagitim-panosu", searchText: "dagitim panosu pano" },
    );
    const me = await makeCompanyWithUser(prisma);
    const names = async (q?: string) =>
      (await panelItems().discoverProducts(me.auth, { q })).map((r) => r.name);
    expect(await names()).toEqual(["Dağıtım panosu"]);
    expect(await names("panosu")).toEqual(["Dağıtım panosu"]);
    for (const q of [...WILDCARD_ONLY, "pan_su", "d%m"]) expect({ q, names: await names(q) }).toEqual({ q, names: [] });
  });
});

describe("request search", () => {
  beforeEach(async () => {
    await seedListing({ title: "Çelik boru alımı", description: "40 ton dikişsiz çelik boru." });
    await seedListing({
      title: "Bakır %99,9 katot alımı",
      description: "Kod: A_12 plaka",
      searchTextI18n: "bakir %99,9 katot alimi copper cathode",
    });
  });

  it("wildcard-only queries find nothing in the list, the facets and the typeahead", async () => {
    expect((await marketplace().list({})).total).toBe(2);
    const facetRows = async (q?: string) =>
      (await marketplace().facets({ q })).types.reduce((sum, t) => sum + t.count, 0);
    expect(await facetRows()).toBe(2);
    for (const q of WILDCARD_ONLY) {
      expect({ q, total: (await marketplace().list({ q })).total }).toEqual({ q, total: 0 });
      expect({ q, facetRows: await facetRows(q) }).toEqual({ q, facetRows: 0 });
      expect({ q, listings: (await marketplace().suggest(q, "listings")).listings }).toEqual({ q, listings: [] });
    }
  });

  it("_ and % inside a word match only themselves (title, description, searchTextI18n)", async () => {
    const titles = async (q: string) => (await marketplace().list({ q })).items.map((i) => i.title);
    // Before: "b_ru" matched "boru", "ç%k" matched "Çelik", "A_12" also "A-12"/"AB12".
    expect(await titles("b_ru")).toEqual([]);
    expect(await titles("ç%k")).toEqual([]);
    expect(await titles("A_12")).toEqual(["Bakır %99,9 katot alımı"]);
    expect(await titles("%99")).toEqual(["Bakır %99,9 katot alımı"]);
    expect(await titles("%98")).toEqual([]);
    // Ordinary search still works.
    expect(await titles("boru")).toEqual(["Çelik boru alımı"]);
    expect(await titles("copper")).toEqual(["Bakır %99,9 katot alımı"]);
  });
});

describe("company directory", () => {
  beforeEach(async () => {
    await seedSeller(
      {
        name: "Trakya Pano",
        slug: "trakya-pano",
        industry: "Elektrik",
        aboutText: "Alçak gerilim panoları üretiyoruz, %100 yerli üretim ile çalışıyoruz.",
        rothernId: "RK-QZX_4821",
      },
      { name: "Kablo kanalı", slug: "kablo-kanali", searchText: "kablo kanali" },
    );
    await seedSeller(
      { name: "Ege Hidrolik", slug: "ege-hidrolik", industry: "Makine", rothernId: "RK-ABC-0001" },
      { name: "Hidrolik silindir", slug: "hidrolik-silindir", searchText: "hidrolik silindir" },
    );
  });

  it("shared builder: wildcard-only queries find no company (company text AND product branch)", async () => {
    expect((await buildDirectory(prisma, {})).total).toBe(2);
    for (const q of WILDCARD_ONLY) {
      expect({ q, total: (await buildDirectory(prisma, { q })).total }).toEqual({ q, total: 0 });
      expect({ q, total: (await directoryFacets(prisma, {}, { q })).total }).toEqual({ q, total: 0 });
    }
  });

  it("shared builder: _ and % inside a word match only themselves", async () => {
    const names = async (q: string, opts: Parameters<typeof buildDirectory>[2] = {}) =>
      (await buildDirectory(prisma, { q }, opts)).items.map((i) => i.name);
    expect(await names("Tr_kya")).toEqual([]); // name
    expect(await names("El%k")).toEqual([]); // industry
    expect(await names("k_blo")).toEqual([]); // product branch
    expect(await names("%100")).toEqual(["Trakya Pano"]); // literal % in the about text
    expect(await names("Trakya")).toEqual(["Trakya Pano"]);
    expect(await names("kablo")).toEqual(["Trakya Pano"]);
    // Rothern ID branch (panel only): "_" is a literal there too.
    expect(await names("QZX_4821", { matchRothernId: true })).toEqual(["Trakya Pano"]);
    expect(await names("ABC_0001", { matchRothernId: true })).toEqual([]);
    expect(await names("ABC-0001", { matchRothernId: true })).toEqual(["Ege Hidrolik"]);
  });

  it("panel directory service (second copy of the rule) behaves the same", async () => {
    const names = async (q: string) => (await panelDirectory().listPublic({ q })).items.map((i) => i.name);
    for (const q of WILDCARD_ONLY) expect({ q, names: await names(q) }).toEqual({ q, names: [] });
    expect(await names("Tr_kya")).toEqual([]);
    expect(await names("H%k")).toEqual([]);
    expect(await names("%100")).toEqual(["Trakya Pano"]);
    expect(await names("hidrolik")).toEqual(["Ege Hidrolik"]);
  });

  it("typeahead company suggestion: the whole query is a literal", async () => {
    const names = async (q: string) => (await marketplace().suggest(q, "companies")).companies.map((c) => c.name);
    expect(await names("Trakya")).toEqual(["Trakya Pano"]);
    expect(await names("Tr_kya")).toEqual([]);
    for (const q of WILDCARD_ONLY) expect({ q, names: await names(q) }).toEqual({ q, names: [] });
  });
});

describe("AI category hint resolver", () => {
  beforeEach(async () => {
    await prisma.category.createMany({
      data: [
        { id: "39120000", code: "39120000", nameTr: "Elektrik ekipmanları", searchText: "elektrik ekipmanlari", level: 2, inDiscovery: true },
        { id: "39121000", code: "39121000", nameTr: "Dağıtım panosu", searchText: "dagitim panosu", level: 3, inDiscovery: true },
        { id: "39121100", code: "39121100", nameTr: "Sigorta %10 toleranslı", searchText: "sigorta %10 toleransli", level: 3, inDiscovery: true },
      ],
    });
  });

  it("the pool query takes hint tokens as literals", async () => {
    const seen: unknown[] = [];
    const spy = {
      category: {
        findMany: (args: { where: unknown }) => {
          seen.push(args.where);
          return prisma.category.findMany(args as never);
        },
      },
    } as unknown as PrismaService;

    const out = await resolveCategoryHints(spy, ["%%", "pan_", "dağıtım panosu"]);

    // Only the real phrase resolves (the scoring was already literal).
    expect([...out.keys()]).toEqual(["dağıtım panosu"]);
    expect(out.get("dağıtım panosu")?.id).toBe("39121000");
    // The wildcard hints no longer pull unrelated rows into the shared pool:
    // their clauses reach the database escaped.
    const pool = seen[0] as { OR: Array<{ AND: Array<{ searchText: { contains: string } }> }> };
    expect(pool.OR.map((c) => c.AND.map((t) => t.searchText.contains))).toEqual([
      ["\\%\\%"],
      ["pan\\_"],
      ["dagitim", "pano"],
    ]);
  });

  it("with the real database: '%%' matched every class before, now none; a literal % still resolves", async () => {
    const pool = async (hint: string) =>
      prisma.category.count({ where: { level: { in: [3, 4] }, AND: await hintClause(hint) } });
    expect(await pool("%%")).toBe(0);
    expect(await pool("pan_")).toBe(0);
    expect(await pool("%10")).toBe(1);

    const out = await resolveCategoryHints(prisma as unknown as PrismaService, ["sigorta %10", "%%"]);
    expect([...out.entries()].map(([hint, c]) => [hint, c.id])).toEqual([["sigorta %10", "39121100"]]);
  });
});

type HintClause = Array<{ searchText: { contains: string } }>;

/**
 * The resolver's own pool clause for ONE hint, read back from the resolver
 * through a recording client (so the test follows the real code, not a copy).
 */
async function hintClause(hint: string): Promise<HintClause> {
  let captured: HintClause = [];
  const recorder = {
    category: {
      findMany: (args: { where: { OR?: Array<{ AND: HintClause }> } }) => {
        if (args.where.OR?.[0]) captured = args.where.OR[0].AND;
        return Promise.resolve([]);
      },
    },
  } as unknown as PrismaService;
  await resolveCategoryHints(recorder, [hint]);
  return captured;
}
