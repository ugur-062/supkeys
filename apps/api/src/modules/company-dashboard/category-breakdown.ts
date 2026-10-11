import { visibleCategoryIds } from "@rothern/shared";

/**
 * BREAKDOWN KEY of a request in the dashboard charts ("savings by category",
 * the savings tab, "win rate by category"): the SEGMENT (level 1) of its
 * first VISIBLE category.
 *
 * Owner rule 2026-10-09: a category under a hidden segment is shown nowhere,
 * and a chart label is a place where it would be shown. A legacy request
 * keeps its stored codes; here its hidden codes are skipped, so
 *  - a request with a hidden and a visible category is counted under the
 *    visible one,
 *  - a request whose categories are ALL hidden has no key (`null`) and is
 *    treated exactly like a request without a category: the savings tab puts
 *    its amount into the existing "uncategorized" bucket (totals stay
 *    consistent), the two top-6 charts leave it out as they already do for
 *    requests without a category.
 *
 * The amount is never dropped from a total and never printed under the name
 * of a hidden segment.
 */
export function breakdownSegmentOf(categoryIds: readonly string[] | null | undefined): string | null {
  const first = visibleCategoryIds(categoryIds)[0];
  return first ? `${first.slice(0, 2)}000000` : null;
}
