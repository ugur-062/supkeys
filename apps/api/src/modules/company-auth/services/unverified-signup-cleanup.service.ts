import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@rothern/db";
import { maskEmail } from "../../../common/logging/mask-email";
import { PrismaBypassService } from "../../../common/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";

/**
 * UNVERIFIED SIGN-UPS EXPIRE (owner decision 2026-10-08).
 *
 * A sign-up whose e-mail is still unverified this many days after it was
 * created is deleted, so the address is free again. Until this rule an
 * unverified sign-up held its address for good: the real owner of the address
 * got 409 at sign-up and the address could not be invited to a team.
 */
export const UNVERIFIED_SIGNUP_TTL_DAYS = 7;
const TTL_MS = UNVERIFIED_SIGNUP_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * One nightly run removes at most this many sign-ups; the rest waits for the
 * next night (the first run after a deploy meets the whole backlog, and every
 * removal is one admin call to the auth provider). The lazy path is not
 * counted: it removes one account per request.
 */
export const UNVERIFIED_SIGNUP_MAX_REMOVALS_PER_RUN = 500;

/**
 * A verification code that is still valid postpones the removal ("verification
 * in progress"), but only for this long after the sign-up expired. Without the
 * bound, anyone could keep an address held for good by calling the public
 * "send again" endpoint a few times an hour (each call issues a fresh code).
 */
export const UNVERIFIED_SIGNUP_PENDING_GRACE_DAYS = 1;
const PENDING_GRACE_MS = UNVERIFIED_SIGNUP_PENDING_GRACE_DAYS * 24 * 60 * 60 * 1000;

/** Expired = `UNVERIFIED_SIGNUP_TTL_DAYS` full days have passed since the sign-up (inclusive). */
export function isUnverifiedSignupExpired(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= TTL_MS;
}

/**
 * THE SWITCH (review CLEAN-1). The removal hard-deletes the auth-provider
 * user and judges that on the rows of ITS OWN database. A database COPY that
 * shares the provider project with its source (a restored dump booted for a
 * drill, the local UI-test stack on a staging dump) would delete live sign-in
 * identities of the source, judged on stale data. So the job and the lazy
 * release run only where this says so, and the same variable stops them
 * without a deploy:
 *  - `UNVERIFIED_SIGNUP_PURGE_ENABLED` exactly "true" / "false" wins;
 *  - not set (or empty): ON only when `NODE_ENV` is "production" - the Render
 *    staging and production services need no extra setting - OFF everywhere
 *    else (local development, tests, scripts);
 *  - any other value: OFF (a typo must not fall through to "on").
 * A restored copy that is booted with `NODE_ENV=production` MUST set it to
 * "false" (`docs/backup-restore-drill.md`).
 */
export const UNVERIFIED_SIGNUP_PURGE_ENV = "UNVERIFIED_SIGNUP_PURGE_ENABLED";

export interface SignupPurgeSwitch {
  enabled: boolean;
  /** explicit: "true" / "false" was set; default: decided by NODE_ENV; invalid: unreadable value, off. */
  source: "explicit" | "default" | "invalid";
}

export function resolveSignupPurgeSwitch(
  raw: string | null | undefined,
  nodeEnv: string | null | undefined,
): SignupPurgeSwitch {
  const value = (raw ?? "").trim();
  if (value === "true") return { enabled: true, source: "explicit" };
  if (value === "false") return { enabled: false, source: "explicit" };
  if (value === "") return { enabled: nodeEnv === "production", source: "default" };
  return { enabled: false, source: "invalid" };
}

/** Audit action of one removal; label in admin `audit-actions.ts` and web `domain.auditAction`. */
export const UNVERIFIED_SIGNUP_EXPIRED_ACTION = "company.signup_expired";

/**
 * WHAT COUNTS AS A BUSINESS RECORD. Every relation of `Company` is in exactly
 * one of the three lists below (`unverified-signup-rule.spec` reads the
 * Prisma model and fails for a relation that is in none - a new child table
 * must be classified before it can be deleted by the cascade).
 *
 * BLOCKING: one row is enough and the company is NEVER touched. Everything
 * the company wrote itself, everything that carries content or a commitment
 * between two companies, and every admin record.
 */
