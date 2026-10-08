import { foldSearchText } from "@rothern/shared";
import { CategoryController } from "../../src/modules/categories/controllers/category.controller";
import {
  CATEGORY_SEARCH_MAX_LENGTH,
  CATEGORY_SEARCH_MAX_TOKENS,
  CategoryService,
} from "../../src/modules/categories/services/category.service";
import {
  categoryMatchScore,
  categoryNameKey,
  categoryNameMatchesAll,
  categoryRowRank,
  compareCategoryRank,
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
 * code-category-2 + recategory-new-1: every word is asked as typed (substring)
 * and, when its stem differs (`categorySearchStem`), a second query asks the
 * stem at a word start. The rows of both queries are merged and ordered by
 * `categoryRowRank` (name + typed word, name + stem, synonyms + typed word,
 * synonyms + stem); the result cap applies after that order. Digits-only
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

  it("rows whose name carries the typed word come first; name-stem rows take the places left under the cap", async () => {
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

  it("both full pools are widened by name: the typed word, and the stem at a word start", async () => {
    // A name that carries the stem ranks above a row that has the typed word only
    // in its synonyms, so the stem pool is consulted even when the typed pool is full.
    const { service, nameNeedles, shown } = poolRig(1000, 300);
    const res = await service.searchHierarchical("kablolar");
    expect(nameNeedles).toEqual(["kablolar", "^kablo"]);
    // 1000 names carry the typed word: they fill the 200 places.
    expect(shown(res)).toHaveLength(200);
    expect(shown(res).every((id) => id.startsWith("typed"))).toBe(true);
    expect(res.truncated).toBe(true);
  });

  /**
   * recategory-new-1: the order under the cap is by match class, not by "typed
   * anywhere first". Rows: `syn` has the typed word only in its synonyms, `name`
   * carries the stem in its name, `deep` has only the stem, only in its synonyms.
   */
  it("a name that carries the stem outranks a typed word found only in synonyms, under the cap too", async () => {
    const segment = { id: "40000000", code: "40000000", nameTr: "Dagitim", nameEn: null, nameRu: null, level: 1, segmentLetter: null, sortOrder: 0, parent: null };
    const family = { ...segment, id: "40150000", code: "40150000", nameTr: "Akiskan", level: 2, parent: segment };
    const cls = { ...segment, id: "40151500", code: "40151500", nameTr: "Aksam", level: 3, parent: family };
    const row = (prefix: string, i: number, nameTr: string, keywords: string) => ({
      id: `${prefix}${i}`,
      code: `${prefix}${i}`,
      nameTr: `${nameTr} ${i}`,
      nameEn: null,
      nameRu: null,
      level: 4,
      sortOrder: i,
      searchText: foldSearchText(`${nameTr} ${i} ${keywords}`),
    });
    // Catalogue order is the reverse of the expected order.
    const deep = Array.from({ length: 30 }, (_, i) => row("deep", i, "Conta takimi", "pompa parcasi"));
    const syn = Array.from({ length: 150 }, (_, i) => row("syn", i, "Test cihazi", "pompasi"));
    const name = Array.from({ length: 100 }, (_, i) => row("name", i, "Hidrolik pompalar", ""));
    const typedName = [row("typed", 0, "Yakit pompasi", "")];
    const all = [...deep, ...syn, ...name, ...typedName];
    const byId = new Map(all.map((r) => [r.id, { ...r, parent: cls }] as const));
    const findMany = jest.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
      const where = args.where as { id?: { in: string[] }; level?: unknown; AND?: Array<{ OR: Array<Record<string, { contains?: string }>> }> };
      if (where.id) return where.id.in.map((id) => byId.get(id));
      if (typeof where.level === "number") return [];
      // Typed query: rows whose search text has "pompasi"; stem query: every row.
      const typed = where.AND?.[0]?.OR[0]?.searchText?.contains === "pompasi";
      return (typed ? all.filter((r) => r.searchText.includes("pompasi")) : all).slice(0, args.take);
    });
    const service = new CategoryService({ category: { findMany }, categorySearchMiss: { upsert: jest.fn() } } as unknown as PrismaService);

    const res = await service.searchHierarchical("pompası");

    const ids = res.segments.flatMap((s) => s.families.flatMap((f) => f.classes.flatMap((c) => c.commodities.map((m) => m.id))));
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe("typed0");
    expect(ids.slice(1, 101).every((id) => id.startsWith("name"))).toBe(true);
    // 99 places are left for the 150 synonym rows; the stem-in-synonym rows get none.
    expect(ids.slice(101).every((id) => id.startsWith("syn"))).toBe(true);
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
 * recategory-new-1 / new-2: the place of a row. First the whole-name match,
 * then the match class (worst word decides), then the score.
 */
describe("categoryRowRank", () => {
  const rank = (nameTr: string, query: string, keywords = "", extra: { nameEn?: string; nameRu?: string } = {}) => {
    const tokens = query.split(" ").map((w) => foldSearchText(w));
    return categoryRowRank(
      { nameTr, ...extra, searchText: foldSearchText(`${nameTr} ${keywords} ${extra.nameEn ?? ""} ${extra.nameRu ?? ""}`) },
      tokens,
      foldSearchText(query),
    );
  };

  it("match class: name + typed, name + stem at a word start, synonyms + typed, synonyms + stem", () => {
    expect(rank("Yakıt pompası", "pompası").matchClass).toBe(0);
    expect(rank("Hidrolik pompalar", "pompası").matchClass).toBe(1);
    expect(rank("Basınç test cihazı", "pompası", "hidrolik pompası").matchClass).toBe(2);
    expect(rank("Conta takımı", "pompası", "pompa parçası").matchClass).toBe(3);
  });

  it("the typed word inside a name word is class 0; the stem inside a word is not a name match", () => {
    // "yağ" in "Tereyağı": the name carries the typed word.
    expect(rank("Tereyağı", "yağ").matchClass).toBe(0);
    // "nakliye" -> stem "nakli" sits inside "kaynaklı": the name does not count.
    expect(rank("Solvent kaynaklı boru", "nakliye", "nakliye").matchClass).toBe(2);
    expect(rank("Solvent kaynaklı boru", "nakliye", "nakliyat").matchClass).toBe(3);
  });

  it("a name word that is an inflection of the stem is class 1 even when it happens to start with the typed form", () => {
    const ru = (nameRu: string) => rank("Ad", "труба", "", { nameRu }).matchClass;
    expect(ru("Медная труба")).toBe(0);
    // "трубах" = "труба" + "х" by spelling, but it is the stem "труб" + case ending, like "трубы".
    expect(ru("Инструменты для бурения на обсадных трубах")).toBe(1);
    expect(ru("Сварные стальные трубы")).toBe(1);
    // No inflection reading: the typed form as the start of another word stays class 0.
    expect(rank("Motorlu araçlar", "motor").matchClass).toBe(0);
    expect(rank("Pompasız sistemler", "pompası").matchClass).toBe(0);
  });

  it("several words: the worst word decides the class", () => {
    // hidrolik: name; pompası: stem in the name.
    expect(rank("Hidrolik pompalar", "hidrolik pompası").matchClass).toBe(1);
    // hidrolik: name; pompası: only in the synonyms.
    expect(rank("Hidrolik basınç test cihazı", "hidrolik pompası", "pompası").matchClass).toBe(2);
    // pompası: stem in the name; hidrolik: only in the synonyms.
    expect(rank("Pompa verimi test ekipmanı", "hidrolik pompası", "hidrolik").matchClass).toBe(2);
    expect(rank("Hidrolik pompası", "hidrolik pompası").matchClass).toBe(0);
  });

  it("the name may be in any language", () => {
    expect(rank("Hırdavat", "hardware", "", { nameEn: "Hardware" }).matchClass).toBe(0);
    expect(rank("Boya", "красители", "", { nameRu: "Красители и пигменты" }).matchClass).toBe(0);
    expect(rank("Kablolar", "кабель", "", { nameRu: "Электрические кабели" }).matchClass).toBe(1);
  });

  it("exact: the whole name equals the query, in any language, folded and without punctuation", () => {
    expect(rank("Hırdavat", "hardware", "", { nameEn: "Hardware" }).exact).toBe(true);
    expect(rank("Hırdavat", "HIRDAVAT").exact).toBe(true);
    expect(rank("Boyalar", "красители", "", { nameRu: "Красители" }).exact).toBe(true);
    expect(rank("Borular, boru hatları ve boru bağlantı elemanları", "borular boru hatları ve boru bağlantı elemanları").exact).toBe(true);
    expect(rank("Muhtelif hırdavat", "hırdavat").exact).toBe(false);
    expect(rank("Hırdavat", "hırdavatı").exact).toBe(false);
    expect(rank("Bilgisayar servisleri", "hardware", "hardware").exact).toBe(false);
  });

  it("a row without search text still gets its class from the name", () => {
    expect(categoryRowRank({ nameTr: "Kablolar" }, ["kablolar"], "kablolar")).toEqual({
      exact: true,
      matchClass: 0,
      score: 4,
      wordMatch: true,
    });
    expect(categoryRowRank({ nameTr: "Kablo tesisatı" }, ["kablolar"], "kablolar").matchClass).toBe(1);
    expect(categoryRowRank({ nameTr: "Bağlantı elemanları" }, ["kablolar"], "kablolar").matchClass).toBe(3);
  });

  it("order: exact name, then class, then score", () => {
    const rows = [
      { id: "syn-stem", r: rank("Conta takımı", "pompalar", "pompa parçası") },
      { id: "syn", r: rank("Basınç test cihazı", "pompalar", "pompalar") },
      { id: "stem-name", r: rank("Pompa gövdesi", "pompalar") },
      { id: "inside", r: rank("Motopompalar", "pompalar") },
      { id: "later-word", r: rank("Hidrolik pompalar", "pompalar") },
      { id: "first-word", r: rank("Pompalar ve kompresörler", "pompalar") },
      { id: "exact", r: rank("Pompalar", "pompalar") },
    ];
    expect(rows.map((x) => [x.id, x.r.matchClass])).toEqual([
      ["syn-stem", 3],
      ["syn", 2],
      ["stem-name", 1],
      ["inside", 0],
      ["later-word", 0],
      ["first-word", 0],
      ["exact", 0],
    ]);
    const sorted = [...rows].sort((a, b) => compareCategoryRank(a.r, b.r)).map((x) => x.id);
    expect(sorted).toEqual(["exact", "first-word", "later-word", "inside", "stem-name", "syn", "syn-stem"]);
  });

  it("wordMatch: every word is a name word or an inflection of it (typed or stem), not just the start of one", () => {
    expect(rank("Tekstil iplikleri", "tekstil").wordMatch).toBe(true);
    expect(rank("Metaller, Mineraller, Tekstil ve Doğal Malzemeler", "tekstil").wordMatch).toBe(true);
    // Inflection of the typed word, and the stem as a word.
    expect(rank("Rulmanlar ve yataklar", "rulman").wordMatch).toBe(true);
    expect(rank("Hidrolik pompalar", "hidrolik pompası").wordMatch).toBe(true);
    expect(rank("Ad", "сварка", "", { nameRu: "Оборудование для сварки и пайки" }).wordMatch).toBe(true);
    // Only the start of another word, inside a word, or in the synonyms.
    expect(rank("Motorlu araçlar", "motor").wordMatch).toBe(false);
    expect(rank("Vanadyum", "vana").wordMatch).toBe(false);
    expect(rank("Tereyağı", "yağ").wordMatch).toBe(false);
    expect(rank("Basınç test cihazı", "pompa", "pompa").wordMatch).toBe(false);
    // One weak word is enough to lose it.
    expect(rank("Motorlu taşıt rulmanları", "motor rulman").wordMatch).toBe(false);
    expect(rank("Motor rulmanları", "motor rulman").wordMatch).toBe(true);
  });

  it("wordMatch with a shown name looks at that name only; class and score still use every language", () => {
    const row = { nameTr: "Motorlu araçlar", nameEn: "Motor vehicles", searchText: "motorlu araclar motor vehicles" };
    // Any language (no shown name): the English name carries the word.
    expect(categoryRowRank(row, ["motor"], "motor").wordMatch).toBe(true);
    // Turkish reader sees "Motorlu araçlar": only the start of a word.
    const tr = categoryRowRank(row, ["motor"], "motor", row.nameTr);
    expect(tr).toMatchObject({ wordMatch: false, matchClass: 0, score: 4 });
    // English reader sees "Motor vehicles".
    expect(categoryRowRank(row, ["motor"], "motor", row.nameEn).wordMatch).toBe(true);
  });

  it("categoryNameKey folds, drops punctuation and collapses spaces", () => {
    expect(categoryNameKey("  Borular,  boru hatları (çelik) ")).toBe("borular boru hatlari celik");
    expect(categoryNameKey("Красители")).toBe("красители");
    expect(categoryNameKey(" , ")).toBe("");
  });
});

/**
 * recategory-new-3: Russian case endings are inflections of the same word, so
 * a name with the plural ranks like the Turkish / English plural does.
 */
describe("categoryMatchScore with Russian word forms", () => {
  const score = (nameRu: string, token: string) =>
    categoryMatchScore({ nameTr: "Ad", nameRu }, [foldSearchText(token)], foldSearchText(token));

  it("typed base form: the plural in the name is the same word (4 first word, 3 later)", () => {
    expect(score("Подшипники и вкладыши", "подшипник")).toBe(4);
    expect(score("Фланцевые подшипники", "подшипник")).toBe(3);
    // A derived word only starts with it.
    expect(score("Подшипниковые узлы", "подшипник")).toBe(2);
  });

  it("typed plural / case form finds the base form through the stem, below the typed form", () => {
    const plural = score("Электрические кабели", "кабели");
    const base = score("Силовой кабель", "кабели");
    const derived = score("Кабельные жгуты", "кабели");
    expect(plural).toBe(3);
    expect(base).toBeLessThan(plural);
    expect(base).toBeGreaterThan(derived);
    expect(derived).toBeGreaterThan(0);
    // "сварка" -> "сварк": the genitive in the family name.
    expect(score("Оборудование для сварки и пайки", "сварка")).toBeGreaterThan(0);
    expect(score("Оборудование для пайки", "сварка")).toBe(0);
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
