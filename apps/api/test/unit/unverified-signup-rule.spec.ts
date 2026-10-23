/**
 * Expired unverified sign-ups (owner decision 2026-10-08) - the parts that
 * need no database: the 7-day limit, the rule that names what is never
 * deleted, the classification of every `Company` / `CompanyUser` relation
 * (the removal deletes through the foreign-key cascade, so a relation that
 * nobody classified would be deleted without a decision), the switch that
 * decides where the removal runs at all, the per-run cap, the job's cron
 * registration and the module wiring of the optional constructor parameters.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@rothern/db";
import { HAS_PROVEN_ACCOUNT_WHERE } from "../../src/common/company/proven-account";
import { CronRegistryService } from "../../src/common/cron/cron-registry.service";
import { PrismaBypassService, PrismaService } from "../../src/common/prisma/prisma.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyAuthModule } from "../../src/modules/company-auth/company-auth.module";
import { UnverifiedSignupScheduler } from "../../src/modules/company-auth/schedulers/unverified-signup.scheduler";
import { CompanyAuthService } from "../../src/modules/company-auth/services/company-auth.service";
import {
  SIGNUP_BLOCKING_RELATIONS,
  SIGNUP_BLOCKING_SINGLE_RELATIONS,
  SIGNUP_DEPENDENT_RELATIONS,
  SIGNUP_USER_DEPENDENT_RELATIONS,
  UNVERIFIED_SIGNUP_MAX_REMOVALS_PER_RUN,
  UNVERIFIED_SIGNUP_PURGE_ENV,
  UNVERIFIED_SIGNUP_TTL_DAYS,
  UnverifiedSignupCleanupService,
  isUnverifiedSignupExpired,
  resolveSignupPurgeSwitch,
  signupPurgeSkipReason,
  type SignupAccountSnapshot,
} from "../../src/modules/company-auth/services/unverified-signup-cleanup.service";
import { CompanyUsersModule } from "../../src/modules/company-users/company-users.module";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import { EmailService } from "../../src/modules/email/email.service";
import { SupabaseAuthService } from "../../src/modules/supabase-auth/supabase-auth.service";

const DAY_MS = 86_400_000;
const NOW = new Date("2026-10-08T12:00:00.000Z");

/** A sign-up the rule lets go: unverified, 8 days old, alone in an untouched placeholder. */
function removable(): SignupAccountSnapshot {
  const counts = Object.fromEntries(SIGNUP_BLOCKING_RELATIONS.map((relation) => [relation, 0]));
  return {
    id: "user-1",
    email: "ada@test.local",
    authId: "auth-1",
    createdAt: new Date(NOW.getTime() - 8 * DAY_MS),
    emailVerifiedAt: null,
    invitedById: null,
    invitedAt: null,
    lastLoginAt: null,
    isActive: true,
    deletedAt: null,
    emailVerificationCodes: [] as { expiresAt: Date }[],
    company: {
      id: "company-1",
      ownerUserId: "user-1",
      onboardingCompletedAt: null,
      tier: "STANDART",
      membershipEndAt: null,
      companyVerificationStatus: "UNVERIFIED",
      isActive: true,
      isBlocked: false,
      timeSavingsConfig: null,
      _count: { users: 1, ...counts },
    },
  } as SignupAccountSnapshot;
}

describe("the limit", () => {
  it("is one constant: 7 days", () => {
    expect(UNVERIFIED_SIGNUP_TTL_DAYS).toBe(7);
  });

  it("is reached exactly 7 days after the sign-up, not one millisecond earlier", () => {
    const createdAt = new Date("2026-10-01T12:00:00.000Z");
    const limit = createdAt.getTime() + 7 * DAY_MS;
    expect(isUnverifiedSignupExpired(createdAt, new Date(limit - 1))).toBe(false);
    expect(isUnverifiedSignupExpired(createdAt, new Date(limit))).toBe(true);
    expect(isUnverifiedSignupExpired(createdAt, new Date(limit + 1))).toBe(true);
    // A clock that runs behind the row never expires it.
    expect(isUnverifiedSignupExpired(createdAt, new Date(createdAt.getTime() - DAY_MS))).toBe(false);
  });
});