export const SIGNUP_BLOCKING_RELATIONS = [
  "listings",
  "bidsPlaced",
  "connectionsInitiated",
  "referralInvitesSent",
  "ordersAsSeller",
  "ordersAsBuyer",
  "blocksMade",
  "blockedByOthers",
  "complaintsMade",
  "complaintsReceived",
  "listingTemplates",
  "supplierTemplates",
  "items",
  "threadsAsBuyer",
  "threadsAsSeller",
  "messagesSent",
  "questionTemplates",
  "approvalFlows",
  "approvalRequests",
  "userInvitations",
  "addresses",
  "bankAccounts",
  "membershipEvents",
  "adminNotes",
  "kycRevisions",
  "reviewsGiven",
  "reviewsReceived",
  "publicInquiries",
  "viewsMade",
] as const satisfies readonly (keyof Prisma.CompanyCountOutputType)[];

/** Same rule for the one-to-one relations (not part of `_count`). */
export const SIGNUP_BLOCKING_SINGLE_RELATIONS = ["timeSavingsConfig"] as const;

/**
 * DEPENDENT: rows that exist only because the placeholder exists as a
 * recipient, and that it could never act on (an unverified account cannot
 * sign in). They go with the company through the foreign-key cascade:
 *  - `users`: the sign-up account itself (exactly one, checked separately),
 *    with its e-mail codes, password links and notifications;
 *  - `connectionsReceived`, `listingInvitations`: what the referral token
 *    bound at sign-up. The token invitation itself goes back to PENDING and
 *    brings both back at the next sign-up with the link, so the cascade
 *    loses nothing. It stays that way because nobody can ADD a request
 *    invitation for the placeholder afterwards: every path that writes one
 *    for a buyer (automatic invitation of connections, manual invitation,
 *    AI member invitation) requires a company with a proven account
 *    (`common/company/proven-account.ts`). A request invitation is a
 *    counterparty record (it blocks an admin hard delete); a new path that
 *    writes one must keep that filter or this relation becomes blocking;
 *  - `affinity`, `viewsReceived`: derived / analytics rows.
 */
export const SIGNUP_DEPENDENT_RELATIONS = [
  "users",
  "connectionsReceived",
  "listingInvitations",
  "affinity",
  "viewsReceived",
] as const satisfies readonly (keyof Prisma.CompanyCountOutputType)[];

/** `CompanyUser` relations: all dependent (cascade), none is a business record. */
export const SIGNUP_USER_DEPENDENT_RELATIONS = [
  "passwordResetTokens",
  "emailVerificationCodes",
  "notifications",
] as const;

const BLOCKING_COUNTS = Object.fromEntries(
  SIGNUP_BLOCKING_RELATIONS.map((relation) => [relation, true]),
) as Record<(typeof SIGNUP_BLOCKING_RELATIONS)[number], true>;

/** Everything the decision needs, read under the row locks. */
const ACCOUNT_SELECT = {
  id: true,
  email: true,
  authId: true,
  createdAt: true,
  emailVerifiedAt: true,
  invitedById: true,
  invitedAt: true,
  lastLoginAt: true,
  isActive: true,
  deletedAt: true,
  // Codes that can still verify the address: the unused ones. Whether one of
  // them is still alive is the rule's business (it is given the clock).
  emailVerificationCodes: { where: { usedAt: null }, select: { expiresAt: true } },
  company: {
    select: {
      id: true,
      ownerUserId: true,
      onboardingCompletedAt: true,
      tier: true,
      membershipEndAt: true,
      companyVerificationStatus: true,
      isActive: true,
      isBlocked: true,
      timeSavingsConfig: { select: { id: true } },
      _count: { select: { users: true, ...BLOCKING_COUNTS } },
    },
  },
} satisfies Prisma.CompanyUserSelect;

export type SignupAccountSnapshot = Prisma.CompanyUserGetPayload<{ select: typeof ACCOUNT_SELECT }>;

