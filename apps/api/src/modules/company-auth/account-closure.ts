/**
 * Facts of account deletion that other modules read: the admin company list
 * filter, the reminder job for closed companies, the admin suspension paths
 * and the company activity log. The privacy texts (web Gizlilik m.6, KVKK
 * m.7/m.9, `/hesap-silme`, Kullanıcı Sözleşmesi m.8 and the Saklama ve İmha
 * Politikası table, rows 1-2) describe these values; a change here changes
 * those texts too.
 */

/**
 * Internal note on a company whose last user deleted their account (admin
 * panel only, Turkish on purpose like every `blockedReason`). The company-level
 * KVKK erasure (`AdminCompaniesService.deleteOrAnonymize`) is still started by
 * an administrator; the note is how the admin list and the reminder job find
 * the company.
 *
 * The note is the ONLY marker of a closed company (no dedicated column yet), so
 * every path that writes `blockedReason` respects it: the admin suspension and
 * the complaint suspension refuse a closed company and refuse this text as a
 * reason (`isReservedBlockedReason`), the admin "unsuspend" refuses a closed
 * company, and the erasure queue also requires that no live user is left
 * (`CLOSED_COMPANY_WHERE`).
 */
export const CLOSED_BY_OWNER_NOTE = "Hesap sahibi sildi - KVKK silme bekliyor";

/**
 * The privacy texts promise the company-level erasure within this many days of
 * the closure (Gizlilik m.6, KVKK m.7, `/hesap-silme`, Kullanıcı Sözleşmesi m.8,
 * Saklama ve İmha Politikası row 2).
 */
export const CLOSED_COMPANY_ERASURE_DEADLINE_DAYS = 30;

/**
 * The reminder job reports a closed company this many days after the closure,
 * and again every day until it is erased: enough time left before the
 * deadline above.
 */
export const CLOSED_COMPANY_ERASURE_ALERT_DAYS = 7;

/**
 * A company waiting for the company-level KVKK erasure: closed by its last
 * user (note above), not anonymised yet (`isActive` turns false only there; a
 * hard delete removes the row) and with no live user left. The last condition
 * keeps a company out of the queue if a live account ever appears in it (the
 * operator routine would otherwise erase that account with the company).
 * Admin list filter `blocked=kvkk` and `ClosedCompanyErasureScheduler` read it.
 */
export const CLOSED_COMPANY_WHERE = {
  isBlocked: true,
  isActive: true,
  blockedReason: CLOSED_BY_OWNER_NOTE,
  users: { none: { deletedAt: null } },
} as const;

/** True for a company row that carries the closure note (blocked, not anonymised). */
export function isClosedByOwner(company: {
  isBlocked: boolean;
  isActive?: boolean | null;
  blockedReason: string | null;
}): boolean {
  return company.isBlocked && company.isActive !== false && company.blockedReason === CLOSED_BY_OWNER_NOTE;
}

/**
 * A suspension reason an administrator typed that reads as the closure note
 * (spacing and case ignored). Such a reason would put a live company into the
 * erasure queue, so it is refused.
 */
export function isReservedBlockedReason(reason: string | null | undefined): boolean {
  if (typeof reason !== "string") return false;
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(reason) === norm(CLOSED_BY_OWNER_NOTE);
}

/**
 * Stored e-mail of a deleted or removed account. Frees the real address (the
 * column is unique) and can never receive mail.
 */
export function deletedAccountEmail(userId: string): string {
  return `deleted-${userId}@deleted.rothern`;
}

const DELETED_EMAIL = /^deleted-([^@]+)@deleted\.rothern$/;

/** True for an address written by `deletedAccountEmail`. */
export function isDeletedAccountEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && DELETED_EMAIL.test(email);
}

/** The account id inside an address written by `deletedAccountEmail` (null for any other address). */
export function deletedAccountIdOf(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  return DELETED_EMAIL.exec(email)?.[1] ?? null;
}

/**
 * Short code that tells deleted accounts apart in the company's activity log
 * (all of them carry the same placeholder name). Taken from the internal id:
 * no personal data, and the same code for the same account on every row.
 */
export function deletedAccountTag(userId: string): string {
  return userId.slice(-4).toUpperCase();
}
