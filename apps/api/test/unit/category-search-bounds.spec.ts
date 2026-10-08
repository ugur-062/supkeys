import { foldSearchText } from "@rothern/shared";
import { CategoryController } from "../../src/modules/categories/controllers/category.controller";
import {
  CATEGORY_SEARCH_MAX_LENGTH,
  CATEGORY_SEARCH_MAX_TOKENS,
  CategoryService,
} from "../../src/modules/categories/services/category.service";
import {
  categoryMatchScore,
  categoryNameMatchesAll,
  CATEGORY_WORD_BOUNDARIES,
} from "../../src/modules/categories/services/category-search-rank";
import { likeLiteral } from "../../src/common/prisma/like-literal";
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

/**
 * code-category-2 + cat-search-stem-displaces-typed-word: the word as typed is
 * the primary filter (the pre-stem predicate); a term with a different stem
 * adds a second query with the stem (shared `stemPrefix`, same rule as product
 * search), whose rows only fill the places the typed rows leave. Digits-only
 * (code) queries are unchanged.
 */
describe("CategoryService.searchHierarchical stem tolerance", () => {
  const tokensOf = (call: unknown[], column: 0 | 1) => {
    const where = (call[0] as { where: AndFilter }).where;
    return (where.AND ?? []).map((c) => Object.values(c.OR[column])[0].contains);
  };

  it("typed form first, then the stem of each word: Turkish suffix and English plural", async () => {
    const { service, findMany } = rig();
    await service.searchHierarchical("Çelik Boruları pipes");
    const levels = findMany.mock.calls.map((c) => c[0].where.level);
    // Every level asks twice: typed form, then stem.
    expect(levels).toEqual([{ in: [3, 4] }, { in: [3, 4] }, 2, 2, 1, 1]);
    for (const first of [0, 2, 4]) {
      expect(tokensOf(findMany.mock.calls[first], 0)).toEqual(["celik", "borulari", "pipes"]);
      expect(tokensOf(findMany.mock.calls[first], 1)).toEqual(["Çelik", "Boruları", "pipes"]);
      // Stem query: a word without a suffix keeps the typed (substring) predicate;
      // a stemmed word is searched at a WORD START only (startsWith, or after a
      // boundary character), in searchText and in the unfolded nameTr fallback.
      const stemWhere = (findMany.mock.calls[first + 1][0] as { where: { AND: Array<{ OR: Array<Record<string, { contains?: string; startsWith?: string }>> }> } }).where;
      const [celik, boru, pipe] = stemWhere.AND;
      expect(celik.OR).toEqual([
        { searchText: { contains: "celik" } },
        { nameTr: { contains: "Çelik", mode: "insensitive" } },
      ]);
      for (const [clause, folded, raw] of [[boru, "boru", "Boru"], [pipe, "pipe", "pipe"]] as const) {
        expect(clause.OR).toEqual([
          { searchText: { startsWith: folded } },
          ...CATEGORY_WORD_BOUNDARIES.map((b) => ({ searchText: { contains: b + folded } })),
          { nameTr: { startsWith: raw, mode: "insensitive" } },
          ...CATEGORY_WORD_BOUNDARIES.map((b) => ({ nameTr: { contains: b + raw, mode: "insensitive" } })),
        ]);
      }
    }
  });

  it("a stem shorter than 4 characters is not used: no stem query at all", async () => {
    const { service, findMany } = rig();
    // stemPrefix: fries -> fr, copies -> cop, skies -> sk, bodies -> bod
    await service.searchHierarchical("fries copies skies bodies");
    expect(findMany.mock.calls.map((c) => c[0].where.level)).toEqual([{ in: [3, 4] }, 2, 1]);
    expect(andTokens(findMany)).toEqual(["fries", "copies", "skies", "bodies"]);
  });

  it("a word without a suffix is searched as typed", async () => {
    const { service, findMany } = rig();
    await service.searchHierarchical("rulman kablo vana");
    expect(andTokens(findMany)).toEqual(["rulman", "kablo", "vana"]);
  });

  /**
   * Rig with rows: the pool query answers by the form it was asked with
   * ("kablolar" typed / "kablo" stem), the chain query returns the parents.
   */
  function poolRig(typedCount: number, stemOnlyCount: number) {
    const segment = { id: "26000000", code: "26000000", nameTr: "Guc dagitimi", nameEn: null, nameRu: null, level: 1, segmentLetter: null, sortOrder: 0, parent: null };
    const family = { ...segment, id: "26120000", code: "26120000", nameTr: "Iletkenler", level: 2, parent: segment };
    const cls = { ...segment, id: "26121600", code: "26121600", nameTr: "Aksesuarlar", level: 3, parent: family };
    const row = (prefix: string, nameTr: string, i: number) => ({
      id: `${prefix}${i}`,
      code: `${prefix}${i}`,
      nameTr: `${nameTr} ${i}`,
      nameEn: null,
      nameRu: null,
      level: 4,
      sortOrder: i,
    });
    const typed = Array.from({ length: typedCount }, (_, i) => row("typed", "Kablolar", i));
    const stemOnly = Array.from({ length: stemOnlyCount }, (_, i) => row("stem", "Kablo tesisati", i));
    const byId = new Map([...typed, ...stemOnly].map((r) => [r.id, { ...r, parent: cls }] as const));
    const nameNeedles: string[] = [];
    const findMany = jest.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
      const where = args.where as {
        id?: { in: string[] };
        level?: unknown;
        AND?: Array<{ OR: Array<Record<string, { contains: string }>> }>;
      };
      if (where.id) return where.id.in.map((id) => byId.get(id));
      if (typeof where.level === "number") return [];
      const first = where.AND?.[0]?.OR[0] ?? {};
      if (first.nameTr) {
        const p = first.nameTr as { contains?: string; startsWith?: string };
        nameNeedles.push(p.contains ?? `^${p.startsWith}`);
        return [];
      }
      const rows = first.searchText?.contains === "kablolar" ? typed : [...stemOnly, ...typed];
      return rows.slice(0, args.take);
    });
    const prisma = { category: { findMany }, categorySearchMiss: { upsert: jest.fn() } };
    const service = new CategoryService(prisma as unknown as PrismaService);
    const shown = (res: Awaited<ReturnType<CategoryService["searchHierarchical"]>>) =>
      res.segments.flatMap((s) => s.families.flatMap((f) => f.classes.flatMap((c) => c.commodities.map((m) => m.id))));
    return { service, nameNeedles, shown };
  }

  it("stem-only rows fill only the places typed rows leave under the result cap", async () => {
    // 150 typed rows: all shown, first; 50 of the 300 stem-only rows fill the rest.
    const some = poolRig(150, 300);
    const partly = await some.service.searchHierarchical("kablolar");
    const ids = some.shown(partly);
    expect(ids).toHaveLength(200);
    expect(ids.slice(0, 150).every((id) => id.startsWith("typed"))).toBe(true);
    expect(ids.slice(150).every((id) => id.startsWith("stem"))).toBe(true);
    expect(partly.truncated).toBe(true);

    // 250 typed rows: nothing is left, no stem-only row is shown.
    const many = poolRig(250, 300);
    const full = await many.service.searchHierarchical("kablolar");
    expect(many.shown(full)).toHaveLength(200);
    expect(many.shown(full).every((id) => id.startsWith("typed"))).toBe(true);
    expect(full.truncated).toBe(true);

    // Few rows of both kinds: everything is shown and nothing is cut.
    const few = poolRig(3, 4);
    const all = await few.service.searchHierarchical("kablolar");
    expect(few.shown(all)).toEqual(["typed0", "typed1", "typed2", "stem0", "stem1", "stem2", "stem3"]);
    expect(all.truncated).toBe(false);
  });

  it("a full typed pool is widened by name with the TYPED word only; stem rows are not used", async () => {
    const { service, nameNeedles, shown } = poolRig(1000, 300);
    const res = await service.searchHierarchical("kablolar");
    expect(nameNeedles).toEqual(["kablolar"]);
    expect(shown(res)).toHaveLength(200);
    expect(shown(res).every((id) => id.startsWith("typed"))).toBe(true);
    expect(res.truncated).toBe(true);
  });

  it("a full stem pool is widened by name with the stem when typed rows leave room", async () => {
    const { service, nameNeedles, shown } = poolRig(5, 1200);
    const res = await service.searchHierarchical("kablolar");
    // "^" = asked at a word start (startsWith), not as a substring.
    expect(nameNeedles).toEqual(["^kablo"]);
    expect(shown(res).slice(0, 5)).toEqual(["typed0", "typed1", "typed2", "typed3", "typed4"]);
    expect(shown(res)).toHaveLength(200);
    expect(res.truncated).toBe(true);
  });

  it("digits-only code query keeps the code prefix and the unstemmed text predicate", async () => {
    const { service, findMany } = rig();
    await service.searchHierarchical("31161603");
    const where = findMany.mock.calls[0][0].where as {
      OR: [{ code: { startsWith: string } }, AndFilter];
    };
    expect(where.OR[0]).toEqual({ code: { startsWith: "31161603" } });
    expect((where.OR[1].AND ?? []).map((c) => c.OR[0].searchText.contains)).toEqual([
      "31161603",
    ]);
  });
});