/** Why an account is left alone. English codes: they go to the log only. */
export type SignupPurgeSkipReason =
  | "verified"
  | "not_expired"
  | "invited_member"
  | "account_used"
  | "not_owner"
  | "onboarding_completed"
  | "other_users"
  | "admin_state"
  | "business_records"
  /** Not for good: an unused code has not expired yet (at most the code lifetime). */
  | "verification_pending";

/**
 * THE RULE, in one place. Returns null only for the sign-up owner account of
 * an untouched placeholder company whose e-mail was never verified and whose
 * sign-up is `UNVERIFIED_SIGNUP_TTL_DAYS` old. Everything else is named and
 * never deleted:
 *  - a verified account;
 *  - a member added by an admin or through a team invitation (`invitedAt` /
 *    `invitedById` - their e-mail can be unverified too);
 *  - an account that is not the owner, or is not the company's only user
 *    (soft-deleted users count);
 *  - a company with completed onboarding, with an admin decision on it
 *    (paid tier, membership date, verification status, blocked, deactivated;
 *    a deactivated or removed user) or with any business record;
 *  - LAST, and only for a while: an account with an unused verification code
 *    that has not expired - a verification is in progress in human time (the
 *    user asked for a code a minute ago, or just corrected the address). It
 *    is left until the code has expired (15 minutes), so a correct code never
 *    meets a deleted account. Named after the permanent reasons, so the log
 *    of a protected account says why it is protected.
 */
export function signupPurgeSkipReason(
  account: SignupAccountSnapshot,
  now: Date,
): SignupPurgeSkipReason | null {
  const company = account.company;
  if (account.emailVerifiedAt) return "verified";
  if (!isUnverifiedSignupExpired(account.createdAt, now)) return "not_expired";
  if (account.invitedById || account.invitedAt) return "invited_member";
  if (account.lastLoginAt) return "account_used";
  if (company.ownerUserId !== account.id) return "not_owner";
  if (company.onboardingCompletedAt) return "onboarding_completed";
  if (company._count.users !== 1) return "other_users";
  if (
    !account.isActive ||
    account.deletedAt ||
    !company.isActive ||
    company.isBlocked ||
    company.tier !== "STANDART" ||
    company.membershipEndAt ||
    company.companyVerificationStatus !== "UNVERIFIED"
  ) {
    return "admin_state";
  }
  if (
    company.timeSavingsConfig ||
    SIGNUP_BLOCKING_RELATIONS.some((relation) => company._count[relation] > 0)
  ) {
    return "business_records";
  }
  // Same boundary as `verifyEmail`, which refuses a code only when
  // `expiresAt < now`: at its expiry instant the code still verifies.
  // The protection ends `UNVERIFIED_SIGNUP_PENDING_GRACE_DAYS` after the expiry:
  // fresh codes cannot hold the address indefinitely.
  const withinGrace = now.getTime() - account.createdAt.getTime() < TTL_MS + PENDING_GRACE_MS;
  if (
    withinGrace &&
    account.emailVerificationCodes.some((code) => code.expiresAt.getTime() >= now.getTime())
  ) {
    return "verification_pending";
  }
  return null;
}

/** Which path asked for the removal (audit `source`). */
export type SignupPurgeTrigger = "cron" | "signup" | "team_invite";

export type SignupPurgeOutcome =
  | { status: "deleted"; userId: string; companyId: string; restoredInvites: number }
  | { status: "skipped"; reason: SignupPurgeSkipReason }
  /** Nothing left to delete: a parallel run removed the account first. */
  | { status: "gone" }
  /** Its rows are locked by another transaction right now (verification, e-mail change, another run). */
  | { status: "busy" }
  /** The switch is off (`UNVERIFIED_SIGNUP_PURGE_ENABLED`): nothing was read, nothing changed. */
  | { status: "disabled" };

export interface SignupPurgeRunResult {
  scanned: number;
  deleted: number;
  skipped: number;
  busy: number;
  failed: number;
  /** The run stopped at the per-run cap with candidates left; they wait for the next run. */
  capped: boolean;
}

