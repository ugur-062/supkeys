import type { PrismaService } from "../../../common/prisma/prisma.service";

/**
 * A REQUEST OR AN ORDER AS THE MODEL NAMES IT (live check 2026-10-10, NEW-PF-1).
 *
 * The system prompt tells the model to refer to records by their NUMBER
 * (`ROT-000123`), and users ask the same way ("ROT-000834 talebimin kategorisi
 * nedir?"). The tools took only the internal id, so the model passed the number,
 * the lookup found nothing and the user was told to "try again later".
 *
 * Every assistant tool that takes a request or order reference accepts both:
 * the internal id (what the list tools return) and the number. Parsing is in
 * one place; the number is normalised to the stored form (upper case, at least
 * six digits), so "rot-834" and "#ROT-000834" name the same request.
 *
 * ACCESS IS NOT DECIDED HERE. A number only resolves to an id; the caller then
 * reads through the same gate as for an id (`getOne`, or a query scoped to the
 * user's company). Another company's number therefore answers exactly like a
 * number that does not exist.
 */
const LISTING_NUMBER_RE = /^ROT[-\s]?(\d{1,12})$/;
const ORDER_NUMBER_RE = /^ROT[-\s]?ORD[-\s]?(\d{1,12})$/;

function storedNumber(ref: string, pattern: RegExp, prefix: string): string | null {
  const m = pattern.exec(ref.trim().replace(/^#\s*/, "").toUpperCase());
  return m ? `${prefix}${String(Number(m[1])).padStart(6, "0")}` : null;
}

/** `ROT-000834` when the reference is a request number, else null (an internal id). */
export function listingNumberOf(ref: string): string | null {
  return storedNumber(ref, LISTING_NUMBER_RE, "ROT-");
}

/** `ROT-ORD-000012` when the reference is an order number, else null (an internal id). */
export function orderNumberOf(ref: string): string | null {
  return storedNumber(ref, ORDER_NUMBER_RE, "ROT-ORD-");
}

/** Unique filter of a request reference - combine it with the caller's own scope (`companyId`...). */
export function listingRefWhere(ref: string): { id: string } | { number: string } {
  const number = listingNumberOf(ref);
  return number ? { number } : { id: ref.trim() };
}

/** Unique filter of an order reference - combine it with the caller's own scope. */
export function orderRefWhere(ref: string): { id: string } | { number: string } {
  const number = orderNumberOf(ref);
  return number ? { number } : { id: ref.trim() };
}

/**
 * Internal id of the request a reference names, for a read that goes through
 * `CompanyListingsService.getOne` afterwards (that call decides what the user
 * may see). An id passes through unread; a number nobody has is `null`.
 */
export async function listingIdOfRef(prisma: Pick<PrismaService, "listing">, ref: string): Promise<string | null> {
  const number = listingNumberOf(ref);
  if (!number) return ref.trim();
  const row = await prisma.listing.findUnique({ where: { number }, select: { id: true } });
  return row?.id ?? null;
}

/** Internal id of the order a reference names, for a read through `CompanyOrdersService.getOne`. */
export async function orderIdOfRef(prisma: Pick<PrismaService, "companyOrder">, ref: string): Promise<string | null> {
  const number = orderNumberOf(ref);
  if (!number) return ref.trim();
  const row = await prisma.companyOrder.findUnique({ where: { number }, select: { id: true } });
  return row?.id ?? null;
}
