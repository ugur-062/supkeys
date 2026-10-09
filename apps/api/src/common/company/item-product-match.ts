import { categoryAtLevel, foldSearchText, stemPrefix, tokenizeQuery, UNITS, type UnitDimension } from "@rothern/shared";
import type { Prisma } from "@rothern/db";
import { productCategoryWhere, productSearchClauses } from "./product-index";

/**
 * LINE ITEM -> SHOWCASE PRODUCT, RELAXED MATCH (round 5, D5) — single source.
 *
 * `productSearchClauses` ANDs every token of the text it gets. That is right
 * for a search box, but a buyer's line item carries sizes, standards and
 * qualifiers the seller never wrote on the product: "Hidrolik silindir 80 mm
 * cift etkili" did not find the product "... Hidrolik Silindir 80 mm", and the
 * platform tab never reached an item match for a realistic request.
 *
 * Rule (supplier discovery; the full name is always tried first by the caller):
 *  - SIGNIFICANT tokens of the item name: letters only, 3+ characters, not a
 *    measurement unit, a size word, a standards body, a generic qualifier or a
 *    shared stop word; folded and stemmed with the shared search-fold helpers,
 *    one token per stem, the first `ITEM_MATCH_MAX_TOKENS` in reading order.
 *
 * A RELAXED HIT IS A WEAK SIGNAL (round 5 review, R5-01). "Any two significant
 * tokens" also matches two QUALIFIER or MATERIAL words without the product
 * noun: "Hidrolik silindir 80 mm cift etkili" matched "Cift etkili pnomatik
 * valf", "Paslanmaz celik boru 2 inc dikissiz" matched "Paslanmaz celik
 * tencere seti" - and such sellers were shown as item matches, ranked above a
 * real sub-category match, invited by the automatic run and mailed "a buyer is
 * looking for what you sell". Nothing in the text tells the noun from its
 * qualifiers, so the rule has two levels:
 *
 *  - WEAK coverage - at least TWO significant tokens (the single one when the
 *    item has only one): counts ONLY when a category corroborates it:
 *      a) the company declares the request's category (segment or
 *         sub-category, `declaresRequestCategory`), or
 *      b) the matched PRODUCT itself sits in the request's category - the same
 *         family, which includes the same class (`productInRequestCategoryWhere`).
 *    Without either the hit is ignored: no item match, no candidate.
 *  - STRICT coverage - EVERY significant token when the item has two or three,
 *    MORE THAN HALF when it has four or more (3 of 4, 3 of 5, 4 of 6): counts
 *    for any company. A single-token item has no strict level.
 *
 * Either way a relaxed hit makes a STRONG match only together with a category
 * match - of the company (a) or of the matched product (b); the full-name
 * match stays strong on its own.
 *
 * WHY (b) (live re-check 2026-10-09, N2). A seller lists its product in exactly
 * the request's class and never fills the company's own category declaration:
 * "FIN PA1 Smoke Hidrolik Silindir 80 mm" in 27131700 was not offered for
 * "Hidrolik silindir 80 mm cift etkili" in 27131700 (two of four tokens - below
 * strict), while three unrelated companies that only declared the SEGMENT were.
 * The product's own category is a narrower corroboration than a declared
 * segment (which already counts): a family is one branch of that segment.
 *
 * Callers (keep them on this file - a second matcher is how the window and the
 * invitation e-mail came to disagree, R5-06): `SupplierDiscoveryService.
 * discoverRegisteredFor` (who is a candidate) and `CompanyListingsService.
 * inviteDiscoveredMembers` (the product named in the invitation).
 *
 * How ONE token matches a product stays in `productSearchClauses` (fold, stem,
 * LIKE escaping, both search columns): this file only decides which tokens
 * count and how many of them are needed.
 */

/** Significant tokens kept per item (6 tokens = 15 pairs in the OR). */
export const ITEM_MATCH_MAX_TOKENS = 6;

/**
 * Measurement units come from the shared unit catalog (weight, length, area,
 * volume + "piece"). Packaging, count sets and time units are NOT taken:
 * "kutu", "palet", "varil", "kit", "saat" are product nouns as well.
 */
const MEASURE_DIMENSIONS = new Set<UnitDimension>(["MASS", "LENGTH", "AREA", "VOLUME"]);
const UNIT_WORDS = UNITS.filter((u) => MEASURE_DIMENSIONS.has(u.dimension) || u.code === "PCE").flatMap((u) => [
  u.nameTr,
  u.symbol,
  ...u.aliases,
]);

const EXTRA_WORDS = [
  // Technical units
  "bar", "mbar", "psi", "mpa", "kpa", "volt", "watt", "amper", "amp", "kva", "kwh", "rpm", "inc", "inch", "inches",
  "mikron", "micron", "derece", "дюйм", "бар", "вольт", "ватт",
  // Size words
  "cap", "capi", "capli", "boy", "boyu", "boyut", "ebat", "ebatli", "olcu", "olculeri", "uzunluk", "kalinlik",
  "genislik", "yukseklik", "agirlik", "size", "length", "width", "height", "thickness", "diameter", "weight",
  "размер", "диаметр", "длина", "толщина", "ширина", "высота",
  // Standards bodies
  "din", "iso", "tse", "astm", "aisi", "ansi", "asme", "jis", "gost", "гост",
  // Generic qualifiers
  "tip", "tipi", "tipte", "model", "modeli", "marka", "markali", "tur", "turu", "cins", "cinsi", "type", "brand",
  "with", "without", "olan", "muhtelif", "cesitli", "тип", "модель", "марка",
];