describe("signupPurgeSkipReason", () => {
  it("lets the untouched expired sign-up go", () => {
    expect(signupPurgeSkipReason(removable(), NOW)).toBeNull();
  });

  it("names the 7-day boundary on the account itself", () => {
    const account = removable();
    account.createdAt = new Date(NOW.getTime() - 7 * DAY_MS + 1);
    expect(signupPurgeSkipReason(account, NOW)).toBe("not_expired");
    account.createdAt = new Date(NOW.getTime() - 7 * DAY_MS);
    expect(signupPurgeSkipReason(account, NOW)).toBeNull();
  });

  it.each(SIGNUP_BLOCKING_RELATIONS.map((relation) => [relation] as const))(
    "one %s row is a business record",
    (relation) => {
      const account = removable();
      account.company._count[relation] = 1;
      expect(signupPurgeSkipReason(account, NOW)).toBe("business_records");
    },
  );

  it("a company-level time-savings override is a business record", () => {
    const account = removable();
    account.company.timeSavingsConfig = { id: "cfg-1" };
    expect(signupPurgeSkipReason(account, NOW)).toBe("business_records");
  });

  it("no users or more than one user in the company: never the placeholder of one sign-up", () => {
    for (const users of [0, 2]) {
      const account = removable();
      account.company._count.users = users;
      expect(signupPurgeSkipReason(account, NOW)).toBe("other_users");
    }
  });

  it("a verified account is named first, whatever else is true", () => {
    const account = removable();
    account.emailVerifiedAt = NOW;
    account.company._count.listings = 3;
    expect(signupPurgeSkipReason(account, NOW)).toBe("verified");
  });

  describe("a verification in progress (review CLEAN-5)", () => {
    // Inside the grace day after the expiry (7 days + 1 minute old).
    const inGrace = () => {
      const account = removable();
      account.createdAt = new Date(NOW.getTime() - 7 * DAY_MS - 60_000);
      return account;
    };

    it("stops protecting one day after the expiry: fresh codes cannot hold an address for good", () => {
      const live = [{ expiresAt: new Date(NOW.getTime() + 14 * 60_000) }];
      const lastProtected = removable();
      lastProtected.createdAt = new Date(NOW.getTime() - 8 * DAY_MS + 1);
      lastProtected.emailVerificationCodes = live;
      expect(signupPurgeSkipReason(lastProtected, NOW)).toBe("verification_pending");
      // 7 days + UNVERIFIED_SIGNUP_PENDING_GRACE_DAYS old: removable although a code is live.
      const past = removable();
      past.createdAt = new Date(NOW.getTime() - 8 * DAY_MS);
      past.emailVerificationCodes = live;
      expect(signupPurgeSkipReason(past, NOW)).toBeNull();
    });

    // The snapshot holds the UNUSED codes only (`ACCOUNT_SELECT`).
    it("an unused code that has not expired keeps the account, to the millisecond", () => {
      const account = inGrace();
      account.emailVerificationCodes = [{ expiresAt: new Date(NOW.getTime() + 1) }];
      expect(signupPurgeSkipReason(account, NOW)).toBe("verification_pending");
      // `verifyEmail` refuses a code only when `expiresAt < now`: at its
      // expiry instant the code still verifies, one millisecond later it does not.
      account.emailVerificationCodes = [{ expiresAt: new Date(NOW.getTime()) }];
      expect(signupPurgeSkipReason(account, NOW)).toBe("verification_pending");
      account.emailVerificationCodes = [{ expiresAt: new Date(NOW.getTime() - 1) }];
      expect(signupPurgeSkipReason(account, NOW)).toBeNull();
    });

    it("expired codes do not keep it; one live code among them does", () => {
      const account = inGrace();
      const expired = { expiresAt: new Date(NOW.getTime() - 8 * DAY_MS + 15 * 60_000) };
      account.emailVerificationCodes = [expired, { ...expired }];
      expect(signupPurgeSkipReason(account, NOW)).toBeNull();
      account.emailVerificationCodes = [expired, { expiresAt: new Date(NOW.getTime() + 14 * 60_000) }];
      expect(signupPurgeSkipReason(account, NOW)).toBe("verification_pending");
    });

    it("is named last: a permanent reason is reported for a protected account", () => {
      const account = inGrace();
      account.emailVerificationCodes = [{ expiresAt: new Date(NOW.getTime() + 60_000) }];
      account.company._count.listings = 1;
      expect(signupPurgeSkipReason(account, NOW)).toBe("business_records");
      account.createdAt = new Date(NOW.getTime() - DAY_MS);
      expect(signupPurgeSkipReason(account, NOW)).toBe("not_expired");
    });
  });
});

