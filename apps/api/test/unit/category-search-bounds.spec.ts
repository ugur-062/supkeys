import { CategoryController } from "../../src/modules/categories/controllers/category.controller";
import {
  CATEGORY_SEARCH_MAX_LENGTH,
  CATEGORY_SEARCH_MAX_TOKENS,
  CategoryService,
} from "../../src/modules/categories/services/category.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";

/**
 * Public GET /categories/search-tree — derin denetim MU-11 (X01).
 * Kimliksiz uc; q sinirsizken "er er er ..." tek istekte binlerce ILIKE
 * yuklemli sorgu uretiyordu. Sozlesme: q en fazla 120 karakter, AND listesi
 * tekil ve en fazla 8 kelime.
 */
function rig() {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    category: { findMany },
    categorySearchMiss: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const service = new CategoryService(prisma as unknown as PrismaService);
  return { service, findMany };
}

type AndFilter = { AND?: Array<{ OR: Array<Record<string, { contains: string }>> }> };

function andTokens(findMany: jest.Mock): string[] {
  const where = findMany.mock.calls[0][0].where as AndFilter;
  return (where.AND ?? []).map((c) => c.OR[0].searchText.contains);
}

describe("CategoryService.searchHierarchical bounds", () => {
  it("repeated token flood collapses into a single predicate", async () => {
    const { service, findMany } = rig();
    await service.searchHierarchical(Array(5000).fill("er").join(" "));
    expect(andTokens(findMany)).toEqual(["er"]);
  });

  it("caps distinct tokens and ignores text beyond the length limit", async () => {
    const { service, findMany } = rig();
    const words = Array.from({ length: 50 }, (_, i) => `w${String(i).padStart(2, "0")}`);
    await service.searchHierarchical(words.join(" "));
    const tokens = andTokens(findMany);
    expect(tokens).toHaveLength(CATEGORY_SEARCH_MAX_TOKENS);
    expect(tokens).toEqual(words.slice(0, CATEGORY_SEARCH_MAX_TOKENS));
  });

  it("dedupes case/diacritic variants of the same word", async () => {
    const { service, findMany } = rig();
    await service.searchHierarchical("Boru boru BORU vana");
    expect(andTokens(findMany)).toEqual(["boru", "vana"]);
  });

  it("whole-phrase fallback is also length-capped", async () => {
    const { service, findMany } = rig();
    // only stopwords -> no tokens -> whole-phrase OR branch
    await service.searchHierarchical(Array(3000).fill("ve").join(" "));
    const where = findMany.mock.calls[0][0].where as {
      OR: Array<Record<string, { contains: string }>>;
    };
    expect(where.OR[1].nameTr.contains.length).toBeLessThanOrEqual(CATEGORY_SEARCH_MAX_LENGTH);
  });
});

describe("CategoryController.searchTree", () => {
  it("truncates q before it reaches the service and tolerates array q", async () => {
    const searchHierarchical = jest.fn().mockResolvedValue({ segments: [], truncated: false });
    const ctrl = new CategoryController({ searchHierarchical } as unknown as CategoryService);
    await ctrl.searchTree("x".repeat(20_000));
    expect(searchHierarchical.mock.calls[0][0]).toHaveLength(CATEGORY_SEARCH_MAX_LENGTH);
    await ctrl.searchTree(["a", "b"]);
    expect(searchHierarchical.mock.calls[1][0]).toBe("");
  });
});
