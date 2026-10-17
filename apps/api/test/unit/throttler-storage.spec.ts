/**
 * Rate-limit storage with one independent counter per key (arayuz testi
 * 2026-10 code-auth-2).
 *
 * The library storage (`ThrottlerStorageService`) cancels the expiry timers of
 * EVERY key under a throttler name when one key's block ends; the other
 * clients' hits then never expire and they get 429 without going over their
 * limit. `PerKeyThrottlerStorage` keeps the library's single-key semantics and
 * removes the cross-key effect. All tests run on fake time.
 */
import "reflect-metadata";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Throttle, ThrottlerException, ThrottlerStorageService } from "@nestjs/throttler";
import { ClientIpThrottlerGuard } from "../../src/common/http/client-ip-throttler.guard";
import {
  PerKeyThrottlerStorage,
  THROTTLER_CLOCK_STEP_TOLERANCE_MS,
  THROTTLER_SWEEP_INTERVAL_MS,
} from "../../src/common/http/throttler-storage";

const TTL = 60_000;
const LIMIT = 3;
const START = new Date("2026-10-08T09:00:00.000Z");

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(START);
});
afterEach(() => {
  jest.useRealTimers();
});

const wait = (ms: number) => jest.advanceTimersByTime(ms);

/** resend-email-code: `@Throttle({ auth: { limit: 3, ttl: 60_000 } })`. */
function client(storage: PerKeyThrottlerStorage, key: string, opts: { ttl?: number; limit?: number; block?: number } = {}) {
  const ttl = opts.ttl ?? TTL;
  return () => storage.increment(key, ttl, opts.limit ?? LIMIT, opts.block ?? ttl, "auth");
}