describe("categoryMatchScore with stem matches", () => {
  const score = (nameTr: string, token: string, nameEn?: string) =>
    categoryMatchScore({ nameTr, nameEn }, [foldSearchText(token)], foldSearchText(token));

  it("a name carrying the typed word ranks above a name matched only by the stem", () => {
    const exactFirst = score("Kablolar", "kablolar");
    const exactLater = score("Elektrik kabloları", "kablolar");
    const stemFirst = score("Kablo tesisatı", "kablolar");
    const stemLater = score("Elektrik kablosu", "kablolar");
    expect(exactFirst).toBe(4);
    expect(exactLater).toBe(3);
    expect(stemFirst).toBeLessThan(exactLater);
    expect(stemLater).toBeLessThan(stemFirst);
    expect(stemLater).toBeGreaterThan(0);
  });

  it("stem match keeps its own order: whole word > prefix of another word > synonym only", () => {
    const wholeWord = score("Rulmanlar ve yataklar", "rulmanları");
    const otherWord = score("Kablosuz ağ", "kablolar");
    expect(score("Araç rulmanları", "rulmanları")).toBeGreaterThan(wholeWord);
    expect(wholeWord).toBeGreaterThan(otherWord);
    expect(otherWord).toBeGreaterThan(0);
    expect(score("Silikon gres", "rulmanları")).toBe(0);
  });

  it("English plural: 'pipes' scores a name with 'pipe', below a name with 'pipes'", () => {
    const stem = score("Ad", "pipes", "Steel pipe");
    expect(stem).toBeGreaterThan(0);
    expect(score("Ad", "pipes", "Steel pipes")).toBeGreaterThan(stem);
  });

  it("a word without a suffix scores exactly as before", () => {
    expect(score("Rulmanlar ve yataklar", "rulman")).toBe(4);
    expect(score("Vanadyum", "vana")).toBe(2);
    expect(score("Silikon gres", "rulman")).toBe(0);
  });

  it("a stem shorter than 4 characters gives no score (fries -> fr, copies -> cop)", () => {
    expect(score("Fren sistemleri ve bileşenleri", "fries")).toBe(0);
    expect(score("Bakır dövme parçalar", "copies", "Copper forgings")).toBe(0);
    // The word itself still scores.
    expect(score("Ad", "fries", "French fries")).toBe(3);
  });
});