describe("the switch (review CLEAN-1)", () => {
  it("is one environment variable", () => {
    expect(UNVERIFIED_SIGNUP_PURGE_ENV).toBe("UNVERIFIED_SIGNUP_PURGE_ENABLED");
  });

  it.each([
    // [value, NODE_ENV, enabled, source]
    ["true", "production", true, "explicit"],
    ["true", "development", true, "explicit"],
    ["true", undefined, true, "explicit"],
    ["false", "production", false, "explicit"],
    ["false", "test", false, "explicit"],
    [" false ", "production", false, "explicit"],
    // Not set: on only where NODE_ENV is exactly "production" (Render staging and production).
    [undefined, "production", true, "default"],
    ["", "production", true, "default"],
    [undefined, "development", false, "default"],
    [undefined, "test", false, "default"],
    [undefined, "staging", false, "default"],
    [undefined, "prod", false, "default"],
    [undefined, undefined, false, "default"],
    // Neither "true" nor "false": never falls through to the production default.
    ["TRUE", "production", false, "invalid"],
    ["1", "production", false, "invalid"],
    ["off", "production", false, "invalid"],
    ["no", "production", false, "invalid"],
    ["yes", "development", false, "invalid"],
  ] as const)("value %p with NODE_ENV %p -> enabled %p (%s)", (raw, nodeEnv, enabled, source) => {
    expect(resolveSignupPurgeSwitch(raw, nodeEnv)).toEqual({ enabled, source });
  });

  const makeService = (env: Record<string, string | undefined>, deps: Partial<Record<"bypass" | "provider" | "audit", object>> = {}) =>
    new UnverifiedSignupCleanupService(
      (deps.bypass ?? {}) as never,
      (deps.provider ?? {}) as never,
      (deps.audit ?? {}) as never,
      { get: (key: string) => env[key] } as never,
    );

  it("the service reads it once, from the configuration", () => {
    expect(makeService({ NODE_ENV: "production" }).enabled).toBe(true);
    expect(makeService({ NODE_ENV: "production", UNVERIFIED_SIGNUP_PURGE_ENABLED: "false" }).enabled).toBe(false);
    expect(makeService({ NODE_ENV: "development" }).enabled).toBe(false);
    expect(makeService({ NODE_ENV: "development", UNVERIFIED_SIGNUP_PURGE_ENABLED: "true" }).enabled).toBe(true);
    expect(makeService({}).enabled).toBe(false);
  });

  it("off: the sweep, the lazy release and the one removal touch nothing - not even a read", async () => {
    // Every database, provider or audit access would throw: the deps have no members.
    const touched: string[] = [];
    const trap = (name: string) =>
      new Proxy(
        {},
        {
          get: (_target, prop) => {
            touched.push(`${name}.${String(prop)}`);
            throw new Error(`${name}.${String(prop)} was used while the removal is off`);
          },
        },
      );
    for (const env of [
      { NODE_ENV: "production", UNVERIFIED_SIGNUP_PURGE_ENABLED: "false" },
      { NODE_ENV: "development" },
      { NODE_ENV: "test" },
      { NODE_ENV: "production", UNVERIFIED_SIGNUP_PURGE_ENABLED: "0" },
    ]) {
      const service = makeService(env, { bypass: trap("db"), provider: trap("provider"), audit: trap("audit") });
      await expect(service.purgeExpired()).resolves.toEqual({
        scanned: 0,
        deleted: 0,
        skipped: 0,
        busy: 0,
        failed: 0,
        capped: false,
      });
      // The lazy path answers "not released": its callers keep the 409 they had before the feature.
      await expect(service.releaseAddress("ada@firma.com", "signup")).resolves.toBe(false);
      await expect(service.releaseAddress("ada@firma.com", "team_invite")).resolves.toBe(false);
      await expect(service.removeIfExpired("user-1", "cron")).resolves.toEqual({ status: "disabled" });
    }
    expect(touched).toEqual([]);
  });

  describe("the state is logged once at start-up", () => {
    let log: jest.SpyInstance;
    let warn: jest.SpyInstance;
    beforeEach(() => {
      log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
      warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    });
    afterEach(() => {
      log.mockRestore();
      warn.mockRestore();
    });
    const lines = (spy: jest.SpyInstance) => spy.mock.calls.map((call) => String(call[0]));

    it("on by default in production", () => {
      makeService({ NODE_ENV: "production" }).onModuleInit();
      expect(lines(log)).toEqual([expect.stringMatching(/purge is ON \(UNVERIFIED_SIGNUP_PURGE_ENABLED not set, NODE_ENV=production/)]);
      expect(lines(warn)).toEqual([]);
    });

    it("on by an explicit value", () => {
      makeService({ NODE_ENV: "development", UNVERIFIED_SIGNUP_PURGE_ENABLED: "true" }).onModuleInit();
      expect(lines(log)).toEqual([expect.stringContaining("purge is ON (UNVERIFIED_SIGNUP_PURGE_ENABLED=true)")]);
    });

    it("off by default outside production", () => {
      makeService({ NODE_ENV: "development" }).onModuleInit();
      expect(lines(log)).toEqual([expect.stringMatching(/purge is OFF \(UNVERIFIED_SIGNUP_PURGE_ENABLED not set, NODE_ENV=development/)]);
      expect(lines(warn)).toEqual([]);
    });

    it("off in a production-mode process (a restored copy) is a warning", () => {
      makeService({ NODE_ENV: "production", UNVERIFIED_SIGNUP_PURGE_ENABLED: "false" }).onModuleInit();
      expect(lines(warn)).toEqual([
        expect.stringContaining("OFF in a production-mode process (UNVERIFIED_SIGNUP_PURGE_ENABLED=false)"),
      ]);
      expect(lines(log)).toEqual([]);
    });

    it("an unreadable value is a warning and does not echo the value", () => {
      makeService({ NODE_ENV: "production", UNVERIFIED_SIGNUP_PURGE_ENABLED: "Yes-please" }).onModuleInit();
      expect(lines(warn)).toEqual([expect.stringContaining('neither "true" nor "false"')]);
      expect(lines(warn).join(" ")).not.toContain("Yes-please");
      expect(lines(log)).toEqual([]);
    });
  });
});

describe("the per-run cap", () => {
  it("is one constant next to the limit: 500 removals", () => {
    expect(UNVERIFIED_SIGNUP_MAX_REMOVALS_PER_RUN).toBe(500);
  });

  /** A sweep over `total` candidates that are all removable; no database. */
  function sweepOver(total: number) {
    const ids = Array.from({ length: total }, (_, i) => `user-${String(i).padStart(5, "0")}`);
    const findMany = jest.fn(async (args: { where: { id?: { gt: string } }; take: number }) => {
      const after = args.where.id?.gt;
      return ids
        .filter((id) => (after ? id > after : true))
        .slice(0, args.take)
        .map((id) => ({ id }));
    });
    const service = new UnverifiedSignupCleanupService(
      { companyUser: { findMany } } as never,
      {} as never,
      {} as never,
      { get: (key: string) => (key === UNVERIFIED_SIGNUP_PURGE_ENV ? "true" : undefined) } as never,
    );
    const removed: string[] = [];
    jest.spyOn(service, "removeIfExpired").mockImplementation(async (userId: string) => {
      removed.push(userId);
      return { status: "deleted", userId, companyId: `c-${userId}`, restoredInvites: 0 };
    });
    return { service, removed, ids };
  }

  let warn: jest.SpyInstance;
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("a backlog larger than the cap: exactly 500 are removed, the cap is logged, the rest waits", async () => {
    const { service, removed, ids } = sweepOver(620);

    const result = await service.purgeExpired();

    expect(result).toEqual({ scanned: 500, deleted: 500, skipped: 0, busy: 0, failed: 0, capped: true });
    expect(removed).toEqual(ids.slice(0, 500));
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining("stopped at the cap of 500 removals per run"),
    ]);
  });

  it("a backlog of exactly the cap is removed whole and no cap is reported", async () => {
    const { service, removed } = sweepOver(500);

    const result = await service.purgeExpired();

    expect(result).toMatchObject({ deleted: 500, capped: false });
    expect(removed).toHaveLength(500);
    expect(warn).not.toHaveBeenCalled();
  });

  it("only removals count: accounts that are kept or busy do not use the cap up", async () => {
    const { service } = sweepOver(30);
    let n = 0;
    (service.removeIfExpired as jest.Mock).mockImplementation(async (userId: string) => {
      n += 1;
      if (n % 3 === 1) return { status: "skipped", reason: "business_records" };
      if (n % 3 === 2) return { status: "busy" };
      return { status: "deleted", userId, companyId: "c", restoredInvites: 0 };
    });

    const result = await service.purgeExpired(new Date(), { maxRemovals: 4 });

    // The 4th removal is candidate 12; candidate 13 meets the cap.
    expect(result).toEqual({ scanned: 12, deleted: 4, skipped: 4, busy: 4, failed: 0, capped: true });
  });
});

