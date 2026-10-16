/**
 * Makes user text a LITERAL inside a LIKE / ILIKE pattern.
 *
 * Prisma `contains` / `startsWith` / `endsWith` put the value into the pattern
 * as it is, so `%` (any run of characters), `_` (any single character) and the
 * escape character `\` keep their pattern meaning. A user who typed "%%" or
 * "__" therefore matched every row, and "a_" matched "a" plus any character
 * (arayuz testi 2026-10 category-17). PostgreSQL's default LIKE escape
 * character is `\`: all three are escaped with it, so a typed character only
 * matches itself.
 *
 * Call it where user text goes into a pattern filter. Filters that are not
 * patterns (a plain `equals`, `in`) must NOT get it.
 *
 * TRAP: `equals` with `mode: "insensitive"` IS a pattern on PostgreSQL -
 * Prisma compiles it to `ILIKE $n` and passes the value unescaped, so
 * `a_b@x` matches `a.b@x` (review 2026-10-16, account deletion rewrote a
 * colleague's invitation that way). Prefer an exact match on the stored form
 * (e-mail addresses are stored lower-cased); if a case-insensitive `equals`
 * is really needed, pass the value through this function.
 */
export function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