const emptyRunResult = (): SignupPurgeRunResult => ({
  scanned: 0,
  deleted: 0,
  skipped: 0,
  busy: 0,
  failed: 0,
  capped: false,
});

/**
 * How long one removal waits for a row lock before it gives the account up
 * as "busy". Longer than a normal removal takes (so a parallel run of the
 * same account waits the first one out), far below the transaction timeout.
 */
const LOCK_WAIT_MS = 5_000;
/**
 * One removal holds its transaction across the provider calls: the delete
 * and, when that fails on our side, one look-up (`deleteUserStrict`), 10 s
 * client timeout each, after up to two lock waits. The commit must still be
 * possible after the slowest of these, or a delete the provider did carry out
 * would be rolled back here.
 */
const TX_TIMEOUT_MS = 45_000;
const TX_MAX_WAIT_MS = 5_000;
const PAGE_SIZE = 100;
/** A dead provider must not be asked once per account: the run stops and reports. */
const MAX_CONSECUTIVE_FAILURES = 3;

/** Postgres `lock_not_available` (NOWAIT refused, or `lock_timeout` ran out). */
function isLockNotAvailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const meta = (err as { meta?: { code?: unknown } }).meta;
  return meta?.code === "55P03" || err.message.includes("55P03");
}

/**
 * Removes expired unverified sign-ups. TWO PATHS, ONE FUNCTION
 * (`removeIfExpired`):
 *  1. the nightly job (`UnverifiedSignupScheduler` -> `purgeExpired`);
 *  2. lazily, when a new sign-up or a team invitation arrives for an address
 *     that such a sign-up still holds (`releaseAddress`), so the address does
 *     not stay taken until the next night.
 *
 * ORDER, and why a provider failure cannot leave half an account:
 *  one database transaction per account -
 *    lock the company row and its user rows, re-read, apply the rule;
 *    put the invitation the referral token bound back to PENDING;
 *    delete the company (the cascade takes the account and what hangs on it);
 *    LAST, still inside the transaction: delete the auth-provider user;
 *    commit.
 *  - The provider refuses, or is unreachable and still has the user -> the
 *    transaction rolls back, the account is exactly as before and the next
 *    run tries again.
 *  - The provider deleted the user but our call failed (client time-out after
 *    the server acted, connection dropped) -> `deleteUserStrict` asks the
 *    provider once whether the user still exists and resolves when it does
 *    not, so the row is deleted with it. Rolling back here would keep a row
 *    whose auth id is dead: a resend + verify (neither needs the password)
 *    would turn it into a verified account that can never sign in.
 *  - The provider deleted the user and the COMMIT failed (process stopped,
 *    database lost in that instant) -> the row survives with a dead auth id;
 *    it is still an expired unverified sign-up, so the next run reaches the
 *    provider call again, gets "user not found" and commits. This window
 *    stays (it needs a failure between a clean provider answer and the
 *    commit). The opposite order (database first) would lose the auth id with
 *    the row: a provider failure would leave an auth user nobody can find,
 *    and the address would stay taken at the provider for good.
 *
 * A VERIFICATION IN PROGRESS is seen by the rule, not by the locks: an unused
 * code that has not expired keeps the account ("verification_pending") until
 * the code lifetime has passed, whichever path asks. The lazy caller answers
 * 409 meanwhile. Anyone who can request a code for the address (the public
 * "send again") postpones the removal by one code lifetime that way - the
 * same as a fresh sign-up postpones it by seven days.
 *
 * LOCKS. Company row, then its user rows: FOR UPDATE, waiting up to
 * `LOCK_WAIT_MS` - a parallel run of the same account waits and then finds
 * nothing ("gone"); verification, onboarding and admin writes either finish
 * first (the re-read sees them and the account is skipped) or wait for the
 * removal and then match no row; a new code cannot be inserted while the
 * user row is locked, so the codes read below are final. The account's
 * e-mail codes and password links: FOR UPDATE NOWAIT - `verifyEmail` takes
 * its code row BEFORE the user row, so waiting for it here would be a
 * deadlock and Postgres could pick the verification as the victim; refusing
 * instead leaves the account for the next run ("busy"). These locks only
 * cover the milliseconds in which another transaction holds the rows.
 */