/**
 * sector-name-criterion (a): name words are split on punctuation, so a term
 * that carries punctuation (hyphen, dot, ...) can never equal a name word. It
 * is matched as a phrase: at the start of the name, at the start of a word, or
 * inside a word.
 */
describe("categoryMatchScore with punctuated terms", () => {
  const score = (nameTr: string, token: string, extra: { nameRu?: string } = {}) =>
    categoryMatchScore({ nameTr, ...extra }, [foldSearchText(token)], foldSearchText(token));

  it("scores a hyphenated term by where it starts in the name", () => {
    expect(score("O-ring contalar", "o-ring")).toBe(4);
    expect(score("Viton o-ring", "o-ring")).toBe(2);
    expect(score("Mikro-ringler", "o-ring")).toBe(1);
    expect(score("Conta takımı", "o-ring")).toBe(0);
  });

  it("scores the hyphenated word of a Russian name", () => {
    const nameRu = "Оборудование для погрузочно-разгрузочных работ";
    expect(score("Ad", "погрузочно-разгрузочных", { nameRu })).toBe(2);
  });

  it("a dotted measure is a phrase too", () => {
    expect(score("2.5 mm kablo", "2.5")).toBe(4);
    expect(score("Kablo 2.5 mm", "2.5")).toBe(2);
    expect(score("Kablo 12.55 mm", "2.5")).toBe(1);
  });

  it("a Turkish suffix on a hyphenated term still finds the base form, below the typed form", () => {
    const stem = score("O-ring contalar", "o-ringler");
    expect(stem).toBeGreaterThan(0);
    expect(score("O-ringler", "o-ringler")).toBeGreaterThan(stem);
  });
});