const LETTERS_ONLY = /^\p{L}+$/u;

const NOT_DESCRIPTIVE = new Set(
  [...UNIT_WORDS, ...EXTRA_WORDS].map((w) => foldSearchText(w)).filter((w) => LETTERS_ONLY.test(w)),
);

/**
 * Significant tokens of a line item name — FOLDED, not stemmed (the caller
 * hands them to `productSearchClauses`, which stems once); one per stem.
 */
export function significantItemTokens(name: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of foldSearchText(name).split(/[^\p{L}\p{N}]+/u)) {
    if (token.length < 3 || !LETTERS_ONLY.test(token)) continue;
    if (NOT_DESCRIPTIVE.has(token) || tokenizeQuery(token).length === 0) continue;
    const stem = stemPrefix(token);
    if (stem.length < 3 || NOT_DESCRIPTIVE.has(stem) || seen.has(stem)) continue;
    seen.add(stem);
    out.push(token);
    if (out.length >= ITEM_MATCH_MAX_TOKENS) break;
  }
  return out;
}

export interface RelaxedItemMatch {
  /** Same key = same conditions: two line items that differ only in size share the queries. */
  key: string;
  /**
   * STRICT coverage - an item match for any company. null: the item has a
   * single significant token, or the condition is the full-name search again.
   */
  strict: Prisma.CompanyItemWhereInput | null;
  /**
   * WEAK coverage - an item match only with a category corroboration: the
   * company declares the request's category, or the product is in it
   * (`productInRequestCategoryWhere`). null: nothing weaker than `strict`
   * (two tokens).
   */
  weak: Prisma.CompanyItemWhereInput | null;
}

/** Tokens a product must carry for the hit to count on its own (0 = no strict level). */
export function strictCoverage(tokens: number): number {
  if (tokens < 2) return 0;
  return tokens <= 3 ? tokens : Math.floor(tokens / 2) + 1;
}

/** Product condition "at least `need` of these token clauses". */
function atLeast(clauses: Prisma.CompanyItemWhereInput[], need: number): Prisma.CompanyItemWhereInput {
  if (need >= clauses.length) return clauses.length === 1 ? clauses[0]! : { AND: clauses };
  const combos: Prisma.CompanyItemWhereInput[] = [];
  const pick = (from: number, chosen: Prisma.CompanyItemWhereInput[]) => {
    if (chosen.length === need) {
      combos.push(need === 1 ? chosen[0]! : { AND: chosen });
      return;
    }
    for (let i = from; i <= clauses.length - (need - chosen.length); i++) pick(i + 1, [...chosen, clauses[i]!]);
  };
  pick(0, []);
  return { OR: combos };
}

/**
 * Relaxed product conditions for a line item, or null when there is nothing to
 * relax: no significant token, or the only condition would be the full-name
 * search again ("Eldiven", "Hidrolik pres" - the caller has just run that query).
 */
export function relaxedItemMatch(name: string): RelaxedItemMatch | null {
  const clauses = significantItemTokens(name).flatMap((t) => productSearchClauses(t, { includeCompanyName: false }));
  if (clauses.length === 0) return null;
  const keys = clauses.map((c) => JSON.stringify(c)).sort();
  const full = productSearchClauses(name, { includeCompanyName: false })
    .map((c) => JSON.stringify(c))
    .sort();
  // "Every significant token" is the full-name search when the name has nothing else.
  const everyTokenIsFullName = full.length === keys.length && full.every((k, i) => k === keys[i]);
  const strictNeed = strictCoverage(clauses.length);
  const weakNeed = Math.min(2, clauses.length);
  const redundant = (need: number) => need === clauses.length && everyTokenIsFullName;
  const strict = strictNeed > 0 && !redundant(strictNeed) ? atLeast(clauses, strictNeed) : null;
  const weak = (strictNeed === 0 || weakNeed < strictNeed) && !redundant(weakNeed) ? atLeast(clauses, weakNeed) : null;
  if (!strict && !weak) return null;
  return { key: keys.join("|"), strict, weak };
}

/**
 * Does the company declare the request's category - the corroboration a
 * relaxed hit needs (`deriveCategoryMatchCandidates` gives the two lists)?
 */
export function declaresRequestCategory(
  company: { sellerCategoryIds: readonly string[]; sellerSubCategoryIds: readonly string[] },
  request: { segmentIds: readonly string[]; subCandidates: readonly string[] },
): boolean {
  return (
    company.sellerSubCategoryIds.some((c) => request.subCandidates.includes(c)) ||
    company.sellerCategoryIds.some((c) => request.segmentIds.includes(c))
  );
}

/**
 * Product condition "the product's OWN category is in the request's category":
 * the same FAMILY (level 2) as one of the request's codes - a product filed in
 * the request's class, in a sibling class of that family or at the family
 * itself. A request code at segment level names no family and corroborates
 * nothing (a segment is what the "segment only" tier already is). null when no
 * request code reaches a family.
 *
 * Raw codes on purpose: matching uses every stored code, also one under a
 * hidden segment (only the DISPLAY of a category is filtered).
 */
export function productInRequestCategoryWhere(requestCategoryCodes: readonly string[]): Prisma.CompanyItemWhereInput | null {
  const families = [
    ...new Set(requestCategoryCodes.map((c) => categoryAtLevel(c, 2)).filter((c): c is string => !!c)),
  ];
  if (families.length === 0) return null;
  return families.length === 1 ? productCategoryWhere(families[0]) : { OR: families.map((f) => productCategoryWhere(f)) };
}
