import type { Prisma } from "@rothern/db";

/**
 * A COMPANY WITH A PROVEN ACCOUNT: at least one of its users has verified the
 * e-mail address (`emailVerifiedAt`). Single source for "may this company be
 * given a request invitation row?" (review CLEAN-4, 2026-10-08).
 *
 * Why. A self sign-up is a placeholder company until its address is proven,
 * and an unverified sign-up is deleted after `UNVERIFIED_SIGNUP_TTL_DAYS`
 * (`UnverifiedSignupCleanupService`) with everything that hangs on it through
 * the foreign-key cascade. A request invitation is a counterparty record (it
 * blocks an admin hard delete of the invited company), so the cascade must
 * never take one a buyer created. The only invitation a placeholder may hold
 * is the one its referral token bound at sign-up - that one comes back when
 * the address signs up again with the link. Every other path that writes a
 * request invitation on behalf of a buyer applies this filter:
 *  - automatic invitation of the buyer's connections to a public request;
 *  - manual invitation (create / edit / "add invitations");
 *  - invitation of members the AI discovery suggested.
 * The stamp is permanent (no code path sets it back to null) and the removal
 * never touches a company that has a verified user, so a company that passes
 * this filter can never be removed by the expiry rule.
 *
 * Soft-deleted users count on purpose: the expiry rule counts them too
 * (`other_users`), and the point here is "can this company ever be removed".
 *
 * `company_users` is under row-level security: use this with the BYPASS
 * client when the companies are not the caller's own, or the sub-query sees
 * no user and every company fails the filter.
 */
export const HAS_PROVEN_ACCOUNT_WHERE = {
  users: { some: { emailVerifiedAt: { not: null } } },
} as const satisfies Prisma.CompanyWhereInput;
