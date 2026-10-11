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
 * patterns (`equals`, `in`) must NOT get it.
 */
export function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