@Injectable()
export class UnverifiedSignupCleanupService implements OnModuleInit {
  private readonly logger = new Logger(UnverifiedSignupCleanupService.name);
  /** Read once: the process environment does not change while the API runs. */
  private readonly purgeSwitch: SignupPurgeSwitch;
  private readonly nodeEnv: string | undefined;

  constructor(
    // No tenant context here (cron, and sign-up before any session): bypass client.
    private readonly bypass: PrismaBypassService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.nodeEnv = config.get<string>("NODE_ENV");
    this.purgeSwitch = resolveSignupPurgeSwitch(
      config.get<string>(UNVERIFIED_SIGNUP_PURGE_ENV),
      this.nodeEnv,
    );
  }

  /**
   * Is the removal on in this process (`resolveSignupPurgeSwitch`)? Off: the
   * nightly run does nothing, the lazy path releases nothing (its callers
   * answer 409 as before the feature) and `removeIfExpired` touches no row.
   */
  get enabled(): boolean {
    return this.purgeSwitch.enabled;
  }

  /** The state of the switch, once at start-up. */
  onModuleInit(): void {
    const env = `NODE_ENV=${this.nodeEnv ?? "(unset)"}`;
    if (this.purgeSwitch.source === "invalid") {
      this.logger.warn(
        `Unverified sign-up purge is OFF: ${UNVERIFIED_SIGNUP_PURGE_ENV} has a value that is neither "true" nor "false" (${env}).`,
      );
      return;
    }
    const why =
      this.purgeSwitch.source === "explicit"
        ? `${UNVERIFIED_SIGNUP_PURGE_ENV}=${this.purgeSwitch.enabled}`
        : `${UNVERIFIED_SIGNUP_PURGE_ENV} not set, ${env}; on by default only when NODE_ENV is "production"`;
    if (this.purgeSwitch.enabled) {
      this.logger.log(`Unverified sign-up purge is ON (${why}).`);
    } else if (this.nodeEnv === "production") {
      // Right for a restored copy, wrong for the real service: make it visible.
      this.logger.warn(`Unverified sign-up purge is OFF in a production-mode process (${why}).`);
    } else {
      this.logger.log(`Unverified sign-up purge is OFF (${why}).`);
    }
  }

