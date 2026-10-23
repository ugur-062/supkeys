/**
 * REGISTRY OF ASYNCHRONOUS WEB SEARCHES (live re-check 2026-10-09, N1) -
 * contract of `ExternalSearchRegistry` (pure, in memory):
 *  - a search is RUNNING, then DONE (+ result) or FAILED (+ error) - once;
 *  - only its owner (user + company) sees it; anybody else gets "not found";
 *  - bounded: three running searches per user, a total cap (the oldest
 *    finished search makes room; only running ones left = refused), a finished
 *    search is forgotten after the retention;
 *  - a search that outlives its limit is FAILED and a late result is dropped;
 *  - starting the search that is already running for the user joins it (one
 *    search, one bill);
 *  - a search that becomes FAILED is told to `onFailed` exactly once (R6-5);
 *  - no timers (nothing to leak).
 * The service around it: `supplier-discovery-async-search.spec.ts`.
 */
import {
  ExternalSearchRefused,
  ExternalSearchRegistry,
  type ExternalSearchError,
  type ExternalSearchFailure,
} from "../../src/modules/ai/supplier-discovery/external-search-registry";

const MIN = 60_000;
const LIMITS = { maxRunningPerUser: 3, maxTotal: 5, keepFinishedMs: 15 * MIN, maxRunMs: 6 * MIN };
const LIMIT_ERROR: ExternalSearchError = { statusCode: 503, message: "took too long" };
const ana = { userId: "u1", companyId: "c1" };
const ben = { userId: "u2", companyId: "c1" };

/** A unit of work the test ends by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function rig(limits = LIMITS) {
  let now = Date.parse("2026-10-09T14:00:00.000Z");
  const registry = new ExternalSearchRegistry<string>(limits, () => now);
  const opts = {
    describeError: (err: unknown): ExternalSearchError => ({ statusCode: 502, message: String((err as Error).message) }),
    limitError: LIMIT_ERROR,
  };
  /** Starts a search whose work the test controls. */
  const begin = (owner = ana) => {
    const work = deferred<string>();
    const search = registry.start(owner, () => work.promise, opts);
    return { ...search, work };
  };
  /** Starts a search and ends it at once. */
  const finished = async (owner = ana, value = "result") => {
    const s = begin(owner);
    s.work.resolve(value);
    await s.settled;
    return s;
  };
  return { registry, opts, begin, finished, advance: (ms: number) => (now += ms) };
}

describe("ExternalSearchRegistry — lifecycle", () => {
  it("RUNNING until the work ends, then DONE with the result; `result` only when DONE, `error` only when FAILED", async () => {
    const { registry, begin } = rig();
    const ok = begin();
    expect(registry.view(ana, ok.id)).toEqual({ status: "RUNNING", startedAt: "2026-10-09T14:00:00.000Z" });
    ok.work.resolve("twenty companies");
    await ok.settled;
    expect(registry.view(ana, ok.id)).toEqual({
      status: "DONE",
      startedAt: "2026-10-09T14:00:00.000Z",
      result: "twenty companies",
    });
    expect(ok.failure()).toBeUndefined();

    const bad = begin();
    const boom = new Error("provider down");
    bad.work.reject(boom);
    await bad.settled;
    expect(registry.view(ana, bad.id)).toEqual({
      status: "FAILED",
      startedAt: "2026-10-09T14:00:00.000Z",
      error: { statusCode: 502, message: "provider down" },
    });
    // The raw error stays with the caller of `start`; the view never carries it.
    expect(bad.failure()).toBe(boom);
  });

  it("`settled` never rejects, also when the work throws before its first await or the error cannot be described", async () => {
    const { registry, opts } = rig();
    const sync = registry.start(
      ana,
      () => {
        throw new Error("thrown synchronously");
      },
      opts,
    );
    await expect(sync.settled).resolves.toBeUndefined();
    expect(registry.view(ana, sync.id)?.error).toEqual({ statusCode: 502, message: "thrown synchronously" });

    const undescribed = registry.start(ana, () => Promise.reject(new Error("x")), {
      ...opts,
      describeError: () => {
        throw new Error("describe failed");
      },
    });
    await expect(undescribed.settled).resolves.toBeUndefined();
    expect(registry.view(ana, undescribed.id)).toMatchObject({ status: "FAILED", error: LIMIT_ERROR });
  });

  it("the work starts after `start` has returned (the id exists before anything runs)", async () => {
    const { registry, opts } = rig();
    const order: string[] = [];
    const s = registry.start(
      ana,
      async () => {
        order.push("work");
        return "r";
      },
      opts,
    );
    order.push("started");
    await s.settled;
    expect(order).toEqual(["started", "work"]);
  });
});

