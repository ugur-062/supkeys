/**
 * EXPIRED UNVERIFIED SIGN-UPS (owner decision 2026-10-08).
 *
 * A sign-up whose e-mail is still unverified `UNVERIFIED_SIGNUP_TTL_DAYS` days
 * after it was created is deleted, so the address is free again. Two paths,
 * one function: the nightly sweep and the lazy release when a new sign-up or
 * a team invitation arrives for the held address.
 *
 * Real services on the test database; only the auth provider and the mail
 * sender are fakes. The provider fake has state (an address can be registered
 * once), so "the address is free again" is checked where it matters.
 *
 * The removal runs only where it is switched on
 * (`UNVERIFIED_SIGNUP_PURGE_ENABLED`; not set = on only with
 * NODE_ENV=production). `makeStack` switches it on like the deployed
 * services; the "switched off" block builds the stack without it.
 */
import { randomUUID } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaClient } from "@rothern/db";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyAuthService } from "../../src/modules/company-auth/services/company-auth.service";
import {
  UNVERIFIED_SIGNUP_EXPIRED_ACTION,
  UNVERIFIED_SIGNUP_PURGE_ENV,
  UNVERIFIED_SIGNUP_TTL_DAYS,
  UnverifiedSignupCleanupService,
  type SignupPurgeSkipReason,
} from "../../src/modules/company-auth/services/unverified-signup-cleanup.service";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import { SupabaseAuthService } from "../../src/modules/supabase-auth/supabase-auth.service";
import { TEST_DB_URL } from "./env";
import { connect, makeCompanyWithUser, makeListing, makeUser } from "./factories";
import { extractCode } from "./make-auth-service";
import { makeService as makeListingsRig } from "./make-service";
import { prisma, truncateAll } from "./test-db";

const DAY_MS = 86_400_000;
const TTL_MS = UNVERIFIED_SIGNUP_TTL_DAYS * DAY_MS;
/** Lifetime of a verification code (`EMAIL_CODE_TTL_MIN` in the sign-up service). */
const CODE_TTL_MS = 15 * 60_000;
const PASSWORD = "Guclu!Parola9";

/** Races need real concurrency: `test-db` runs every transaction on one connection. */
let multi: PrismaClient;