describe("relation classification (the removal deletes through the cascade)", () => {
  const model = (name: string) => {
    const found = Prisma.dmmf.datamodel.models.find((m) => m.name === name);
    if (!found) throw new Error(`model not found: ${name}`);
    return found;
  };
  const relationFields = (name: string) =>
    model(name)
      .fields.filter((f) => f.kind === "object")
      .map((f) => f.name);

  it("every Company relation is a business record or a dependent row - none is unclassified, none is both", () => {
    const classified = [
      ...SIGNUP_BLOCKING_RELATIONS,
      ...SIGNUP_BLOCKING_SINGLE_RELATIONS,
      ...SIGNUP_DEPENDENT_RELATIONS,
    ];
    expect(new Set(classified).size).toBe(classified.length);
    expect([...classified].sort()).toEqual(relationFields("Company").sort());
  });

  it("list relations are counted, one-to-one relations are read: the two blocking lists match the model", () => {
    const company = model("Company");
    const isList = (name: string) => company.fields.find((f) => f.name === name)?.isList;
    for (const relation of [...SIGNUP_BLOCKING_RELATIONS, ...SIGNUP_DEPENDENT_RELATIONS]) {
      expect([relation, isList(relation)]).toEqual([relation, true]);
    }
    for (const relation of SIGNUP_BLOCKING_SINGLE_RELATIONS) {
      expect([relation, isList(relation)]).toEqual([relation, false]);
    }
  });

  it("every CompanyUser relation is the company or a dependent row", () => {
    expect([...SIGNUP_USER_DEPENDENT_RELATIONS, "company"].sort()).toEqual(relationFields("CompanyUser").sort());
  });

  it("no table blocks the delete of a company user, and only orders block the delete of a company", () => {
    // A relation that RESTRICTs the delete would turn a removal the rule
    // allowed into a database error; orders are covered by the rule itself.
    const restricting = Prisma.dmmf.datamodel.models.flatMap((m) =>
      m.fields
        .filter(
          (f) =>
            f.kind === "object" &&
            (f.type === "Company" || f.type === "CompanyUser") &&
            (f.relationFromFields?.length ?? 0) > 0 &&
            f.relationOnDelete !== "Cascade" &&
            f.relationOnDelete !== "SetNull",
        )
        .map((f) => `${m.name}.${f.name}`),
    );
    expect(restricting.sort()).toEqual(["CompanyOrder.buyer", "CompanyOrder.seller"]);
    expect(SIGNUP_BLOCKING_RELATIONS).toEqual(expect.arrayContaining(["ordersAsBuyer", "ordersAsSeller"]));
  });
});