describe("ExternalSearchRegistry — ownership", () => {
  it("another user of the same company, the same user id in another company and an unknown id all get null", async () => {
    const { registry, finished } = rig();
    const s = await finished(ana, "mine");
    expect(registry.view(ana, s.id)?.result).toBe("mine");
    expect(registry.view(ben, s.id)).toBeNull();
    expect(registry.view({ userId: "u1", companyId: "c2" }, s.id)).toBeNull();
    expect(registry.view(ana, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("ids are not guessable from one another", async () => {
    const { finished } = rig();
    const a = await finished();
    const b = await finished();
    expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(b.id).not.toBe(a.id);
  });
});

describe("ExternalSearchRegistry — retention", () => {
  it("a finished search is kept 15 minutes from the moment it FINISHED, then it is forgotten", async () => {
    const { registry, begin, advance } = rig();
    const s = begin();
    advance(2 * MIN);
    s.work.resolve("r");
    await s.settled;
    advance(15 * MIN - 1);
    expect(registry.view(ana, s.id)?.status).toBe("DONE");
    advance(1);
    expect(registry.view(ana, s.id)).toBeNull();
    expect(registry.size).toBe(0);
  });

  it("a failed search is kept just as long (the client reads its error)", async () => {
    const { registry, begin, advance } = rig();
    const s = begin();
    s.work.reject(new Error("x"));
    await s.settled;
    advance(14 * MIN);
    expect(registry.view(ana, s.id)?.status).toBe("FAILED");
    advance(MIN);
    expect(registry.view(ana, s.id)).toBeNull();
  });

  it("`drop` forgets one search, `clear` everything", async () => {
    const { registry, finished } = rig();
    const a = await finished();
    const b = await finished();
    registry.drop(a.id);
    expect(registry.view(ana, a.id)).toBeNull();
    expect(registry.view(ana, b.id)?.status).toBe("DONE");
    registry.clear();
    expect(registry.size).toBe(0);
  });
});

describe("ExternalSearchRegistry — bounds", () => {
  const refusal = (fn: () => unknown) => {
    try {
      fn();
    } catch (err) {
      return err instanceof ExternalSearchRefused ? err.reason : `other: ${String(err)}`;
    }
    return null;
  };

  it("a user runs at most three searches at a time; the fourth is refused and its work never starts", async () => {
    const { registry, begin, opts } = rig();
    const running = [begin(), begin(), begin()];
    expect(registry.runningOf(ana)).toBe(3);
    const work = jest.fn(async () => "never");
    expect(refusal(() => registry.start(ana, work, opts))).toBe("USER_LIMIT");
    expect(refusal(() => registry.assertRoom(ana))).toBe("USER_LIMIT");
    await Promise.resolve();
    expect(work).not.toHaveBeenCalled();
    expect(registry.size).toBe(3);
    // The limit is per user: a colleague is not affected.
    expect(refusal(() => registry.assertRoom(ben))).toBeNull();
    // A finished search frees its slot (kept results do not count as running).
    running[0]!.work.resolve("r");
    await running[0]!.settled;
    expect(registry.runningOf(ana)).toBe(2);
    expect(refusal(() => begin())).toBeNull();
    expect(registry.runningOf(ana)).toBe(3);
  });

  it("total cap: the oldest FINISHED search makes room for a new one; with only running searches left the new one is refused", async () => {
    const { registry, begin, finished, advance } = rig();
    const oldest = await finished({ userId: "a", companyId: "c" });
    advance(1_000);
    const newer = await finished({ userId: "b", companyId: "c" });
    const owners = ["d", "e", "f"].map((userId) => ({ userId, companyId: "c" }));
    for (const o of owners) begin(o);
    expect(registry.size).toBe(5);

    begin({ userId: "g", companyId: "c" });
    expect(registry.size).toBe(5);
    expect(registry.view({ userId: "a", companyId: "c" }, oldest.id)).toBeNull();
    expect(registry.view({ userId: "b", companyId: "c" }, newer.id)?.status).toBe("DONE");

    begin({ userId: "h", companyId: "c" });
    expect(registry.size).toBe(5);
    expect(registry.view({ userId: "b", companyId: "c" }, newer.id)).toBeNull();

    // Five running searches, nothing to forget.
    expect(refusal(() => begin({ userId: "i", companyId: "c" }))).toBe("FULL");
    expect(refusal(() => registry.assertRoom({ userId: "i", companyId: "c" }))).toBe("FULL");
    expect(registry.size).toBe(5);
  });

  it("the registry never grows past the cap however many searches finish", async () => {
    const { registry, finished } = rig();
    for (let i = 0; i < 40; i++) await finished({ userId: `u${i}`, companyId: "c" });
    expect(registry.size).toBe(5);
  });
});

describe("ExternalSearchRegistry — a search that outlives its limit", () => {
  it("is FAILED with the limit error as soon as it is looked at, stops counting as running, and a late result is dropped", async () => {
    const { registry, begin, advance } = rig();
    const hung = begin();
    advance(6 * MIN - 1);
    expect(registry.view(ana, hung.id)?.status).toBe("RUNNING");
    expect(registry.runningOf(ana)).toBe(1);
    advance(1);
    expect(registry.view(ana, hung.id)).toEqual({
      status: "FAILED",
      startedAt: "2026-10-09T14:00:00.000Z",
      error: LIMIT_ERROR,
    });
    expect(registry.runningOf(ana)).toBe(0);
    // The work ends after all: the client was told FAILED, it stays FAILED.
    hung.work.resolve("too late");
    await hung.settled;
    expect(registry.view(ana, hung.id)).toMatchObject({ status: "FAILED", error: LIMIT_ERROR });
    expect(registry.view(ana, hung.id)).not.toHaveProperty("result");
  });

  it("is FAILED when its work ends late and nobody looked in between", async () => {
    const { registry, begin, advance } = rig();
    const late = begin();
    advance(6 * MIN + 5_000);
    late.work.resolve("too late");
    await late.settled;
    expect(registry.view(ana, late.id)).toMatchObject({ status: "FAILED", error: LIMIT_ERROR });
  });

  it("a search that never ends is forgotten 15 minutes after its limit (never RUNNING for ever, never kept for ever)", () => {
    const { registry, begin, advance } = rig();
    const hung = begin();
    advance(6 * MIN + 15 * MIN - 1);
    expect(registry.view(ana, hung.id)?.status).toBe("FAILED");
    advance(1);
    expect(registry.view(ana, hung.id)).toBeNull();
    expect(registry.size).toBe(0);
  });

  it("an outlived search does not block the user's next one", () => {
    const { registry, begin, advance } = rig();
    begin();
    begin();
    begin();
    advance(6 * MIN);
    expect(() => begin()).not.toThrow();
    expect(registry.runningOf(ana)).toBe(1);
  });
});

describe("ExternalSearchRegistry — `onFailed`: a FAILED search is told once (round 6 review, R6-5)", () => {
  /** A search whose `onFailed` calls are recorded. */
  function watched(r: ReturnType<typeof rig>) {
    const told: ExternalSearchFailure[] = [];
    const work = deferred<string>();
    const search = r.registry.start(ana, () => work.promise, { ...r.opts, onFailed: (f) => told.push(f) });
    return { ...search, work, told };
  }

  it("the work fails: told once with what the client reads and the raw error; a search that ends DONE is never told", async () => {
    const r = rig();
    const bad = watched(r);
    const boom = new Error("provider down");
    bad.work.reject(boom);
    await bad.settled;
    expect(bad.told).toEqual([{ error: { statusCode: 502, message: "provider down" }, cause: boom, limit: false }]);
    // Looking at it again (polls, the sweep of another start) tells nothing more.
    r.registry.view(ana, bad.id);
    r.registry.runningOf(ana);
    expect(bad.told).toHaveLength(1);

    const ok = watched(r);
    ok.work.resolve("twenty companies");
    await ok.settled;
    r.registry.view(ana, ok.id);
    expect(ok.told).toEqual([]);
  });

  it("the limit gives the search up when it is looked at: told once with the limit error and no cause - not again when the work ends, well or badly", async () => {
    const r = rig();
    const hung = watched(r);
    const stuck = watched(r);
    r.advance(6 * MIN - 1);
    r.registry.view(ana, hung.id);
    expect(hung.told).toEqual([]);
    r.advance(1);
    // One look sweeps every search past its limit.
    r.registry.view(ana, hung.id);
    r.registry.view(ana, hung.id);
    expect(hung.told).toEqual([{ error: LIMIT_ERROR, limit: true }]);
    expect(stuck.told).toEqual([{ error: LIMIT_ERROR, limit: true }]);
    hung.work.reject(new Error("failed at last"));
    stuck.work.resolve("too late");
    await Promise.all([hung.settled, stuck.settled]);
    expect([hung.told.length, stuck.told.length]).toEqual([1, 1]);
  });

  it("the work ends past the limit and nobody looked in between: told once as a limit failure, with the late error as its cause", async () => {
    const r = rig();
    const late = watched(r);
    const lateOk = watched(r);
    r.advance(6 * MIN + 5_000);
    const boom = new Error("timed out upstream");
    late.work.reject(boom);
    lateOk.work.resolve("too late");
    await Promise.all([late.settled, lateOk.settled]);
    expect(late.told).toEqual([{ error: LIMIT_ERROR, cause: boom, limit: true }]);
    expect(lateOk.told).toEqual([{ error: LIMIT_ERROR, limit: true }]);
    r.registry.view(ana, late.id);
    expect(late.told).toHaveLength(1);
  });

  it("an `onFailed` that throws changes nothing: the search is FAILED with its error and `settled` resolves", async () => {
    const r = rig();
    const work = deferred<string>();
    const search = r.registry.start(ana, () => work.promise, {
      ...r.opts,
      onFailed: () => {
        throw new Error("reporting is down");
      },
    });
    work.reject(new Error("provider down"));
    await expect(search.settled).resolves.toBeUndefined();
    expect(r.registry.view(ana, search.id)).toMatchObject({ status: "FAILED", error: { statusCode: 502, message: "provider down" } });
    // ...and the sweep of a search past its limit survives it too.
    const hung = r.registry.start(ana, () => new Promise<string>(() => undefined), {
      ...r.opts,
      onFailed: () => {
        throw new Error("reporting is down");
      },
    });
    r.advance(6 * MIN);
    expect(r.registry.view(ana, hung.id)).toMatchObject({ status: "FAILED", error: LIMIT_ERROR });
  });
});

describe("ExternalSearchRegistry — one search, one bill", () => {
  it("the same key from the same owner while RUNNING joins: same id, same outcome, the work is not started again and no slot is taken", async () => {
    const { registry, opts, advance } = rig();
    const work = deferred<string>();
    const first = registry.start(ana, () => work.promise, { ...opts, key: "q1" });
    expect([first.joined, first.ageMs]).toEqual([false, 0]);
    advance(4_000);
    const second = jest.fn(async () => "never");
    const joined = registry.start(ana, second, { ...opts, key: "q1" });
    expect([joined.id, joined.joined, joined.ageMs]).toEqual([first.id, true, 4_000]);
    expect(registry.size).toBe(1);
    expect(registry.runningOf(ana)).toBe(1);
    work.resolve("one result");
    await joined.settled;
    expect(second).not.toHaveBeenCalled();
    expect(registry.view(ana, joined.id)?.result).toBe("one result");
  });

  it("joining works at the user's limit too (it is not a new search)", () => {
    const { registry, opts } = rig();
    const starts = ["a", "b", "c"].map((key) => registry.start(ana, () => new Promise<string>(() => undefined), { ...opts, key }));
    expect(registry.start(ana, async () => "x", { ...opts, key: "b" }).id).toBe(starts[1]!.id);
    expect(() => registry.start(ana, async () => "x", { ...opts, key: "d" })).toThrow(ExternalSearchRefused);
  });

  it("another key, another owner, no key, a finished search and one past its limit are not joined", async () => {
    const { registry, opts, advance } = rig({ ...LIMITS, maxTotal: 50 });
    const pending = () => new Promise<string>(() => undefined);
    const first = registry.start(ana, pending, { ...opts, key: "q1" });
    expect(registry.start(ana, pending, { ...opts, key: "q2" }).id).not.toBe(first.id);
    expect(registry.start(ben, pending, { ...opts, key: "q1" }).id).not.toBe(first.id);
    expect(registry.start({ userId: "u1", companyId: "c2" }, pending, { ...opts, key: "q1" }).id).not.toBe(first.id);
    // No key = never joined (and never joins).
    const keyless = registry.start(ben, pending, opts);
    expect(registry.start(ben, pending, opts).id).not.toBe(keyless.id);

    const done = registry.start({ userId: "u9", companyId: "c" }, async () => "r", { ...opts, key: "q1" });
    await done.settled;
    const fresh = registry.start({ userId: "u9", companyId: "c" }, async () => "r", { ...opts, key: "q1" });
    expect([fresh.id === done.id, fresh.joined]).toEqual([false, false]);

    advance(6 * MIN);
    const afterLimit = registry.start(ana, pending, { ...opts, key: "q1" });
    expect([afterLimit.id === first.id, afterLimit.joined]).toEqual([false, false]);
  });
});

describe("ExternalSearchRegistry — no timers", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("starting, finishing, expiring and refusing schedule nothing", async () => {
    jest.useFakeTimers();
    const { registry, begin, finished, advance } = rig();
    await finished();
    const hung = begin();
    begin();
    begin();
    expect(() => begin()).toThrow(ExternalSearchRefused);
    advance(30 * MIN);
    registry.view(ana, hung.id);
    expect(jest.getTimerCount()).toBe(0);
  });
});