describe("PerKeyThrottlerStorage - one key", () => {
  it("counts hits and blocks the request that goes over the limit", async () => {
    const hit = client(new PerKeyThrottlerStorage(), "a");
    await expect(hit()).resolves.toEqual({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 });
    await expect(hit()).resolves.toMatchObject({ totalHits: 2, isBlocked: false });
    await expect(hit()).resolves.toMatchObject({ totalHits: 3, isBlocked: false });
    await expect(hit()).resolves.toEqual({ totalHits: 4, timeToExpire: 60, isBlocked: true, timeToBlockExpire: 60 });
  });

  it("does not count hits while blocked; the block is not extended by them", async () => {
    const hit = client(new PerKeyThrottlerStorage(), "a");
    for (let i = 0; i < 4; i++) await hit();
    wait(20_000);
    await expect(hit()).resolves.toMatchObject({ totalHits: 4, isBlocked: true, timeToBlockExpire: 40 });
    wait(39_000);
    await expect(hit()).resolves.toMatchObject({ isBlocked: true, timeToBlockExpire: 1 });
  });

  it("each hit expires ttl after it was made (sliding window)", async () => {
    const hit = client(new PerKeyThrottlerStorage(), "a");
    await hit(); // t = 0
    wait(30_000);
    await hit(); // t = 30 s
    wait(29_999);
    await expect(hit()).resolves.toMatchObject({ totalHits: 3, isBlocked: false }); // t = 59.999 s
    wait(1);
    // t = 60 s: the first hit is gone, the other two still count.
    await expect(hit()).resolves.toMatchObject({ totalHits: 3, isBlocked: false });
    wait(30_000);
    // t = 90 s: only the hits of 59.999 s and 60 s are left.
    await expect(hit()).resolves.toMatchObject({ totalHits: 3, isBlocked: false });
  });

  it("when the block ends the counter starts fresh: that request is hit number 1", async () => {
    const hit = client(new PerKeyThrottlerStorage(), "a");
    for (let i = 0; i < 4; i++) await hit();
    wait(TTL);
    await expect(hit()).resolves.toEqual({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 });
    await expect(hit()).resolves.toMatchObject({ totalHits: 2, isBlocked: false });
  });

  it("a block shorter than ttl also restarts the counter (old hits do not come back)", async () => {
    const hit = client(new PerKeyThrottlerStorage(), "a", { block: 10_000 });
    for (let i = 0; i < 4; i++) await hit();
    wait(10_000);
    await expect(hit()).resolves.toMatchObject({ totalHits: 1, isBlocked: false });
    wait(55_000);
    // The four hits of t = 0 would expire at 60 s; they were dropped at 10 s.
    await expect(hit()).resolves.toMatchObject({ totalHits: 2, isBlocked: false });
  });

  it("creates no timer at all", async () => {
    const hit = client(new PerKeyThrottlerStorage(), "a", { limit: 500 });
    for (let i = 0; i < 300; i++) await hit();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("the same key under two throttler names does not share a counter", async () => {
    const storage = new PerKeyThrottlerStorage();
    for (let i = 0; i < 4; i++) await storage.increment("k", TTL, LIMIT, TTL, "auth");
    await expect(storage.increment("k", TTL, LIMIT, TTL, "default")).resolves.toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });
});

describe("PerKeyThrottlerStorage - keys are independent (the finding)", () => {
  /**
   * resend-email-code, limit 3 per 60 s, two clients:
   *  1) B sends 4 requests within one second (the 4th is 429);
   *  2) 45 s later A sends 2 requests;
   *  3) 18 s later B sends 1 request (its block is over and is reset);
   *  4) 68 s after its first two requests A sends 2 more -> a fresh window.
   */
  async function scenario(hitA: () => Promise<{ isBlocked: boolean }>, hitB: () => Promise<{ isBlocked: boolean }>) {
    const blocked: Record<string, boolean> = {};
    for (let i = 1; i <= 4; i++) {
      blocked[`B${i}`] = (await hitB()).isBlocked;
      wait(250);
    }
    wait(45_000);
    blocked.A1 = (await hitA()).isBlocked;
    blocked.A2 = (await hitA()).isBlocked;
    wait(18_000);
    blocked.B5 = (await hitB()).isBlocked;
    wait(50_000); // 68 s after A1/A2
    blocked.A3 = (await hitA()).isBlocked;
    blocked.A4 = (await hitA()).isBlocked;
    return blocked;
  }

  it("one client's block reset does not keep another client's old hits alive", async () => {
    const storage = new PerKeyThrottlerStorage();
    const a = client(storage, "client-a");
    const b = client(storage, "client-b");
    await expect(scenario(a, b)).resolves.toEqual({
      B1: false,
      B2: false,
      B3: false,
      B4: true,
      A1: false,
      A2: false,
      B5: false,
      A3: false,
      A4: false,
    });
    // A's second pair really is a fresh window: its next request is hit 3, not 5.
    await expect(a()).resolves.toMatchObject({ totalHits: 3, isBlocked: false });
  });

  it("the library storage fails the same scenario (why it was replaced)", async () => {
    const library = new ThrottlerStorageService();
    const hit = (key: string) => () => library.increment(key, TTL, LIMIT, TTL, "auth");
    const blocked = await scenario(hit("client-a"), hit("client-b"));
    library.onApplicationShutdown();
    // If this starts to fail the library fixed its storage; our own storage can be reviewed then.
    expect(blocked).toMatchObject({ B4: true, B5: false, A3: false, A4: true });
  });

  it("through the guard: client A is not rate-limited by client B's reset", async () => {
    class ResendCtrl {
      @Throttle({ auth: { limit: 3, ttl: TTL } })
      resend() {}
    }
    const guard = new ClientIpThrottlerGuard(
      {
        throttlers: [
          { name: "default", ttl: TTL, limit: 100 },
          { name: "auth", ttl: TTL, limit: 1000 },
        ],
      },
      new PerKeyThrottlerStorage(),
      new Reflector(),
    );
    await guard.onModuleInit();
    const call = (ip: string) => async () => {
      const ctx = {
        getType: () => "http",
        getHandler: () => ResendCtrl.prototype.resend,
        getClass: () => ResendCtrl,
        switchToHttp: () => ({
          getRequest: () => ({ method: "POST", originalUrl: "/api/company-auth/resend-email-code", headers: {}, ip }),
          getResponse: () => ({ header: jest.fn() }),
        }),
      } as unknown as ExecutionContext;
      try {
        await guard.canActivate(ctx);
        return { isBlocked: false };
      } catch (err) {
        if (!(err instanceof ThrottlerException)) throw err;
        return { isBlocked: true };
      }
    };
    await expect(scenario(call("10.0.0.1"), call("10.0.0.2"))).resolves.toMatchObject({
      B4: true,
      B5: false,
      A3: false,
      A4: false,
    });
  });
});

describe("PerKeyThrottlerStorage - same answers as the library for a single key", () => {
  /** Deterministic pseudo-random gaps (LCG), so a failure is reproducible. */
  function gaps(seed: number, count: number, maxGapMs: number): number[] {
    let state = seed;
    return Array.from({ length: count }, () => {
      state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return state % maxGapMs;
    });
  }

  it.each([
    { name: "block = ttl, bursts", ttl: 60_000, limit: 3, block: 60_000, maxGap: 25_000, seed: 7 },
    { name: "block = ttl, sparse (idle sweeps in between)", ttl: 60_000, limit: 3, block: 60_000, maxGap: 150_000, seed: 11 },
    { name: "block shorter than ttl", ttl: 60_000, limit: 5, block: 20_000, maxGap: 9_000, seed: 23 },
    { name: "block longer than ttl", ttl: 10_000, limit: 2, block: 45_000, maxGap: 7_000, seed: 31 },
  ])("$name", async ({ ttl, limit, block, maxGap, seed }) => {
    const library = new ThrottlerStorageService();
    const own = new PerKeyThrottlerStorage();
    let blockedAtLeastOnce = false;
    for (const gap of gaps(seed, 400, maxGap)) {
      wait(gap);
      const expected = await library.increment("k", ttl, limit, block, "auth");
      const actual = await own.increment("k", ttl, limit, block, "auth");
      expect({
        totalHits: actual.totalHits,
        timeToExpire: actual.timeToExpire,
        isBlocked: actual.isBlocked,
      }).toEqual({
        totalHits: expected.totalHits,
        timeToExpire: expected.timeToExpire,
        isBlocked: expected.isBlocked,
      });
      // The library's value is meaningful (and read by the guard) only while blocked.
      if (expected.isBlocked) {
        blockedAtLeastOnce = true;
        expect(actual.timeToBlockExpire).toBe(expected.timeToBlockExpire);
      }
    }
    library.onApplicationShutdown();
    expect(blockedAtLeastOnce).toBe(true);
  });
});

describe("PerKeyThrottlerStorage - idle keys are swept", () => {
  it("the map does not keep keys that went idle", async () => {
    const storage = new PerKeyThrottlerStorage();
    for (let i = 0; i < 1_000; i++) await storage.increment(`ip-${i}`, TTL, 100, TTL, "default");
    expect(storage.size).toBe(1_000);
    wait(TTL + THROTTLER_SWEEP_INTERVAL_MS);
    // Any later request triggers the sweep; no timer is involved.
    await storage.increment("ip-new", TTL, 100, TTL, "default");
    expect(storage.size).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("keeps keys that still have live hits or a running block", async () => {
    const storage = new PerKeyThrottlerStorage();
    const blockedClient = client(storage, "blocked", { block: 10 * TTL });
    for (let i = 0; i < 4; i++) await blockedClient();
    await client(storage, "idle")();
    wait(TTL - 1);
    await client(storage, "live")();
    wait(1);
    // t = ttl: "idle" is over, "live" has a hit for another 59.999 s, "blocked" for 9 more ttl.
    expect(storage.sweep()).toBe(1);
    expect(storage.size).toBe(2);
    await expect(blockedClient()).resolves.toMatchObject({ isBlocked: true });
    await expect(client(storage, "live")()).resolves.toMatchObject({ totalHits: 2 });
    wait(10 * TTL);
    expect(storage.sweep()).toBe(2);
    expect(storage.size).toBe(0);
  });

  it("sweeps at most once per interval", async () => {
    const storage = new PerKeyThrottlerStorage();
    await storage.increment("first", 1_000, 100, 1_000, "default"); // sweep clock starts here
    wait(THROTTLER_SWEEP_INTERVAL_MS - 1);
    await storage.increment("second", 1_000, 100, 1_000, "default");
    expect(storage.size).toBe(2); // "first" is idle but the sweep is not due yet
    wait(1);
    await storage.increment("third", 1_000, 100, 1_000, "default");
    expect(storage.size).toBe(2); // "first" swept; "second" still has its hit
  });
});

describe("PerKeyThrottlerStorage - wall clock stepped back", () => {
  it("counters restart instead of staying blocked for the size of the step", async () => {
    const storage = new PerKeyThrottlerStorage();
    const hit = client(storage, "a");
    for (let i = 0; i < 4; i++) await hit();
    jest.setSystemTime(new Date(START.getTime() - 3_600_000));
    await expect(hit()).resolves.toEqual({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 });
  });

  it("a small correction is ignored", async () => {
    const storage = new PerKeyThrottlerStorage();
    const hit = client(storage, "a");
    for (let i = 0; i < 4; i++) await hit();
    jest.setSystemTime(new Date(START.getTime() - THROTTLER_CLOCK_STEP_TOLERANCE_MS));
    await expect(hit()).resolves.toMatchObject({ totalHits: 4, isBlocked: true });
  });
});

describe("wiring", () => {
  it("ThrottlerModule.forRoot gets our storage (the library default is not used)", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../src/app.module.ts"), "utf8");
    const forRoot = source.slice(source.indexOf("ThrottlerModule.forRoot({"));
    expect(forRoot.slice(0, 200)).toContain("storage: new PerKeyThrottlerStorage()");
  });
});