describe("request invitations are dependent rows only because nobody adds one for a placeholder (review CLEAN-4)", () => {
  // `listingInvitations` goes with the cascade. That loses nothing only while
  // every path that writes a request invitation for a buyer requires a
  // company with a proven account. This reads the sources: a new writer has
  // to be looked at here before it ships.
  const SRC = join(__dirname, "..", "..", "src");
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? sources(join(dir, entry.name))
        : entry.name.endsWith(".ts")
          ? [join(dir, entry.name)]
          : [],
    );
  const WRITE = /listingInvitation\s*\.\s*(create|createMany|upsert)\s*\(/g;

  it("every writer of a request invitation is one of the known ones", () => {
    const writers = sources(SRC)
      .map((file) => [relative(SRC, file), readFileSync(file, "utf8").match(WRITE)?.length ?? 0] as const)
      .filter(([, count]) => count > 0);
    expect(Object.fromEntries(writers)).toEqual({
      // The binding of the referral token / of a proven address (comes back with the link).
      [join("modules", "company-auth", "services", "company-auth.service.ts")]: 1,
      // Buyer-side writers: automatic invitation of connections, create,
      // edit, "add invitations", AI member invitation - all filtered below.
      [join("modules", "company-listings", "services", "company-listings.service.ts")]: 5,
    });
  });

  it("the buyer-side writers all go through the proven-account filter", () => {
    const service = readFileSync(
      join(SRC, "modules", "company-listings", "services", "company-listings.service.ts"),
      "utf8",
    );
    // Automatic invitation, the AI member invitation and the helper of the manual paths.
    expect(service.match(/\.\.\.HAS_PROVEN_ACCOUNT_WHERE/g)).toHaveLength(3);
    // create + edit + "add invitations" take their `connected` set from that helper ...
    expect(service.match(/const connected = await this\.invitableConnectedIds\(/g)).toHaveLength(3);
    // ... and none of them from the raw connection list any more.
    expect(service).not.toMatch(/const connected = new Set\(await this\.connectedCompanyIds\(user\.companyId\)\)/);
    expect(HAS_PROVEN_ACCOUNT_WHERE).toEqual({ users: { some: { emailVerifiedAt: { not: null } } } });
  });
});

describe("the nightly job", () => {
  it("is registered and goes through the cron wrapper: a clean run and a failed run both show in the registry", async () => {
    const registry = new CronRegistryService();
    const cleanup = {
      enabled: true,
      purgeExpired: jest
        .fn()
        .mockResolvedValueOnce({ scanned: 2, deleted: 2, skipped: 0, busy: 0, failed: 0, capped: false })
        .mockRejectedValueOnce(new Error("unverified sign-up sweep: 1 account(s) could not be removed")),
    };
    const scheduler = new UnverifiedSignupScheduler(cleanup as never, registry);
    scheduler.onModuleInit();

    const job = () => registry.snapshot().find((r) => r.key === "signup.purgeUnverified");
    expect(job()).toMatchObject({ lastRunAt: null, runCount: 0 });
    expect(job()!.label).toContain(`${UNVERIFIED_SIGNUP_TTL_DAYS} days`);

    await scheduler.purge();
    expect(job()).toMatchObject({ lastStatus: "ok", lastError: null, runCount: 1 });

    await expect(scheduler.purge()).rejects.toThrow("could not be removed");
    expect(job()).toMatchObject({ lastStatus: "error", runCount: 2 });
    expect(String(job()!.lastError)).toContain("could not be removed");
  });

  it("runs under the cron lock: a run that another instance holds is skipped", async () => {
    const lock = { runExclusive: jest.fn(async () => false) };
    const registry = new CronRegistryService(lock as never);
    const cleanup = { enabled: true, purgeExpired: jest.fn() };
    const scheduler = new UnverifiedSignupScheduler(cleanup as never, registry);
    scheduler.onModuleInit();

    await scheduler.purge();

    expect(lock.runExclusive).toHaveBeenCalledWith("signup.purgeUnverified", expect.any(Function));
    expect(cleanup.purgeExpired).not.toHaveBeenCalled();
  });

  it("where the removal is off the tick does nothing: no sweep, no lock, no run in the registry", async () => {
    const lock = { runExclusive: jest.fn(async (_key: string, fn: () => Promise<void>) => (await fn(), true)) };
    const registry = new CronRegistryService(lock as never);
    const cleanup = { enabled: false, purgeExpired: jest.fn() };
    const scheduler = new UnverifiedSignupScheduler(cleanup as never, registry);
    scheduler.onModuleInit();

    await scheduler.purge();

    expect(cleanup.purgeExpired).not.toHaveBeenCalled();
    expect(lock.runExclusive).not.toHaveBeenCalled();
    // Still listed (the admin page shows the job), but as never run here.
    expect(registry.snapshot().find((r) => r.key === "signup.purgeUnverified")).toMatchObject({
      lastRunAt: null,
      lastStatus: null,
      runCount: 0,
    });
  });

  it("the real service decides: the same scheduler sweeps when the switch is on and not when it is off", async () => {
    const make = (value: string) => {
      const findMany = jest.fn(async () => []);
      const service = new UnverifiedSignupCleanupService(
        { companyUser: { findMany } } as never,
        {} as never,
        {} as never,
        { get: (key: string) => (key === UNVERIFIED_SIGNUP_PURGE_ENV ? value : "production") } as never,
      );
      return { findMany, scheduler: new UnverifiedSignupScheduler(service, new CronRegistryService()) };
    };
    const on = make("true");
    await on.scheduler.purge();
    expect(on.findMany).toHaveBeenCalledTimes(1);

    const off = make("false");
    await off.scheduler.purge();
    expect(off.findMany).not.toHaveBeenCalled();
  });
});

describe("module wiring (the constructor parameters are @Optional for old test rigs)", () => {
  const meta = (key: string, target: object) => (Reflect.getMetadata(key, target) ?? []) as unknown[];

  it("CompanyAuthModule provides the clean-up service and the job, and exports the service", () => {
    expect(meta("providers", CompanyAuthModule)).toEqual(
      expect.arrayContaining([UnverifiedSignupCleanupService, UnverifiedSignupScheduler]),
    );
    expect(meta("exports", CompanyAuthModule)).toContain(UnverifiedSignupCleanupService);
  });

  it("CompanyUsersModule imports CompanyAuthModule, so team invitations get the same service", () => {
    expect(meta("imports", CompanyUsersModule)).toContain(CompanyAuthModule);
  });

  it("the container injects the one clean-up service into the sign-up and the team service", async () => {
    // An @Optional parameter that cannot be resolved is left undefined
    // without an error: the injection itself has to be looked at.
    const stub = (token: abstract new (...args: never[]) => unknown) => ({ provide: token, useValue: {} });
    @Module({
      providers: [
        stub(PrismaService),
        stub(PrismaBypassService),
        stub(JwtService),
        stub(SupabaseAuthService),
        stub(AuditService),
        stub(EmailService),
        // The clean-up service reads its switch from the configuration when it is built.
        { provide: ConfigService, useValue: { get: () => undefined } },
        UnverifiedSignupCleanupService,
        UnverifiedSignupScheduler,
        CompanyAuthService,
        CompanyUsersService,
      ],
    })
    class WiringModule {}

    const app = await NestFactory.createApplicationContext(WiringModule, { logger: false });
    try {
      const cleanup = app.get(UnverifiedSignupCleanupService);
      expect(cleanup).toBeInstanceOf(UnverifiedSignupCleanupService);
      // No value and no NODE_ENV=production in this container: off.
      expect(cleanup.enabled).toBe(false);
      const injected = (service: object) => (service as { unverifiedSignups?: unknown }).unverifiedSignups;
      expect(injected(app.get(CompanyAuthService))).toBe(cleanup);
      expect(injected(app.get(CompanyUsersService))).toBe(cleanup);
      expect((app.get(UnverifiedSignupScheduler) as unknown as { cleanup: unknown }).cleanup).toBe(cleanup);
    } finally {
      await app.close();
    }
  });
});