beforeAll(() => {
  const base = TEST_DB_URL.replace(/[?&]connection_limit=\d+/, "");
  multi = new PrismaClient({
    datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}connection_limit=6` } },
  });
});
afterAll(async () => {
  await multi.$disconnect();
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

const signupDto = (email: string, over: Record<string, unknown> = {}) =>
  ({
    firstName: "Ada",
    lastName: "Yilmaz",
    email,
    phone: "+90 555 111 22 33",
    password: PASSWORD,
    termsAccepted: true,
    mediationAccepted: true,
    kvkkAccepted: true,
    ...over,
  }) as never;

/** Auth provider with state: one user per address; a deleted user frees the address. */
function makeProvider() {
  const users = new Map<string, string>(); // authId -> address
  const remove = async (authId: string) => {
    users.delete(authId);
  };
  return {
    users,
    createUser: jest.fn(async (email: string) => {
      const address = email.toLowerCase().trim();
      if ([...users.values()].includes(address)) {
        throw new ConflictException("the address is registered at the provider");
      }
      // A plain UUID, like the provider's: the real client refuses anything else.
      const authId = randomUUID();
      users.set(authId, address);
      return { authId };
    }),
    deleteUser: jest.fn(remove),
    deleteUserStrict: jest.fn(remove),
    verifyPassword: jest.fn(async (email: string) => {
      const hit = [...users].find(([, address]) => address === email.toLowerCase().trim());
      if (!hit) throw new Error("bad credentials");
      return { authId: hit[0] };
    }),
    updateEmail: jest.fn(async (authId: string, next: string) => {
      users.set(authId, next.toLowerCase().trim());
    }),
    updatePassword: jest.fn(async () => undefined),
  };
}

const config = {
  get: jest.fn((key: string) => (key === "JWT_SECRET" ? "test-secret" : undefined)),
  getOrThrow: jest.fn((key: string) => {
    if (key !== "JWT_SECRET") throw new Error(`config missing: ${key}`);
    return "test-secret";
  }),
};

/** Environment of a deployed service: the removal is on. */
const PURGE_ON = { [UNVERIFIED_SIGNUP_PURGE_ENV]: "true" };
const envConfig = (env: Record<string, string | undefined>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

/**
 * Sign-up service + the clean-up it calls, wired like the module. The
 * clean-up writes its audit entry with the real audit service; the sign-up
 * service's own fire-and-forget audit calls go to a fake (they would outlive
 * the test). `env` is what the clean-up reads its switch from.
 */
function makeStack(db: PrismaClient = prisma, env: Record<string, string | undefined> = PURGE_ON) {
  const provider = makeProvider();
  const audit = new AuditService(db as never);
  const mail = { send: jest.fn(async () => ({ emailLogId: "t", sent: true })) };
  const cleanup = new UnverifiedSignupCleanupService(db as never, provider as never, audit, envConfig(env));
  const auth = new CompanyAuthService(
    db as never,
    new JwtService({ secret: "test-secret", signOptions: { expiresIn: "1h" } }),
    provider as never,
    { log: jest.fn(async () => undefined) } as never,
    mail as never,
    config as never,
    db as never,
    cleanup,
  );
  return { provider, audit, mail, cleanup, auth };
}
type Stack = ReturnType<typeof makeStack>;

/** Team service with the same clean-up and provider as the sign-up service. */
function makeTeam(stack: Stack) {
  const mail = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const service = new CompanyUsersService(
    prisma as never,
    stack.provider as never,
    stack.auth,
    mail as never,
    { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
    stack.audit,
    undefined,
    stack.cleanup,
  );
  return { service, mail };
}

/**
 * A real sign-up, moved `ageMs` into the past (default: one day past the
 * limit) - the account AND the code that was mailed at sign-up, which
 * therefore expired `ageMs` minus its lifetime ago. (A code that is still
 * alive is a verification in progress and keeps the account; those cases
 * issue a fresh one with "send again".)
 */
async function signUpAged(
  stack: Stack,
  email: string,
  ageMs: number = TTL_MS + DAY_MS,
  over: Record<string, unknown> = {},
) {
  await stack.auth.signup(signupDto(email, over));
  const created = await prisma.companyUser.findUniqueOrThrow({ where: { email } });
  const signedUpAt = new Date(Date.now() - ageMs);
  await prisma.emailVerificationCode.updateMany({
    where: { companyUserId: created.id },
    data: { createdAt: signedUpAt, expiresAt: new Date(signedUpAt.getTime() + CODE_TTL_MS) },
  });
  return prisma.companyUser.update({
    where: { id: created.id },
    data: { createdAt: signedUpAt },
  });
}

const removalAudits = () =>
  prisma.auditLog.findMany({
    where: { action: UNVERIFIED_SIGNUP_EXPIRED_ACTION },
    orderBy: { createdAt: "asc" },
  });

async function expectAccountIntact(user: { id: string; companyId: string }) {
  expect(await prisma.companyUser.findUnique({ where: { id: user.id } })).not.toBeNull();
  expect(await prisma.company.findUnique({ where: { id: user.companyId } })).not.toBeNull();
}

async function expectAccountGone(user: { id: string; companyId: string }) {
  expect(await prisma.companyUser.findUnique({ where: { id: user.id } })).toBeNull();
  expect(await prisma.company.findUnique({ where: { id: user.companyId } })).toBeNull();
}

/**
 * A buyer who invited an address to a request by e-mail: the referral
 * invitation (the link token) plus the queued request invitation.
 */
async function inviteToRequest(invitedEmail: string) {
  const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
  const listing = await makeListing(prisma, {
    companyId: buyer.company.id,
    createdById: buyer.user.id,
    status: "OPEN",
  });
  const token = `ref-${randomUUID()}`;
  const referral = await prisma.companyReferralInvite.create({
    data: {
      inviterCompanyId: buyer.company.id,
      invitedById: buyer.user.id,
      email: invitedEmail,
      token,
      status: "PENDING",
      listingId: listing.id,
    },
  });
  const queued = await prisma.externalListingInvite.create({
    data: {
      listingId: listing.id,
      inviterCompanyId: buyer.company.id,
      referralInviteId: referral.id,
      email: invitedEmail,
      locale: "tr",
      state: "SENT",
      sentAt: new Date(),
    },
  });
  return { buyer, listing, token, referral, queued };
}

describe("nightly sweep", () => {
  it("removes the account, its placeholder company, the provider user and what hangs on them; one audit entry with the address masked", async () => {
    const stack = makeStack();
    const user = await signUpAged(stack, "sahipsiz@test.local");
    // What hangs on an unverified sign-up: its code (issued at sign-up), a
    // password link ("forgot password" mails one) and a notification.
    await prisma.passwordResetToken.create({
      data: { companyUserId: user.id, tokenHash: `h-${randomUUID()}`, expiresAt: new Date(Date.now() + DAY_MS) },
    });
    await prisma.notification.create({
      data: { companyUserId: user.id, companyId: user.companyId, type: "listing_invitation", title: "t", body: "b" },
    });
    expect(await prisma.emailVerificationCode.count({ where: { companyUserId: user.id } })).toBe(1);
    const bystander = await makeCompanyWithUser(prisma);

    const result = await stack.cleanup.purgeExpired();

    expect(result).toEqual({ scanned: 1, deleted: 1, skipped: 0, busy: 0, failed: 0, capped: false });
    await expectAccountGone(user);
    expect(await prisma.emailVerificationCode.count()).toBe(0);
    expect(await prisma.passwordResetToken.count()).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
    expect(stack.provider.deleteUserStrict).toHaveBeenCalledTimes(1);
    expect(stack.provider.deleteUserStrict).toHaveBeenCalledWith(user.authId);
    expect(stack.provider.users.size).toBe(0);
    await expectAccountIntact(bystander.user);

    const audits = await removalAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorType: "system",
      actorId: null,
      actorEmail: null,
      tenantId: null,
      entityType: "company",
      entityId: user.companyId,
    });
    expect(audits[0]!.metadata).toMatchObject({
      email: "s***@test.local",
      source: "cron",
      userId: user.id,
      restored: 0,
      limit: UNVERIFIED_SIGNUP_TTL_DAYS,
    });
    expect(JSON.stringify(audits[0])).not.toContain("sahipsiz@test.local");

    // A second night finds nothing and writes nothing.
    expect(await stack.cleanup.purgeExpired()).toMatchObject({ scanned: 0, deleted: 0 });
    expect(await removalAudits()).toHaveLength(1);
  });

  it("the limit is seven full days from the sign-up: one millisecond earlier the account stays", async () => {
    const stack = makeStack();
    const user = await signUpAged(stack, "sinir@test.local", 0);
    const signedUpAt = user.createdAt.getTime();

    const before = new Date(signedUpAt + TTL_MS - 1);
    expect(await stack.cleanup.purgeExpired(before)).toMatchObject({ scanned: 0, deleted: 0 });
    await expect(stack.cleanup.removeIfExpired(user.id, "cron", before)).resolves.toEqual({
      status: "skipped",
      reason: "not_expired",
    });
    await expect(stack.cleanup.releaseAddress("sinir@test.local", "signup", before)).resolves.toBe(false);
    await expectAccountIntact(user);
    expect(stack.provider.deleteUserStrict).not.toHaveBeenCalled();

    const atLimit = new Date(signedUpAt + TTL_MS);
    expect(await stack.cleanup.purgeExpired(atLimit)).toMatchObject({ scanned: 1, deleted: 1 });
    await expectAccountGone(user);
  });

  it("goes through every expired sign-up, also past the ones it must keep", async () => {
    const stack = makeStack();
    const kept = await signUpAged(stack, "kalan@test.local");
    await prisma.companyAdminNote.create({
      data: { companyId: kept.companyId, adminId: "admin-1", body: "called, will verify" },
    });
    const removed = [
      await signUpAged(stack, "giden-1@test.local"),
      await signUpAged(stack, "giden-2@test.local"),
    ];

    const result = await stack.cleanup.purgeExpired();

    expect(result).toEqual({ scanned: 3, deleted: 2, skipped: 1, busy: 0, failed: 0, capped: false });
    await expectAccountIntact(kept);
    for (const user of removed) await expectAccountGone(user);
    expect(await removalAudits()).toHaveLength(2);
  });

  it("stops at the per-run cap and leaves the rest for the next night", async () => {
    const stack = makeStack();
    const users = [];
    for (let i = 0; i < 3; i += 1) users.push(await signUpAged(stack, `tavan-${i}@test.local`));

    const first = await stack.cleanup.purgeExpired(new Date(), { maxRemovals: 2 });

    expect(first).toEqual({ scanned: 2, deleted: 2, skipped: 0, busy: 0, failed: 0, capped: true });
    expect(await prisma.companyUser.count()).toBe(1);
    expect(stack.provider.deleteUserStrict).toHaveBeenCalledTimes(2);
    expect(await removalAudits()).toHaveLength(2);

    // The next night takes what was left; nothing is left behind it.
    const second = await stack.cleanup.purgeExpired(new Date(), { maxRemovals: 2 });
    expect(second).toEqual({ scanned: 1, deleted: 1, skipped: 0, busy: 0, failed: 0, capped: false });
    expect(await prisma.companyUser.count()).toBe(0);
    expect(stack.provider.users.size).toBe(0);
  });
});

describe("switched off (UNVERIFIED_SIGNUP_PURGE_ENABLED)", () => {
  // A copy of a database that shares the auth provider with its source must
  // never delete there: off = exactly the behaviour before the feature.
  it.each([
    ["explicit false in a production-mode process (a restored copy)", { NODE_ENV: "production", [UNVERIFIED_SIGNUP_PURGE_ENV]: "false" }],
    ["not set outside production (local stack, tests)", { NODE_ENV: "development" }],
    ["not set and no NODE_ENV", {}],
    ["a value that is neither true nor false", { NODE_ENV: "production", [UNVERIFIED_SIGNUP_PURGE_ENV]: "1" }],
  ])("%s: the sweep removes nothing and a held address keeps its 409", async (_name, env) => {
    const stack = makeStack(prisma, env);
    const team = makeTeam(stack);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    // An invitation that was sent before the address was taken by a sign-up.
    const sent = await team.service.invite(owner.auth, { email: "kapali@test.local", roles: ["ONAYLAYICI"] } as never);
    const invitation = await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: sent.id } });
    const held = await signUpAged(stack, "kapali@test.local");
    expect(stack.cleanup.enabled).toBe(false);

    // Nightly run: nothing is read, nothing is removed, nothing fails.
    await expect(stack.cleanup.purgeExpired()).resolves.toEqual({
      scanned: 0,
      deleted: 0,
      skipped: 0,
      busy: 0,
      failed: 0,
      capped: false,
    });
    await expect(stack.cleanup.removeIfExpired(held.id, "cron")).resolves.toEqual({ status: "disabled" });
    await expect(stack.cleanup.releaseAddress("kapali@test.local", "signup")).resolves.toBe(false);

    // Lazy paths: sign-up, team invitation and invitation acceptance answer 409 as before.
    await expect(stack.auth.signup(signupDto("kapali@test.local"))).rejects.toBeInstanceOf(ConflictException);
    await expect(
      team.service.invite(owner.auth, { email: "kapali@test.local", roles: ["SATISCI"] } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      team.service.acceptInvitation(invitation.token, {
        firstName: "Deniz",
        lastName: "Kaya",
        password: "Guclu!Parola9x",
        termsAccepted: true,
        mediationAccepted: true,
        kvkkAccepted: true,
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);

    await expectAccountIntact(held);
    expect(stack.provider.deleteUserStrict).not.toHaveBeenCalled();
    expect(stack.provider.deleteUser).not.toHaveBeenCalled();
    expect(stack.provider.users.has(held.authId!)).toBe(true);
    expect(stack.provider.createUser).toHaveBeenCalledTimes(1);
    expect(await removalAudits()).toHaveLength(0);
  });

  it("the same data with the switch on is removed (the block above is not vacuous)", async () => {
    const off = makeStack(prisma, { NODE_ENV: "development" });
    const held = await signUpAged(off, "acik@test.local");
    await expect(off.cleanup.purgeExpired()).resolves.toMatchObject({ scanned: 0, deleted: 0 });
    await expectAccountIntact(held);

    // Same database, same provider, a service built with the production default.
    const on = new UnverifiedSignupCleanupService(
      prisma as never,
      off.provider as never,
      off.audit,
      envConfig({ NODE_ENV: "production" }),
    );
    await expect(on.purgeExpired()).resolves.toMatchObject({ scanned: 1, deleted: 1 });
    await expectAccountGone(held);
  });
});

describe("never touched", () => {
  type Aged = Awaited<ReturnType<typeof signUpAged>>;
  const otherCompany = () => makeCompanyWithUser(prisma, { tier: "GOLD" });

  /** Each case differs from a removable sign-up in exactly one thing. */
  const cases: Array<[string, SignupPurgeSkipReason, (user: Aged) => Promise<unknown>]> = [
    [
      "an account whose e-mail is verified",
      "verified",
      (u) => prisma.companyUser.update({ where: { id: u.id }, data: { emailVerifiedAt: new Date() } }),
    ],
    [
      "a member added by an admin (e-mail unverified)",
      "invited_member",
      (u) => prisma.companyUser.update({ where: { id: u.id }, data: { invitedAt: new Date() } }),
    ],
    [
      "a member who joined through a team invitation (e-mail unverified)",
      "invited_member",
      (u) =>
        prisma.companyUser.update({
          where: { id: u.id },
          data: { invitedById: "inviter-user", invitedAt: new Date() },
        }),
    ],
    [
      "an account that has signed in",
      "account_used",
      (u) => prisma.companyUser.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } }),
    ],
    [
      "an account that is not the owner of its company",
      "not_owner",
      (u) => prisma.company.update({ where: { id: u.companyId }, data: { ownerUserId: null } }),
    ],
    [
      "a company with completed onboarding",
      "onboarding_completed",
      (u) => prisma.company.update({ where: { id: u.companyId }, data: { onboardingCompletedAt: new Date() } }),
    ],
    ["a company with a second user", "other_users", (u) => makeUser(prisma, u.companyId)],
    [
      "a company with a second user who was removed (soft-deleted)",
      "other_users",
      (u) => makeUser(prisma, u.companyId, undefined, { deletedAt: new Date(), isActive: false }),
    ],
    [
      "a company an admin has blocked",
      "admin_state",
      (u) => prisma.company.update({ where: { id: u.companyId }, data: { isBlocked: true, blockedAt: new Date() } }),
    ],
    [
      "a company an admin has deactivated",
      "admin_state",
      (u) => prisma.company.update({ where: { id: u.companyId }, data: { isActive: false } }),
    ],
    [
      "a company that was given a package",
      "admin_state",
      (u) => prisma.company.update({ where: { id: u.companyId }, data: { tier: "GOLD" } }),
    ],
    [
      "a company whose verification an admin has started",
      "admin_state",
      (u) =>
        prisma.company.update({ where: { id: u.companyId }, data: { companyVerificationStatus: "PENDING" } }),
    ],
    [
      "an account an admin has deactivated",
      "admin_state",
      (u) => prisma.companyUser.update({ where: { id: u.id }, data: { isActive: false } }),
    ],
    [
      "business record: a request of its own",
      "business_records",
      (u) => makeListing(prisma, { companyId: u.companyId, createdById: u.id, status: "DRAFT" }),
    ],
    [
      "business record: an address",
      "business_records",
      (u) =>
        prisma.companyAddress.create({
          data: { companyId: u.companyId, type: "FATURA", title: "Merkez", addressLine: "Sokak 1" },
        }),
    ],
    [
      "business record: an admin note",
      "business_records",
      (u) => prisma.companyAdminNote.create({ data: { companyId: u.companyId, adminId: "admin-1", body: "note" } }),
    ],
    [
      "business record: a membership event",
      "business_records",
      (u) => prisma.companyMembershipEvent.create({ data: { companyId: u.companyId, action: "GRANT", months: 1 } }),
    ],
    [
      "business record: a message another company wrote to it",
      "business_records",
      async (u) => {
        const other = await otherCompany();
        const thread = await prisma.messageThread.create({
          data: { buyerCompanyId: other.company.id, sellerCompanyId: u.companyId },
        });
        await prisma.message.create({
          data: { threadId: thread.id, senderCompanyId: other.company.id, senderName: "Buyer", body: "hello" },
        });
      },
    ],
    [
      "business record: a block another company put on it",
      "business_records",
      async (u) => {
        const other = await otherCompany();
        await prisma.companyBlock.create({
          data: { blockerCompanyId: other.company.id, blockedCompanyId: u.companyId },
        });
      },
    ],
    [
      "business record: a team invitation it sent",
      "business_records",
      (u) =>
        prisma.companyUserInvitation.create({
          data: {
            companyId: u.companyId,
            email: "ekip@test.local",
            token: randomUUID(),
            expiresAt: new Date(Date.now() + DAY_MS),
            invitedById: u.id,
          },
        }),
    ],
    [
      "business record: a connection it started",
      "business_records",
      async (u) => {
        const other = await otherCompany();
        await prisma.companyConnection.create({
          data: { inviterCompanyId: u.companyId, inviteeCompanyId: other.company.id, invitedById: u.id },
        });
      },
    ],
  ];

  it.each(cases)("%s", async (_name, reason, mutate) => {
    const stack = makeStack();
    const email = `korunan-${randomUUID()}@test.local`;
    const user = await signUpAged(stack, email);
    await mutate(user);

    // The one function, the sweep and the lazy release all say no.
    await expect(stack.cleanup.removeIfExpired(user.id, "cron")).resolves.toEqual({ status: "skipped", reason });
    expect(await stack.cleanup.purgeExpired()).toMatchObject({ deleted: 0, failed: 0 });
    await expect(stack.cleanup.releaseAddress(email, "signup")).resolves.toBe(false);
    await expect(stack.auth.signup(signupDto(email))).rejects.toBeInstanceOf(ConflictException);

    await expectAccountIntact(user);
    expect(await prisma.emailVerificationCode.count({ where: { companyUserId: user.id } })).toBe(1);
    expect(stack.provider.deleteUserStrict).not.toHaveBeenCalled();
    expect(stack.provider.users.has(user.authId!)).toBe(true);
    expect(await removalAudits()).toHaveLength(0);
  });

  it("an unverified member in a live company (admin-added and team-invited) stays, and so does the company", async () => {
    const stack = makeStack();
    const live = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({ where: { id: live.company.id }, data: { onboardingCompletedAt: new Date() } });
    await prisma.companyUser.update({ where: { id: live.user.id }, data: { emailVerifiedAt: new Date() } });
    const old = new Date(Date.now() - TTL_MS - DAY_MS);
    const byAdmin = await makeUser(prisma, live.company.id, undefined, { createdAt: old, invitedAt: old });
    const byInvitation = await makeUser(prisma, live.company.id, undefined, {
      createdAt: old,
      invitedAt: old,
      invitedById: live.user.id,
    });

    expect(await stack.cleanup.purgeExpired()).toMatchObject({ scanned: 0, deleted: 0 });
    for (const member of [byAdmin, byInvitation]) {
      await expect(stack.cleanup.removeIfExpired(member.id, "cron")).resolves.toEqual({
        status: "skipped",
        reason: "invited_member",
      });
      await expect(stack.cleanup.releaseAddress(member.email, "team_invite")).resolves.toBe(false);
      await expectAccountIntact(member);
    }
    expect(await prisma.companyUser.count({ where: { companyId: live.company.id } })).toBe(3);
  });

  it("a sign-up company to which an admin added a member keeps both accounts", async () => {
    const stack = makeStack();
    const owner = await signUpAged(stack, "kurucu@test.local");
    const member = await makeUser(prisma, owner.companyId, undefined, {
      createdAt: owner.createdAt,
      invitedAt: owner.createdAt,
    });

    expect(await stack.cleanup.purgeExpired()).toMatchObject({ scanned: 1, deleted: 0, skipped: 1 });
    await expectAccountIntact(owner);
    await expectAccountIntact(member);
  });
});

describe("invitation bound through a referral token at sign-up", () => {
  it("goes back to PENDING with the placeholder; the link binds again at the next sign-up", async () => {
    const stack = makeStack();
    // The link was mailed to info@, the supplier signs up with another address.
    const { buyer, listing, token, referral, queued } = await inviteToRequest("info@tedarikci.test");
    // Another buyer invited the SIGN-UP address by e-mail: never bound (the address was never proven).
    const second = await inviteToRequest("ada@tedarikci.test");
    const user = await signUpAged(stack, "ada@tedarikci.test", TTL_MS + DAY_MS, { referralToken: token });

    const bound = await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: referral.id } });
    expect(bound).toMatchObject({ status: "ACCEPTED", acceptedCompanyId: user.companyId });
    expect(
      await prisma.companyConnection.count({
        where: { inviterCompanyId: buyer.company.id, inviteeCompanyId: user.companyId, status: "ACTIVE" },
      }),
    ).toBe(1);
    expect(
      await prisma.listingInvitation.count({ where: { listingId: listing.id, invitedCompanyId: user.companyId } }),
    ).toBe(1);
    // The buyer later picks the connected placeholder for one more request.
    // No invitation is written for a company without a proven account
    // (review CLEAN-4), so what hangs on the placeholder is exactly what the
    // token bound - and that comes back below.
    const later = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
    });
    const placeholderCode = (await prisma.company.findUniqueOrThrow({ where: { id: user.companyId } })).rothernId!;
    await expect(
      makeListingsRig().service.addInvitations(buyer.auth, later.id, [placeholderCode]),
    ).resolves.toEqual({ added: 0, skipped: 0 });
    const boundRequests = async (companyId: string) =>
      (await prisma.listingInvitation.findMany({ where: { invitedCompanyId: companyId }, select: { listingId: true } }))
        .map((row) => row.listingId)
        .sort();
    const before = await boundRequests(user.companyId);
    expect(before).toEqual([listing.id]);

    expect(await stack.cleanup.purgeExpired()).toMatchObject({ deleted: 1, failed: 0 });

    await expectAccountGone(user);
    const restored = await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: referral.id } });
    expect(restored).toMatchObject({ status: "PENDING", acceptedCompanyId: null, acceptedAt: null, token });
    // A removal is not a send: the "last sent" clock of the link does not move.
    expect(restored.updatedAt.getTime()).toBe(bound.updatedAt.getTime());
    expect(await prisma.companyConnection.count()).toBe(0);
    expect(await prisma.listingInvitation.count()).toBe(0);
    // The buyer's side is whole: both requests, the queued request invitation, the other buyer's invitation.
    expect(await prisma.listing.count({ where: { companyId: buyer.company.id } })).toBe(2);
    expect(await prisma.externalListingInvite.findUnique({ where: { id: queued.id } })).toMatchObject({
      state: "SENT",
      referralInviteId: referral.id,
    });
    expect(await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: second.referral.id } })).toMatchObject({
      status: "PENDING",
      acceptedCompanyId: null,
    });
    expect((await removalAudits())[0]!.metadata).toMatchObject({ restored: 1, source: "cron" });

    // The address signs up again through the same link: bound again.
    await stack.auth.signup(signupDto("ada@tedarikci.test", { referralToken: token }));
    const again = await prisma.companyUser.findUniqueOrThrow({ where: { email: "ada@tedarikci.test" } });
    expect(again.id).not.toBe(user.id);
    expect(await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: referral.id } })).toMatchObject({
      status: "ACCEPTED",
      acceptedCompanyId: again.companyId,
    });
    expect(
      await prisma.listingInvitation.count({ where: { listingId: listing.id, invitedCompanyId: again.companyId } }),
    ).toBe(1);
    // Nothing was lost on the way: the buyer has the same connection and the
    // same invitations for this supplier as before the removal.
    expect(await boundRequests(again.companyId)).toEqual(before);
    expect(
      await prisma.companyConnection.count({
        where: { inviterCompanyId: buyer.company.id, inviteeCompanyId: again.companyId, status: "ACTIVE" },
      }),
    ).toBe(1);
  });
});

describe("a buyer cannot add a request invitation for a connected placeholder (review CLEAN-4)", () => {
  // A request invitation is a counterparty record: the removal's cascade must
  // never take one a buyer created. So none is written for a company whose
  // accounts never proved their address - on every path that writes one.
  const FUTURE = () => new Date(Date.now() + 5 * DAY_MS);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

  /** Buyer + a placeholder connected through the buyer's referral link + a verified connection. */
  async function setup(stack: Stack) {
    const { buyer, listing: first, token, referral } = await inviteToRequest("info@tedarikci.test");
    const placeholder = await signUpAged(stack, "ada@tedarikci.test", TTL_MS + DAY_MS, { referralToken: token });
    const placeholderCompany = await prisma.company.findUniqueOrThrow({ where: { id: placeholder.companyId } });
    const member = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.companyUser.update({ where: { id: member.user.id }, data: { emailVerifiedAt: new Date() } });
    const memberCode = "MEMB-0001";
    await prisma.company.update({ where: { id: member.company.id }, data: { rothernId: memberCode } });
    await connect(prisma, buyer.company.id, member.company.id, buyer.user.id);
    const invitedTo = async (listingId: string) =>
      (await prisma.listingInvitation.findMany({ where: { listingId }, select: { invitedCompanyId: true } }))
        .map((row) => row.invitedCompanyId)
        .sort();
    return {
      buyer,
      first,
      token,
      referral,
      placeholder,
      placeholderCode: placeholderCompany.rothernId!,
      member,
      memberCode,
      invitedTo,
      listings: makeListingsRig().service,
    };
  }

  it("the starting point: the placeholder is an ACTIVE connection of the buyer and holds the token's invitation", async () => {
    const stack = makeStack();
    const { buyer, first, placeholder, invitedTo } = await setup(stack);
    expect(
      await prisma.companyConnection.count({
        where: { inviterCompanyId: buyer.company.id, inviteeCompanyId: placeholder.companyId, status: "ACTIVE" },
      }),
    ).toBe(1);
    expect(await invitedTo(first.id)).toEqual([placeholder.companyId]);
  });

  it("publishing a public request invites the verified connection, not the placeholder", async () => {
    const stack = makeStack();
    const { buyer, placeholder, member, invitedTo, listings } = await setup(stack);
    const open = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE(),
    });

    await listings.announceListingOpen(open.id, "invitation");
    await settle();

    expect(await invitedTo(open.id)).toEqual([member.company.id]);
    expect(await prisma.listingInvitation.count({ where: { invitedCompanyId: placeholder.companyId } })).toBe(1);
  });

  it("manual invitation: add, create and edit write no row for the placeholder; the token's invitation survives an edit", async () => {
    const stack = makeStack();
    const { buyer, first, placeholder, placeholderCode, member, memberCode, invitedTo, listings } = await setup(stack);
    const dto = (invitations: string[], over: Record<string, unknown> = {}) =>
      ({
        type: "ALIM",
        format: "RFQ",
        visibility: "PRIVATE",
        title: "Celik boru alimi",
        closesAt: FUTURE().toISOString(),
        items: [{ name: "M6 civata", quantity: 100, unit: "adet" }],
        invitations,
        ...over,
      }) as never;

    // "Add invitations" on an open request.
    const open = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
      visibility: "PRIVATE",
      format: "RFQ",
      closesAt: FUTURE(),
      openNotifiedAt: new Date(),
    });
    await expect(listings.addInvitations(buyer.auth, open.id, [placeholderCode, memberCode])).resolves.toEqual({
      added: 1,
      skipped: 0,
    });
    expect(await invitedTo(open.id)).toEqual([member.company.id]);

    // A new request with both picked.
    const created = await listings.create(buyer.auth, dto([placeholderCode, memberCode], { asDraft: true }));
    expect(await invitedTo(created.id)).toEqual([member.company.id]);

    // Editing that request with both picked again.
    await listings.updateListing(buyer.auth, created.id, dto([memberCode, placeholderCode]));
    expect(await invitedTo(created.id)).toEqual([member.company.id]);

    // Editing the request the token is bound to: the form sends the prior
    // invitee back and the row stays (it is the one the link restores).
    await prisma.listing.update({
      where: { id: first.id },
      data: { format: "RFQ", visibility: "PRIVATE", closesAt: FUTURE(), openNotifiedAt: new Date() },
    });
    await listings.updateListing(buyer.auth, first.id, dto([placeholderCode, memberCode]));
    expect(await invitedTo(first.id)).toEqual([member.company.id, placeholder.companyId].sort());
    await settle();

    expect(
      (await prisma.listingInvitation.findMany({ where: { invitedCompanyId: placeholder.companyId } })).map(
        (row) => row.listingId,
      ),
    ).toEqual([first.id]);
  });

  it("members suggested by the AI discovery: a connected placeholder is not eligible", async () => {
    const stack = makeStack();
    const { buyer, placeholder, member, invitedTo, listings } = await setup(stack);
    const draft = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "DRAFT",
      visibility: "PRIVATE",
      format: "RFQ",
      closesAt: FUTURE(),
    });

    const { results } = await listings.inviteDiscoveredMembers(buyer.auth, draft.id, [
      placeholder.companyId,
      member.company.id,
    ]);

    expect(results).toEqual([
      { companyId: placeholder.companyId, status: "NOT_ELIGIBLE" },
      { companyId: member.company.id, status: "INVITED" },
    ]);
    expect(await invitedTo(draft.id)).toEqual([member.company.id]);
  });

  it("once the address is proven the same company is invited like any connection", async () => {
    const stack = makeStack();
    const { buyer, token } = await inviteToRequest("info@tedarikci.test");
    // Not aged: the code mailed at sign-up is still good.
    await stack.auth.signup(signupDto("ada@tedarikci.test", { referralToken: token }));
    const account = await prisma.companyUser.findUniqueOrThrow({ where: { email: "ada@tedarikci.test" } });
    const code = (await prisma.company.findUniqueOrThrow({ where: { id: account.companyId } })).rothernId!;
    const listings = makeListingsRig().service;
    const open = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE(),
      openNotifiedAt: new Date(),
    });
    await expect(listings.addInvitations(buyer.auth, open.id, [code])).resolves.toEqual({ added: 0, skipped: 0 });

    await stack.auth.verifyEmail("ada@tedarikci.test", extractCode(stack.mail));

    await expect(listings.addInvitations(buyer.auth, open.id, [code])).resolves.toEqual({ added: 1, skipped: 0 });
    const next = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE(),
    });
    await listings.announceListingOpen(next.id, "invitation");
    await settle();
    expect(
      await prisma.listingInvitation.count({ where: { listingId: next.id, invitedCompanyId: account.companyId } }),
    ).toBe(1);
    // And a verified account is never removed, however old.
    await prisma.companyUser.update({
      where: { id: account.id },
      data: { createdAt: new Date(Date.now() - TTL_MS - DAY_MS) },
    });
    await expect(stack.cleanup.purgeExpired()).resolves.toMatchObject({ scanned: 0, deleted: 0 });
  });

  it("after all of it the removal takes nothing the buyer added, and the link brings back what it took", async () => {
    const stack = makeStack();
    const { buyer, first, token, placeholder, placeholderCode, member, memberCode, listings } = await setup(stack);
    const open = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE(),
    });
    await listings.announceListingOpen(open.id, "invitation");
    await listings.addInvitations(buyer.auth, open.id, [placeholderCode, memberCode]);
    await listings.inviteDiscoveredMembers(buyer.auth, open.id, [placeholder.companyId]);
    await settle();
    const buyerRows = () =>
      prisma.listingInvitation.findMany({
        where: { listing: { companyId: buyer.company.id } },
        select: { listingId: true, invitedCompanyId: true },
        orderBy: [{ listingId: "asc" }, { invitedCompanyId: "asc" }],
      });
    const before = await buyerRows();
    expect(before).toEqual(
      [
        { listingId: first.id, invitedCompanyId: placeholder.companyId },
        { listingId: open.id, invitedCompanyId: member.company.id },
      ].sort((a, b) => a.listingId.localeCompare(b.listingId)),
    );

    await expect(stack.cleanup.purgeExpired()).resolves.toMatchObject({ deleted: 1, failed: 0 });

    // Gone with the placeholder: only the row the token had bound.
    expect(await buyerRows()).toEqual([{ listingId: open.id, invitedCompanyId: member.company.id }]);

    // The supplier signs up again with the same link: the buyer's side is as before.
    await stack.auth.signup(signupDto("ada@tedarikci.test", { referralToken: token }));
    const again = await prisma.companyUser.findUniqueOrThrow({ where: { email: "ada@tedarikci.test" } });
    expect(await buyerRows()).toEqual(
      before.map((row) =>
        row.invitedCompanyId === placeholder.companyId ? { ...row, invitedCompanyId: again.companyId } : row,
      ),
    );
  });
});

describe("lazy release at sign-up", () => {
  it("an address held by an expired unverified sign-up signs up again: the old sign-up is removed first", async () => {
    const stack = makeStack();
    const old = await signUpAged(stack, "yeniden@test.local");

    const res = await stack.auth.signup(signupDto("YENIDEN@test.local "));

    expect(res).toEqual({ email: "yeniden@test.local", verificationRequired: true, emailSent: true });
    await expectAccountGone(old);
    const fresh = await prisma.companyUser.findUniqueOrThrow({ where: { email: "yeniden@test.local" } });
    expect(fresh.id).not.toBe(old.id);
    expect(fresh.emailVerifiedAt).toBeNull();
    expect(await prisma.company.count()).toBe(1);
    // The provider holds exactly one user for the address: the new one.
    expect(stack.provider.deleteUserStrict).toHaveBeenCalledWith(old.authId);
    expect([...stack.provider.users]).toEqual([[fresh.authId, "yeniden@test.local"]]);
    const audits = await removalAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ entityId: old.companyId });
    expect(audits[0]!.metadata).toMatchObject({ source: "signup", email: "y***@test.local" });

    // The new sign-up is an ordinary one: its code verifies and opens a session.
    const session = (await stack.auth.verifyEmail("yeniden@test.local", extractCode(stack.mail))) as {
      token?: string;
    };
    expect(session.token).toEqual(expect.any(String));
  });

  it("a sign-up that is not expired yet keeps the address (409, nothing removed)", async () => {
    const stack = makeStack();
    const held = await signUpAged(stack, "bekleyen@test.local", TTL_MS - 60_000);

    await expect(stack.auth.signup(signupDto("bekleyen@test.local"))).rejects.toBeInstanceOf(ConflictException);

    await expectAccountIntact(held);
    expect(stack.provider.deleteUserStrict).not.toHaveBeenCalled();
    expect(stack.provider.createUser).toHaveBeenCalledTimes(1);
    expect(await removalAudits()).toHaveLength(0);
  });
});

describe("lazy release at team invitation", () => {
  it("an address held by an expired unverified sign-up can be invited: the old sign-up is removed first", async () => {
    const stack = makeStack();
    const team = makeTeam(stack);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const old = await signUpAged(stack, "ekip@test.local");

    const res = await team.service.invite(owner.auth, { email: "Ekip@test.local", roles: ["ONAYLAYICI"] } as never);

    expect(res).toMatchObject({ email: "ekip@test.local", emailSent: true });
    await expectAccountGone(old);
    expect(stack.provider.users.size).toBe(0);
    expect(
      await prisma.companyUserInvitation.count({
        where: { companyId: owner.company.id, email: "ekip@test.local", status: "PENDING" },
      }),
    ).toBe(1);
    const audits = await removalAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0]!.metadata).toMatchObject({ source: "team_invite", email: "e***@test.local" });

    // And the invitation is usable: the address joins the team.
    const invitation = await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: res.id } });
    await team.service.acceptInvitation(invitation.token, {
      firstName: "Deniz",
      lastName: "Kaya",
      password: "Guclu!Parola9x",
      termsAccepted: true,
      mediationAccepted: true,
      kvkkAccepted: true,
    } as never);
    const member = await prisma.companyUser.findUniqueOrThrow({ where: { email: "ekip@test.local" } });
    expect(member).toMatchObject({ companyId: owner.company.id, invitedById: owner.user.id });
    expect(member.emailVerifiedAt).not.toBeNull();
  });

  it("a sign-up that is not expired yet, and a verified account, keep the 409", async () => {
    const stack = makeStack();
    const team = makeTeam(stack);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const fresh = await signUpAged(stack, "taze@test.local", TTL_MS - 60_000);
    const verified = await signUpAged(stack, "dogrulanmis@test.local");
    await prisma.companyUser.update({ where: { id: verified.id }, data: { emailVerifiedAt: new Date() } });

    for (const email of ["taze@test.local", "dogrulanmis@test.local"]) {
      await expect(
        team.service.invite(owner.auth, { email, roles: ["ONAYLAYICI"] } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    }

    await expectAccountIntact(fresh);
    await expectAccountIntact(verified);
    expect(await prisma.companyUserInvitation.count()).toBe(0);
    expect(stack.provider.deleteUserStrict).not.toHaveBeenCalled();
  });

  it("accepting an invitation releases an address that a sign-up took after the invitation was sent", async () => {
    const stack = makeStack();
    const team = makeTeam(stack);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const res = await team.service.invite(owner.auth, { email: "sonradan@test.local", roles: ["ONAYLAYICI"] } as never);
    const invitation = await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: res.id } });
    const squatter = await signUpAged(stack, "sonradan@test.local");

    await team.service.acceptInvitation(invitation.token, {
      firstName: "Deniz",
      lastName: "Kaya",
      password: "Guclu!Parola9x",
      termsAccepted: true,
      mediationAccepted: true,
      kvkkAccepted: true,
    } as never);

    await expectAccountGone(squatter);
    const member = await prisma.companyUser.findUniqueOrThrow({ where: { email: "sonradan@test.local" } });
    expect(member.companyId).toBe(owner.company.id);
    expect((await removalAudits())[0]!.metadata).toMatchObject({ source: "team_invite" });
  });
});

describe("auth provider failure", () => {
  it("nothing is deleted when the provider refuses; the next run finishes the job", async () => {
    const stack = makeStack();
    const { buyer, listing, token, referral } = await inviteToRequest("info@tedarikci.test");
    const user = await signUpAged(stack, "ada@tedarikci.test", TTL_MS + DAY_MS, { referralToken: token });
    stack.provider.deleteUserStrict.mockRejectedValueOnce(new Error("provider is down"));

    await expect(stack.cleanup.purgeExpired()).rejects.toThrow(/1 account\(s\) could not be removed/);

    // Exactly as before: the account, its code, the bound invitation, the connection, the request invitation.
    await expectAccountIntact(user);
    expect(await prisma.emailVerificationCode.count({ where: { companyUserId: user.id } })).toBe(1);
    expect(await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: referral.id } })).toMatchObject({
      status: "ACCEPTED",
      acceptedCompanyId: user.companyId,
    });
    expect(
      await prisma.companyConnection.count({
        where: { inviterCompanyId: buyer.company.id, inviteeCompanyId: user.companyId },
      }),
    ).toBe(1);
    expect(
      await prisma.listingInvitation.count({ where: { listingId: listing.id, invitedCompanyId: user.companyId } }),
    ).toBe(1);
    expect(stack.provider.users.has(user.authId!)).toBe(true);
    expect(await removalAudits()).toHaveLength(0);

    expect(await stack.cleanup.purgeExpired()).toMatchObject({ deleted: 1, failed: 0 });
    await expectAccountGone(user);
    expect(await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: referral.id } })).toMatchObject({
      status: "PENDING",
      acceptedCompanyId: null,
    });
    expect(await removalAudits()).toHaveLength(1);
  });

  it("the lazy path answers 409 as before and leaves the account whole", async () => {
    const stack = makeStack();
    const team = makeTeam(stack);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const held = await signUpAged(stack, "tutulan@test.local");
    stack.provider.deleteUserStrict.mockRejectedValue(new Error("provider is down"));

    await expect(stack.auth.signup(signupDto("tutulan@test.local"))).rejects.toBeInstanceOf(ConflictException);
    await expect(
      team.service.invite(owner.auth, { email: "tutulan@test.local", roles: ["ONAYLAYICI"] } as never),
    ).rejects.toBeInstanceOf(ConflictException);

    await expectAccountIntact(held);
    expect(stack.provider.createUser).toHaveBeenCalledTimes(1);
    expect(stack.provider.users.has(held.authId!)).toBe(true);
    expect(await prisma.companyUserInvitation.count()).toBe(0);
    expect(await removalAudits()).toHaveLength(0);
  });

  it("a provider that keeps failing is not asked once per account: the sweep stops after three in a row", async () => {
    const stack = makeStack();
    const users = [];
    for (let i = 0; i < 5; i += 1) users.push(await signUpAged(stack, `sira-${i}@test.local`));
    stack.provider.deleteUserStrict.mockRejectedValue(new Error("provider is down"));

    await expect(stack.cleanup.purgeExpired()).rejects.toThrow(/3 account\(s\) could not be removed/);

    expect(stack.provider.deleteUserStrict).toHaveBeenCalledTimes(3);
    for (const user of users) await expectAccountIntact(user);
  });

  it("one account that fails does not keep the others from being removed", async () => {
    const stack = makeStack();
    const users = [];
    for (let i = 0; i < 3; i += 1) users.push(await signUpAged(stack, `karma-${i}@test.local`));
    stack.provider.deleteUserStrict.mockRejectedValueOnce(new Error("provider hiccup"));

    await expect(stack.cleanup.purgeExpired()).rejects.toThrow(/1 account\(s\) could not be removed \(deleted=2, scanned=3\)/);

    expect(await prisma.companyUser.count()).toBe(1);
    expect(await removalAudits()).toHaveLength(2);
  });
});

describe("parallel runs and races", () => {
  /** The provider answers slowly: the second run arrives while the first holds the locks. */
  const slowProvider = (stack: Stack) =>
    stack.provider.deleteUserStrict.mockImplementation(async (authId: string) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      stack.provider.users.delete(authId);
    });

  it("two removals of the same account: one deletes, the other finds nothing; one provider call, one audit entry", async () => {
    const stack = makeStack(multi);
    const user = await signUpAged(stack, "paralel@test.local");
    slowProvider(stack);

    const outcomes = await Promise.all([
      stack.cleanup.removeIfExpired(user.id, "cron"),
      stack.cleanup.removeIfExpired(user.id, "signup"),
    ]);

    expect(outcomes.map((o) => o.status).sort()).toEqual(["deleted", "gone"]);
    await expectAccountGone(user);
    expect(stack.provider.deleteUserStrict).toHaveBeenCalledTimes(1);
    expect(await removalAudits()).toHaveLength(1);
  });

  it("two sweeps at once remove every account exactly once and neither fails", async () => {
    const stack = makeStack(multi);
    const users = [];
    for (let i = 0; i < 3; i += 1) users.push(await signUpAged(stack, `supurge-${i}@test.local`));
    slowProvider(stack);

    const [a, b] = await Promise.all([stack.cleanup.purgeExpired(), stack.cleanup.purgeExpired()]);

    expect(a.deleted + b.deleted).toBe(3);
    expect(a.failed + b.failed).toBe(0);
    for (const user of users) await expectAccountGone(user);
    expect(stack.provider.deleteUserStrict).toHaveBeenCalledTimes(3);
    expect(await removalAudits()).toHaveLength(3);
  });

  it("two sign-ups at once for the held address: the old sign-up is removed once and one new account exists", async () => {
    const stack = makeStack(multi);
    const old = await signUpAged(stack, "yaris@test.local");
    slowProvider(stack);

    const results = await Promise.allSettled([
      stack.auth.signup(signupDto("yaris@test.local")),
      stack.auth.signup(signupDto("yaris@test.local")),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(ConflictException);
    await expectAccountGone(old);
    expect(await prisma.companyUser.count({ where: { email: "yaris@test.local" } })).toBe(1);
    expect(await prisma.company.count()).toBe(1);
    expect(stack.provider.users.size).toBe(1);
    expect(stack.provider.deleteUserStrict).toHaveBeenCalledTimes(1);
    expect(await removalAudits()).toHaveLength(1);
  });

  it("a verification that lands between the scan and the locks wins: the account stays", async () => {
    const base = makeStack();
    const user = await signUpAged(base, "sonanda@test.local");
    // The code mailed at sign-up expired long ago; the user asks for a new one.
    await expect(base.auth.resendEmailCode("sonanda@test.local")).resolves.toMatchObject({ sent: true });
    const code = extractCode(base.mail);
    // The sweep's database, with one step right after it has read its candidates.
    let stepped = false;
    const db = {
      $transaction: (...args: unknown[]) =>
        (prisma.$transaction as unknown as (...a: unknown[]) => Promise<unknown>)(...args),
      companyUser: {
        findUnique: (args: never) => prisma.companyUser.findUnique(args),
        findMany: async (args: never) => {
          const rows = await prisma.companyUser.findMany(args);
          if (!stepped) {
            stepped = true;
            await base.auth.verifyEmail("sonanda@test.local", code);
          }
          return rows;
        },
      },
    };
    const cleanup = new UnverifiedSignupCleanupService(
      db as never,
      base.provider as never,
      base.audit,
      envConfig(PURGE_ON),
    );

    const result = await cleanup.purgeExpired();

    expect(stepped).toBe(true);
    expect(result).toEqual({ scanned: 1, deleted: 0, skipped: 1, busy: 0, failed: 0, capped: false });
    await expectAccountIntact(user);
    expect((await prisma.companyUser.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).not.toBeNull();
    expect(base.provider.deleteUserStrict).not.toHaveBeenCalled();
  });

  it("an account whose code row is locked by another transaction is left for the next run without waiting", async () => {
    const stack = makeStack(multi);
    const user = await signUpAged(stack, "mesgul@test.local");
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    // What `verifyEmail` and "send again" hold first: a code row of the account.
    const verification = multi.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM email_verification_codes WHERE "companyUserId" = ${user.id} FOR UPDATE`;
        locked();
        await released;
      },
      { timeout: 20_000 },
    );
    await isLocked;

    const startedAt = Date.now();
    try {
      await expect(stack.cleanup.removeIfExpired(user.id, "cron")).resolves.toEqual({ status: "busy" });
      // NOWAIT: refused at once, not after the lock timeout.
      expect(Date.now() - startedAt).toBeLessThan(3_000);
      await expect(stack.cleanup.releaseAddress("mesgul@test.local", "signup")).resolves.toBe(false);
      await expect(stack.cleanup.purgeExpired()).resolves.toMatchObject({ deleted: 0, busy: 1, failed: 0 });
    } finally {
      release();
      await verification;
    }
    await expectAccountIntact(user);
    expect(stack.provider.deleteUserStrict).not.toHaveBeenCalled();

    // The lock is gone: the next run removes it.
    await expect(stack.cleanup.removeIfExpired(user.id, "cron")).resolves.toMatchObject({ status: "deleted" });
  });
});