  /**
   * Nightly sweep. Throws when at least one account could not be removed, so
   * the cron registry and the alarm show it; the accounts that could be
   * removed in the same run stay removed. Removes at most `maxRemovals`
   * accounts (`UNVERIFIED_SIGNUP_MAX_REMOVALS_PER_RUN`); the rest waits for
   * the next run. Does nothing when the switch is off.
   */
  async purgeExpired(
    now: Date = new Date(),
    options: { maxRemovals?: number } = {},
  ): Promise<SignupPurgeRunResult> {
    const result = emptyRunResult();
    if (!this.enabled) return result;
    const maxRemovals = options.maxRemovals ?? UNVERIFIED_SIGNUP_MAX_REMOVALS_PER_RUN;
    const cutoff = new Date(now.getTime() - TTL_MS);
    let consecutiveFailures = 0;
    let afterId: string | undefined;

    scan: for (;;) {
      // Cheap, unlocked pre-filter; the rule itself is applied under the locks.
      // Keyset paging by id: accounts that are skipped for good (business
      // records) must not keep the ones behind them out of reach.
      const page = await this.bypass.companyUser.findMany({
        where: {
          ...(afterId ? { id: { gt: afterId } } : {}),
          emailVerifiedAt: null,
          createdAt: { lte: cutoff },
          invitedById: null,
          invitedAt: null,
          company: { onboardingCompletedAt: null },
        },
        select: { id: true },
        orderBy: { id: "asc" },
        take: PAGE_SIZE,
      });
      for (const { id } of page) {
        // Checked before the next candidate, so a run that removed exactly
        // the cap and has nothing left does not report a cap.
        if (result.deleted >= maxRemovals) {
          result.capped = true;
          break scan;
        }
        result.scanned += 1;
        try {
          const outcome = await this.removeIfExpired(id, "cron", now);
          consecutiveFailures = 0;
          if (outcome.status === "deleted") result.deleted += 1;
          else if (outcome.status === "busy") result.busy += 1;
          else if (outcome.status === "skipped") result.skipped += 1;
        } catch (err) {
          result.failed += 1;
          consecutiveFailures += 1;
          this.logger.error(
            `Unverified sign-up could not be removed (user=${id}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break scan;
        }
      }
      if (page.length < PAGE_SIZE) break;
      afterId = page[page.length - 1]!.id;
    }

    if (result.scanned > 0) {
      this.logger.log(
        `Unverified sign-up sweep: scanned=${result.scanned} deleted=${result.deleted} skipped=${result.skipped} busy=${result.busy} failed=${result.failed}`,
      );
    }
    if (result.capped) {
      this.logger.warn(
        `Unverified sign-up sweep stopped at the cap of ${maxRemovals} removals per run; the remaining expired sign-ups wait for the next run`,
      );
    }
    if (result.failed > 0) {
      throw new Error(
        `unverified sign-up sweep: ${result.failed} account(s) could not be removed (deleted=${result.deleted}, scanned=${result.scanned})`,
      );
    }
    return result;
  }

  /**
   * Lazy path: is `email` held by an EXPIRED unverified sign-up, and is it
   * free now? True = such a sign-up was removed (by this call, or by a
   * parallel run it waited for) and the caller goes on as if the address had
   * never been taken. False = nothing was removed - the switch is off, the
   * address is not held, is held by an account the rule protects (for a
   * verification in progress: until its code has expired), or the removal
   * failed; the caller answers exactly as before (409). Never throws.
   */
  async releaseAddress(
    emailRaw: string,
    trigger: Exclude<SignupPurgeTrigger, "cron">,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (!this.enabled) return false;
    const email = emailRaw.toLowerCase().trim();
    try {
      const holder = await this.bypass.companyUser.findUnique({
        where: { email },
        select: { id: true, emailVerifiedAt: true, createdAt: true },
      });
      // The two cheapest "no" answers need no transaction.
      if (!holder || holder.emailVerifiedAt) return false;
      if (!isUnverifiedSignupExpired(holder.createdAt, now)) return false;
      const outcome = await this.removeIfExpired(holder.id, trigger, now);
      return outcome.status === "deleted" || outcome.status === "gone";
    } catch (err) {
      this.logger.error(
        `Expired sign-up holding ${maskEmail(email)} could not be removed (${trigger}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  /**
   * THE one removal. Deletes the account `userId` if - and only if - the rule
   * (`signupPurgeSkipReason`) allows it at the moment its rows are locked.
   * Throws when the removal was due but could not be completed (provider or
   * database failure): nothing has changed then. The switch is checked here
   * too, so no caller - present or future - deletes where the removal is off.
   */
  async removeIfExpired(
    userId: string,
    trigger: SignupPurgeTrigger,
    now: Date = new Date(),
  ): Promise<SignupPurgeOutcome> {
    if (!this.enabled) return { status: "disabled" };
    type TxResult =
      | { outcome: Exclude<SignupPurgeOutcome, { status: "deleted" }> }
      | {
          outcome: Extract<SignupPurgeOutcome, { status: "deleted" }>;
          email: string;
        };
    const keep = (outcome: Exclude<SignupPurgeOutcome, { status: "deleted" }>): TxResult => ({ outcome });
    let result: TxResult;
    try {
      result = await this.bypass.$transaction(
        async (tx): Promise<TxResult> => {
          await tx.$executeRaw`SELECT set_config('lock_timeout', ${`${LOCK_WAIT_MS}ms`}, true)`;
          const ref = await tx.companyUser.findUnique({
            where: { id: userId },
            select: { companyId: true },
          });
          if (!ref) return keep({ status: "gone" });
          // Company first, then its users: the order onboarding and the seat
          // gates use. A child row of the company cannot be inserted while
          // the company row is locked, so the counts read below are final.
          const companies = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM companies WHERE id = ${ref.companyId} FOR UPDATE`;
          if (companies.length === 0) return keep({ status: "gone" });
          const users = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM company_users WHERE "companyId" = ${ref.companyId} FOR UPDATE`;
          if (!users.some((u) => u.id === userId)) return keep({ status: "gone" });
          await tx.$queryRaw`
            SELECT id FROM email_verification_codes WHERE "companyUserId" = ${userId} FOR UPDATE NOWAIT`;
          await tx.$queryRaw`
            SELECT id FROM password_reset_tokens WHERE "companyUserId" = ${userId} FOR UPDATE NOWAIT`;

          const account = await tx.companyUser.findUnique({
            where: { id: userId },
            select: ACCOUNT_SELECT,
          });
          if (!account) return keep({ status: "gone" });
          const reason = signupPurgeSkipReason(account, now);
          if (reason) return keep({ status: "skipped", reason });

          // The invitation the referral token bound at sign-up goes back to
          // PENDING: the address can be invited again and the same link works
          // at the next sign-up. Only this company's ACCEPTED rows - nothing
          // is matched by e-mail. `updatedAt` is the invitation's "last sent"
          // clock (30-day link lifetime, daily cap) and is kept: a removal is
          // not a send.
          const bound = await tx.companyReferralInvite.findMany({
            where: { acceptedCompanyId: account.company.id, status: "ACCEPTED" },
            select: { id: true, updatedAt: true },
          });
          for (const invite of bound) {
            await tx.companyReferralInvite.update({
              where: { id: invite.id },
              data: {
                status: "PENDING",
                acceptedCompanyId: null,
                acceptedAt: null,
                updatedAt: invite.updatedAt,
              },
            });
          }
          // Cascade: the account, its codes / password links / notifications,
          // the connection and the request invitation of the placeholder -
          // i.e. what the token bound (it comes back with the PENDING
          // invitation above). Nothing a buyer added afterwards is in there:
          // request invitations are only written for a company with a proven
          // account (`HAS_PROVEN_ACCOUNT_WHERE`), and such a company is never
          // removed here.
          await tx.company.delete({ where: { id: account.company.id } });
          // LAST (see the class comment): a failure here rolls everything back.
          if (account.authId) await this.supabaseAuth.deleteUserStrict(account.authId);

          return {
            outcome: {
              status: "deleted",
              userId,
              companyId: account.company.id,
              restoredInvites: bound.length,
            },
            email: account.email,
          };
        },
        { maxWait: TX_MAX_WAIT_MS, timeout: TX_TIMEOUT_MS },
      );
    } catch (err) {
      if (isLockNotAvailable(err)) return { status: "busy" };
      throw err;
    }

    if (!("email" in result)) {
      if (result.outcome.status === "skipped") {
        this.logger.debug(`Unverified sign-up kept (user=${userId}): ${result.outcome.reason}`);
      }
      return result.outcome;
    }
    const { outcome } = result;
    const email = maskEmail(result.email);

    // One audit entry per removal, written by the run that committed it. The
    // address is masked: the entry outlives the account it was deleted with.
    // `userId` ties it to the account's own `company.signup` entry (sign-up
    // time, full trail). Keys are the ones the admin detail already labels.
    await this.audit.log({
      action: UNVERIFIED_SIGNUP_EXPIRED_ACTION,
      actorType: "system",
      entityType: "company",
      entityId: outcome.companyId,
      // Irreversible.
      critical: true,
      metadata: {
        email,
        source: trigger,
        userId,
        restored: outcome.restoredInvites,
        limit: UNVERIFIED_SIGNUP_TTL_DAYS,
      },
    });
    this.logger.log(
      `Unverified sign-up removed (user=${userId} company=${outcome.companyId} email=${email} source=${trigger} restoredInvites=${outcome.restoredInvites})`,
    );
    return outcome;
  }
}