/**
 * category-17: `%`, `_` and `\` typed by the user are literal characters.
 * Prisma `contains` puts the value into the LIKE pattern unescaped, so every
 * pattern predicate of the search gets the escaped text.
 */
describe("CategoryService.searchHierarchical LIKE literals (category-17)", () => {
  it("likeLiteral escapes the three LIKE metacharacters and nothing else", () => {
    expect(likeLiteral("%")).toBe("\\%");
    expect(likeLiteral("_")).toBe("\\_");
    expect(likeLiteral("\\")).toBe("\\\\");
    expect(likeLiteral("a_b%c\\d")).toBe("a\\_b\\%c\\\\d");
    expect(likeLiteral("çelik boru 1/2\" (DN15) [x] ^ $ . * + ? '")).toBe(
      "çelik boru 1/2\" (DN15) [x] ^ $ . * + ? '",
    );
    expect(likeLiteral("")).toBe("");
  });

  it("token predicates carry the escaped word (searchText and nameTr fallback)", async () => {
    const { service, findMany } = rig();
    await service.searchHierarchical("%50 A_b c\\d");
    expect(andTokens(findMany)).toEqual(["\\%50", "a\\_b", "c\\\\d"]);
    const where = findMany.mock.calls[0][0].where as AndFilter;
    expect((where.AND ?? []).map((c) => c.OR[1].nameTr.contains)).toEqual([
      "\\%50",
      "A\\_b",
      "c\\\\d",
    ]);
  });

  it("the stem query is escaped too", async () => {
    const { service, findMany } = rig();
    await service.searchHierarchical("bo_uları");
    expect(andTokens(findMany)).toEqual(["bo\\_ulari"]);
    const stemWhere = findMany.mock.calls[1][0].where as {
      AND: Array<{ OR: Array<Record<string, { contains?: string; startsWith?: string }>> }>;
    };
    const needles = stemWhere.AND[0].OR.map((c) => Object.values(c)[0]).map((p) => p.startsWith ?? p.contains);
    // Every word-start pattern carries the escaped stem (never a raw "_").
    expect(needles).toHaveLength(2 * (1 + CATEGORY_WORD_BOUNDARIES.length));
    expect(needles.every((n) => n!.endsWith("bo\\_u"))).toBe(true);
  });

  it("whole-phrase fallback is escaped too", async () => {
    const { service, findMany } = rig();
    // only a stopword and a one-character word -> whole-phrase OR branch
    await service.searchHierarchical("ve %");
    const where = findMany.mock.calls[0][0].where as {
      OR: Array<Record<string, { contains: string }>>;
    };
    expect(where.OR[0].searchText.contains).toBe("ve \\%");
    expect(where.OR[1].nameTr.contains).toBe("ve \\%");
  });

  it("the family (level 2) and sector (level 1) queries use the same escaped filter", async () => {
    const { service, findMany } = rig();
    await service.searchHierarchical("a_");
    const levels = findMany.mock.calls.map((c) => c[0].where.level);
    expect(levels).toEqual([{ in: [3, 4] }, 2, 1]);
    for (const call of findMany.mock.calls) {
      const where = call[0].where as AndFilter;
      expect((where.AND ?? []).map((c) => c.OR[0].searchText.contains)).toEqual(["a\\_"]);
    }
  });
});