describe("a verification in progress (review CLEAN-5)", () => {
  // The user of an expired sign-up asks for a new code (the code step, or the
  // sign-in page after EMAIL_NOT_VERIFIED) just before the removal comes by.
  // The code that was mailed must still work: the account is left alone until
  // that code has expired.
  it("an unused, unexpired code keeps the account on every path; the mailed code then verifies", async () => {
    const stack = makeStack();
    const team = makeTeam(stack);
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const user = await signUpAged(stack, "bekle@test.local", TTL_MS + 60 * 60_000);
    await expect(stack.auth.resendEmailCode("bekle@test.local")).resolves.toMatchObject({ sent: true });
    const code = extractCode(stack.mail);

    await expect(stack.cleanup.removeIfExpired(user.id, "cron")).resolves.toEqual({
      status: "skipped",
      reason: "verification_pending",
    });
    await expect(stack.cleanup.purgeExpired()).resolves.toEqual({
      scanned: 1,
      deleted: 0,
      skipped: 1,
      busy: 0,
      failed: 0,
      capped: false,
    });
    // The lazy callers keep their 409 while the code lives.
    await expect(stack.cleanup.releaseAddress("bekle@test.local", "signup")).resolves.toBe(false);
    await expect(stack.auth.signup(signupDto("bekle@test.local"))).rejects.toBeInstanceOf(ConflictException);
    await expect(
      team.service.invite(owner.auth, { email: "bekle@test.local", roles: ["ONAYLAYICI"] } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    await expectAccountIntact(user);
    expect(stack.provider.deleteUserStrict).not.toHaveBeenCalled();
    expect(await removalAudits()).toHaveLength(0);

    // The code from the mail opens the session; the account is verified for good.
    const session = (await stack.auth.verifyEmail("bekle@test.local", code)) as { token?: string };
    expect(session.token).toEqual(expect.any(String));
    await expect(stack.cleanup.removeIfExpired(user.id, "cron")).resolves.toEqual({ status: "skipped", reason: "verified" });
    await expectAccountIntact(user);
  });

  it("is over when the code has expired: the account is removed and the address is free", async () => {
    const stack = makeStack();
    // Inside the grace day after the expiry (a live code protects only there).
    const user = await signUpAged(stack, "sure@test.local", TTL_MS + 60 * 60_000);
    await stack.auth.resendEmailCode("sure@test.local");
    const live = await prisma.emailVerificationCode.findFirstOrThrow({
      where: { companyUserId: user.id, usedAt: null },
    });

    // One millisecond before the code expires - and at the instant itself, when it still verifies.
    for (const at of [live.expiresAt.getTime() - 1, live.expiresAt.getTime()]) {
      await expect(stack.cleanup.removeIfExpired(user.id, "cron", new Date(at))).resolves.toEqual({
        status: "skipped",
        reason: "verification_pending",
      });
    }
    await expectAccountIntact(user);

    await expect(
      stack.cleanup.purgeExpired(new Date(live.expiresAt.getTime() + 1)),
    ).resolves.toMatchObject({ scanned: 1, deleted: 1, skipped: 0 });
    await expectAccountGone(user);
    expect(stack.provider.users.size).toBe(0);
  });

  it("one day after the expiry a fresh code no longer keeps the account (resend cannot hold an address for good)", async () => {
    const stack = makeStack();
    const user = await signUpAged(stack, "tutulan@test.local", TTL_MS + 24 * 60 * 60_000);
    await expect(stack.auth.resendEmailCode("tutulan@test.local")).resolves.toMatchObject({ sent: true });

    await expect(stack.cleanup.removeIfExpired(user.id, "cron")).resolves.toMatchObject({ status: "deleted" });
    await expectAccountGone(user);
  });

  it("a code that was closed (replaced, or the address was corrected) does not keep the account", async () => {
    const stack = makeStack();
    const user = await signUpAged(stack, "kapanan@test.local");
    await stack.auth.resendEmailCode("kapanan@test.local");
    // Closed without a successor, as "change e-mail" does at the hourly cap.
    await prisma.emailVerificationCode.updateMany({
      where: { companyUserId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await expect(stack.cleanup.removeIfExpired(user.id, "cron")).resolves.toMatchObject({ status: "deleted" });
  });

  it("correcting the address is a verification in progress too (the new code keeps the account)", async () => {
    const stack = makeStack();
    const user = await signUpAged(stack, "yanlis@test.local", TTL_MS + 60 * 60_000);

    await stack.auth.changeSignupEmail({
      email: "yanlis@test.local",
      password: PASSWORD,
      newEmail: "dogru@test.local",
    } as never);
    const code = extractCode(stack.mail);

    await expect(stack.cleanup.purgeExpired()).resolves.toMatchObject({ deleted: 0, skipped: 1, failed: 0 });
    await expectAccountIntact(user);
    const session = (await stack.auth.verifyEmail("dogru@test.local", code)) as { token?: string };
    expect(session.token).toEqual(expect.any(String));
  });

  it("a 'send again' that arrives while the account is being removed answers 'not sent', not a database error", async () => {
    const stack = makeStack(multi);
    const user = await signUpAged(stack, "gec@test.local");
    // The removal is held inside the provider call (its transaction has the
    // rows locked and deleted, not committed) until the resend has looked the
    // account up - then the removal commits and the resend's insert finds no
    // account to hang the code on.
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let inProvider!: () => void;
    const reachedProvider = new Promise<void>((resolve) => (inProvider = resolve));
    stack.provider.deleteUserStrict.mockImplementation(async (authId: string) => {
      inProvider();
      await released;
      stack.provider.users.delete(authId);
    });
    const resendDb = {
      companyUser: { findUnique: (args: never) => multi.companyUser.findUnique(args) },
      emailVerificationCode: {
        count: async (args: never) => {
          const n = await multi.emailVerificationCode.count(args);
          release();
          return n;
        },
        updateMany: (args: never) => multi.emailVerificationCode.updateMany(args),
        create: (args: never) => multi.emailVerificationCode.create(args),
      },
      $queryRaw: (...args: unknown[]) =>
        (multi.$queryRaw as unknown as (...a: unknown[]) => Promise<unknown>)(...args),
    };
    const mail = { send: jest.fn(async () => ({ emailLogId: "t", sent: true })) };
    const resender = new CompanyAuthService(
      resendDb as never,
      new JwtService({ secret: "test-secret", signOptions: { expiresIn: "1h" } }),
      stack.provider as never,
      { log: jest.fn(async () => undefined) } as never,
      mail as never,
      config as never,
      resendDb as never,
    );

    const removal = stack.cleanup.removeIfExpired(user.id, "cron");
    await reachedProvider;
    const resend = resender.resendEmailCode("gec@test.local");

    await expect(resend).resolves.toEqual({ success: true, sent: false });
    await expect(removal).resolves.toMatchObject({ status: "deleted" });
    await expectAccountGone(user);
    expect(mail.send).not.toHaveBeenCalled();
    expect(await prisma.emailVerificationCode.count()).toBe(0);
  });
});

describe("what the auth provider really answered (reviews CLEAN-2 and CLEAN-3)", () => {
  // The real `SupabaseAuthService.deleteUserStrict` through the real client;
  // only `fetch` is a fake - a tiny auth admin API over the provider's users.
  type Reply = () => Promise<Response> | Response;
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  const userNotFound = () =>
    json(404, { code: "user_not_found", message: "User not found" }, { "x-supabase-api-version": "2024-01-01" });

  let fetchSpy: jest.SpyInstance;
  let consoleSpy: jest.SpyInstance;
  afterEach(() => {
    fetchSpy?.mockRestore();
    consoleSpy?.mockRestore();
  });

  /**
   * The stack with the real strict delete. `onDelete` decides what the DELETE
   * request does and answers (it gets the honest reply as a default);
   * a look-up (GET) is answered from the provider's state unless `onLookup`
   * is given.
   */
  function makeRealProviderStack(onDelete: (authId: string, honest: Reply) => Promise<Response> | Response, onLookup?: Reply) {
    const stack = makeStack();
    const supabase = new SupabaseAuthService({
      get: (key: string) =>
        ({
          SUPABASE_URL: "https://proj.supabase.co",
          SUPABASE_ANON_KEY: "anon-jwt",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-jwt",
        })[key],
    } as unknown as ConfigService);
    const requests: Array<{ method: string; authId: string }> = [];
    // auth-js prints the raw fetch error before it wraps it.
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const authId = url.split("/admin/users/")[1] ?? "";
      const method = init?.method ?? "GET";
      requests.push({ method, authId });
      if (method === "DELETE") {
        const honest: Reply = () => {
          if (!stack.provider.users.has(authId)) return userNotFound();
          stack.provider.users.delete(authId);
          return json(200, {});
        };
        return onDelete(authId, honest);
      }
      if (onLookup) return onLookup();
      return stack.provider.users.has(authId)
        ? json(200, { id: authId, email: stack.provider.users.get(authId), aud: "authenticated" })
        : userNotFound();
    });
    stack.provider.deleteUserStrict.mockImplementation((authId: string) => supabase.deleteUserStrict(authId));
    return { stack, requests };
  }

  it("deleted and answered: the account is removed (one request)", async () => {
    const { stack, requests } = makeRealProviderStack((_id, honest) => honest());
    const user = await signUpAged(stack, "temiz@test.local");

    await expect(stack.cleanup.purgeExpired()).resolves.toMatchObject({ deleted: 1, failed: 0 });

    await expectAccountGone(user);
    expect(requests).toEqual([{ method: "DELETE", authId: user.authId }]);
  });

  it("CLEAN-3: the provider deleted the user but the call failed on our side - the row goes with it, nothing can be verified afterwards", async () => {
    // The server acts, then the client times out.
    const { stack, requests } = makeRealProviderStack(async (_id, honest) => {
      await honest();
      throw new TypeError("fetch failed");
    });
    const user = await signUpAged(stack, "zamanasimi@test.local");

    await expect(stack.cleanup.purgeExpired()).resolves.toMatchObject({ deleted: 1, failed: 0 });

    // One look-up settled it; the row did not survive with a dead auth id.
    expect(requests.map((r) => r.method)).toEqual(["DELETE", "GET"]);
    await expectAccountGone(user);
    expect(stack.provider.users.size).toBe(0);
    expect(await removalAudits()).toHaveLength(1);
    // The dead end of the review: resend + verify on the surviving row. There is no row.
    await expect(stack.auth.resendEmailCode("zamanasimi@test.local")).resolves.toMatchObject({ sent: true });
    expect(await prisma.emailVerificationCode.count()).toBe(0);
    // And the address is free again at the provider and here.
    await expect(stack.auth.signup(signupDto("zamanasimi@test.local"))).resolves.toMatchObject({
      verificationRequired: true,
    });
  });

  it("the call failed and the user is still there: nothing is deleted, the next run finishes", async () => {
    let fail = true;
    const { stack } = makeRealProviderStack((_id, honest) => {
      if (fail) throw new TypeError("fetch failed");
      return honest();
    });
    const user = await signUpAged(stack, "duruyor@test.local");

    await expect(stack.cleanup.purgeExpired()).rejects.toThrow(/1 account\(s\) could not be removed/);
    await expectAccountIntact(user);
    expect(stack.provider.users.has(user.authId!)).toBe(true);

    fail = false;
    await expect(stack.cleanup.purgeExpired()).resolves.toMatchObject({ deleted: 1, failed: 0 });
    await expectAccountGone(user);
  });

  it("CLEAN-2: a gateway 404 is not 'already gone' - the row that knows the auth id stays", async () => {
    // The gateway cannot route /auth/v1: every request under it gets its 404.
    const gateway404: Reply = () => json(404, { message: "no Route matched with those values" });
    const { stack, requests } = makeRealProviderStack(() => gateway404(), gateway404);
    const users = [
      await signUpAged(stack, "rota-1@test.local"),
      await signUpAged(stack, "rota-2@test.local"),
    ];

    await expect(stack.cleanup.purgeExpired()).rejects.toThrow(/2 account\(s\) could not be removed \(deleted=0/);

    for (const user of users) {
      await expectAccountIntact(user);
      // The provider still has the user, and the row still knows which one.
      expect(stack.provider.users.has(user.authId!)).toBe(true);
      expect((await prisma.companyUser.findUniqueOrThrow({ where: { id: user.id } })).authId).toBe(user.authId);
    }
    expect(requests.filter((r) => r.method === "DELETE")).toHaveLength(2);
    expect(await removalAudits()).toHaveLength(0);
    // The lazy path keeps the 409 instead of freeing an address the provider still holds.
    await expect(stack.auth.signup(signupDto("rota-1@test.local"))).rejects.toBeInstanceOf(ConflictException);
  });

  it("the retry of a run whose commit failed: the provider says 'user not found' and the row is removed", async () => {
    const { stack, requests } = makeRealProviderStack((_id, honest) => honest());
    const user = await signUpAged(stack, "yarim@test.local");
    // The provider user is already gone (an earlier run deleted it, its commit was lost).
    stack.provider.users.delete(user.authId!);

    await expect(stack.cleanup.purgeExpired()).resolves.toMatchObject({ deleted: 1, failed: 0 });

    await expectAccountGone(user);
    expect(requests.map((r) => r.method)).toEqual(["DELETE"]);
  });
});