/**
 * category-18: a sector (level 1) is returned only when its NAME carries every
 * word of the query; a word found only in its synonyms does not open it.
 */
describe("categoryNameMatchesAll", () => {
  const matches = (nameTr: string, query: string, extra: { nameEn?: string } = {}) => {
    const tokens = query.split(" ").map((w) => foldSearchText(w));
    return categoryNameMatchesAll({ nameTr, ...extra }, tokens, foldSearchText(query));
  };

  it("every word must be in the name (any order, folded, inflected)", () => {
    const name = "Elektrik Sistemleri ve Aydınlatma";
    expect(matches(name, "elektrik sistemleri aydinlatma")).toBe(true);
    expect(matches(name, "aydınlatma elektrik")).toBe(true);
    expect(matches(name, "elektrik sistemi")).toBe(true);
    expect(matches(name, "elektrik")).toBe(true);
    expect(matches(name, "elektrik hidrolik")).toBe(false);
    expect(matches(name, "rulman")).toBe(false);
  });

  it("the words may come from different language names", () => {
    expect(matches("Kimyasal Maddeler", "chemicals", { nameEn: "Chemicals" })).toBe(true);
    expect(matches("Kimyasal Maddeler", "kimyasal chemicals", { nameEn: "Chemicals" })).toBe(true);
  });

  it("no word means no match", () => {
    expect(categoryNameMatchesAll({ nameTr: "Elektrik" }, [], "")).toBe(false);
  });

  // sector-name-criterion (b)
  it("a hit inside another word does not count; the start of a word does", () => {
    const facility = { nameEn: "Building and Facility Construction and Maintenance Services" };
    expect(matches("Bina ve Tesis İnşaat ve Bakım Hizmetleri", "acil", facility)).toBe(false);
    expect(matches("Bina ve Tesis İnşaat ve Bakım Hizmetleri", "facility", facility)).toBe(true);
    expect(matches("Bina ve Tesis İnşaat ve Bakım Hizmetleri", "facil", facility)).toBe(true);
    const name = "Elektrik Sistemleri ve Aydınlatma";
    expect(matches(name, "elektrik sist")).toBe(true);
    expect(matches(name, "lektrik")).toBe(false);
    // The stem inside another word does not count either: "nakliye" -> "nakli" in "kaynaklı".
    expect(matches("Kaynaklı İmalat Hizmetleri", "nakliye")).toBe(false);
  });

  // sector-name-criterion (a)
  it("a term with punctuation matches the name it was copied from", () => {
    const nameRu = "Оборудование для погрузочно-разгрузочных работ, кондиционирования и хранения";
    const row = { nameTr: "Malzeme Taşıma, İklimlendirme ve Depolama Makineleri", nameRu };
    const tokens = ["оборудование", "для", "погрузочно-разгрузочных", "работ", "кондиционирования", "хранения"];
    expect(categoryNameMatchesAll(row, tokens, foldSearchText(nameRu))).toBe(true);
    expect(categoryNameMatchesAll(row, ["погрузочно-разгрузочных"], "погрузочно-разгрузочных")).toBe(true);
    expect(categoryNameMatchesAll(row, ["узочно-разгрузочных"], "узочно-разгрузочных")).toBe(false);
  });
});

describe("CategoryService.searchHierarchical sector query (category-18)", () => {
  it("code and stopword-only queries do not ask for sectors", async () => {
    for (const q of ["31161603", "ve ile"]) {
      const { service, findMany } = rig();
      await service.searchHierarchical(q);
      expect(findMany.mock.calls.map((c) => c[0].where.level)).toEqual([{ in: [3, 4] }, 2]);
    }
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
