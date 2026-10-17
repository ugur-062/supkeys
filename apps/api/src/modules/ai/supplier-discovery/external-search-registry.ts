import { randomUUID } from "node:crypto";

/**
 * REGISTRY OF ASYNCHRONOUS WEB SEARCHES (live re-check 2026-10-09, N1).
 *
 * The interactive supplier search does not fit one HTTP request any more: the
 * grounded research needs 70-80 s at daytime and the proxy cuts a request at
 * 100 s. `POST …/external/start` registers the search here and answers at
 * once; the search runs in the background of this process and the client polls
 * `GET …/external/searches/:searchId`.
 *
 * IN MEMORY, ONE PROCESS. The API runs as a single instance today: a restart
 * loses the running searches (the client's next poll gets 404 and offers to
 * search again). A second instance needs a shared store before it is added.
 *
 * BOUNDED, WITHOUT TIMERS. Nothing here schedules anything, so nothing can
 * leak: every rule is applied when the registry is looked at (`start`, `view`)
 * or when a search ends.
 *  - a user runs at most `maxRunningPerUser` searches at a time;
 *  - the registry holds at most `maxTotal` searches: the oldest FINISHED one
 *    makes room for a new search (its client has polled it for seconds - the
 *    retention exists for a reopened window); with only running searches left
 *    the new one is refused;
 *  - a finished search is kept `keepFinishedMs`, then it is forgotten;
 *  - a search older than `maxRunMs` is FAILED, whatever its work is doing: a
 *    hung call never leaves it RUNNING, and a result that arrives after the
 *    limit is dropped (the client was already told FAILED - a terminal state
 *    never changes).
 *
 * A search belongs to the user who started it (user + company): anybody else
 * gets "not found", exactly like an unknown or forgotten id.
 *
 * ONE SEARCH, ONE BILL. A user who starts the search that is already RUNNING
 * for them (same `key` - the same request body) joins it: the same id comes
 * back and nothing new is searched or paid. This is what happens when the
 * answer of the first start got lost on the way, the page was reloaded before
 * the id was stored, or the same request is open in two tabs. A finished
 * search is never joined ("search again" is a new search).
 *
 * A FAILED SEARCH IS TOLD ONCE (round 6 review, R6-5). The outcome is read
 * through a poll that answers 200, so no error filter ever sees it: `onFailed`
 * is called exactly once, at the moment a search becomes FAILED - by its work
 * or by the limit - and the caller reports it from there.
 */

export type ExternalSearchStatus = "RUNNING" | "DONE" | "FAILED";

/** The failure of a search as the client sees it (the error body of the synchronous endpoint). */
export interface ExternalSearchError {
  statusCode: number;
  code?: string;
  message: string;
}

export interface ExternalSearchView<R> {
  status: ExternalSearchStatus;
  /** ISO time the search was registered. */
  startedAt: string;
  /** Only when DONE. */
  result?: R;
  /** Only when FAILED. */
  error?: ExternalSearchError;
}

export interface ExternalSearchOwner {
  userId: string;
  companyId: string;
}

export interface ExternalSearchLimits {
  maxRunningPerUser: number;
  maxTotal: number;
  keepFinishedMs: number;
  maxRunMs: number;
}

/** How a search came to be FAILED (`onFailed`). */
export interface ExternalSearchFailure {
  /** What the client is told. */
  error: ExternalSearchError;
  /** The error the work ended with; absent when the limit failed a search whose work has not ended (or ended well, too late). */
  cause?: unknown;
  /** true: the registry gave the search up at `maxRunMs`, whatever its work did. */
  limit: boolean;
}

/** Why a new search was not registered. */
export type ExternalSearchRefusal = "USER_LIMIT" | "FULL";

export class ExternalSearchRefused extends Error {
  constructor(readonly reason: ExternalSearchRefusal) {
    super(`external search refused: ${reason}`);
  }
}

interface Entry<R> {
  owner: ExternalSearchOwner;
  /** What was asked for; two starts of one user with the same key are one search. */
  key: string | null;
  settled: Promise<void>;
  status: ExternalSearchStatus;
  startedAt: number;
  finishedAt: number | null;
  result?: R;
  error?: ExternalSearchError;
  /** The error the work ended with (kept for the caller of `start`, never sent to a client). */
  failure?: unknown;
  /** What the client is told when the search outlives `maxRunMs`. */
  limitError: ExternalSearchError;
  onFailed?: (failure: ExternalSearchFailure) => void;
}

export interface StartedExternalSearch {
  id: string;
  /** Resolves (never rejects) when the work has ended and its outcome is recorded. */
  settled: Promise<void>;
  /** The error the work ended with; undefined while it runs or when it succeeded. */
  failure: () => unknown;
  /** true: the search was already running for this user and `work` was NOT started again. */
  joined: boolean;
  /** How long the search has been running (0 for a new one). */
  ageMs: number;
}

export class ExternalSearchRegistry<R> {
  private readonly entries = new Map<string, Entry<R>>();

  constructor(
    private readonly limits: ExternalSearchLimits,
    /** Replaceable clock (tests move time instead of waiting). */
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Searches held right now (running + kept results). */
  get size(): number {
    return this.entries.size;
  }

  /** Running searches of one user. */
  runningOf(owner: ExternalSearchOwner): number {
    this.sweep();
    let n = 0;
    for (const e of this.entries.values()) if (e.status === "RUNNING" && sameOwner(e.owner, owner)) n++;
    return n;
  }

  /**
   * Throws `ExternalSearchRefused` when `owner` cannot start one more search.
   * Read-only: `start` applies the same rule again when it registers.
   */
  assertRoom(owner: ExternalSearchOwner): void {
    if (this.runningOf(owner) >= this.limits.maxRunningPerUser) throw new ExternalSearchRefused("USER_LIMIT");
    if (this.entries.size >= this.limits.maxTotal && this.oldestFinished() === null) throw new ExternalSearchRefused("FULL");
  }

  /**
   * Registers a search and starts its work - or joins the user's running
   * search with the same `key`. The check and the registration are one
   * synchronous step (two concurrent requests cannot both take the last slot,
   * nor start the same search twice); `work` itself starts on the next
   * microtask.
   */
  start(
    owner: ExternalSearchOwner,
    work: () => Promise<R>,
    opts: {
      /** The client-facing form of the error `work` ended with. */
      describeError: (err: unknown) => ExternalSearchError;
      limitError: ExternalSearchError;
      /** Identifies WHAT is searched (the request body); omitted = never joined. */
      key?: string;
      /**
       * Called ONCE when the search becomes FAILED (its work failed, or the
       * limit gave it up) - never for a search that ends DONE. For reporting:
       * whatever it throws is ignored and changes nothing.
       */
      onFailed?: (failure: ExternalSearchFailure) => void;
    },
  ): StartedExternalSearch {
    const key = opts.key ?? null;
    if (key !== null) {
      this.sweep();
      for (const [id, e] of this.entries) {
        if (e.status === "RUNNING" && e.key === key && sameOwner(e.owner, owner)) {
          return { id, settled: e.settled, failure: () => e.failure, joined: true, ageMs: this.now() - e.startedAt };
        }
      }
    }
    this.assertRoom(owner);
    if (this.entries.size >= this.limits.maxTotal) {
      const oldest = this.oldestFinished();
      if (oldest) this.entries.delete(oldest);
    }
    const id = randomUUID();
    const entry: Entry<R> = {
      owner: { userId: owner.userId, companyId: owner.companyId },
      key,
      settled: Promise.resolve(),
      status: "RUNNING",
      startedAt: this.now(),
      finishedAt: null,
      limitError: opts.limitError,
      onFailed: opts.onFailed,
    };
    this.entries.set(id, entry);
    entry.settled = Promise.resolve()
      .then(work)
      .then(
        (result) => this.finish(entry, { status: "DONE", result }),
        (err: unknown) => {
          let error: ExternalSearchError;
          try {
            error = opts.describeError(err);
          } catch {
            error = opts.limitError;
          }
          this.finish(entry, { status: "FAILED", error, failure: err });
        },
      );
    return { id, settled: entry.settled, failure: () => entry.failure, joined: false, ageMs: 0 };
  }

  /** The search as its owner sees it; null = unknown, forgotten or somebody else's. */
  view(owner: ExternalSearchOwner, id: string): ExternalSearchView<R> | null {
    this.sweep();
    const e = this.entries.get(id);
    if (!e || !sameOwner(e.owner, owner)) return null;
    return {
      status: e.status,
      startedAt: new Date(e.startedAt).toISOString(),
      ...(e.status === "DONE" ? { result: e.result as R } : {}),
      ...(e.status === "FAILED" && e.error ? { error: e.error } : {}),
    };
  }

  /** Forget one search (its outcome was handed over another way). */
  drop(id: string): void {
    this.entries.delete(id);
  }

  /** Forget everything (shutdown, tests). Work that is still running ends unrecorded. */
  clear(): void {
    this.entries.clear();
  }

  /** Records the outcome - once: a search that is no longer RUNNING keeps what it was told. */
  private finish(
    entry: Entry<R>,
    outcome: { status: "DONE"; result: R } | { status: "FAILED"; error: ExternalSearchError; failure?: unknown },
  ): void {
    if (entry.status !== "RUNNING") return;
    const at = this.now();
    entry.finishedAt = at;
    // The limit holds at every point the search is looked at - also here, when
    // the work ends late and nobody looked in between.
    if (at - entry.startedAt >= this.limits.maxRunMs) {
      entry.status = "FAILED";
      entry.error = entry.limitError;
      if (outcome.status === "FAILED") entry.failure = outcome.failure;
      this.tellFailed(entry, true);
      return;
    }
    entry.status = outcome.status;
    if (outcome.status === "DONE") entry.result = outcome.result;
    else {
      entry.error = outcome.error;
      entry.failure = outcome.failure;
      this.tellFailed(entry, false);
    }
  }

  /** The one `onFailed` call of a search - made where its status becomes FAILED, nowhere else. */
  private tellFailed(entry: Entry<R>, limit: boolean): void {
    if (!entry.onFailed || !entry.error) return;
    try {
      entry.onFailed({
        error: entry.error,
        ...(entry.failure !== undefined ? { cause: entry.failure } : {}),
        limit,
      });
    } catch {
      // Reporting never changes what the client is told.
    }
  }

  /** Fails what outlived its limit, forgets what was kept long enough. */
  private sweep(): void {
    const at = this.now();
    for (const [id, e] of this.entries) {
      if (e.status === "RUNNING" && at - e.startedAt >= this.limits.maxRunMs) {
        e.status = "FAILED";
        e.error = e.limitError;
        // The limit is when it failed, not the moment somebody looked.
        e.finishedAt = e.startedAt + this.limits.maxRunMs;
        this.tellFailed(e, true);
      }
      if (e.finishedAt !== null && at - e.finishedAt >= this.limits.keepFinishedMs) this.entries.delete(id);
    }
  }

  private oldestFinished(): string | null {
    let oldest: { id: string; at: number } | null = null;
    for (const [id, e] of this.entries) {
      if (e.finishedAt === null) continue;
      if (!oldest || e.finishedAt < oldest.at) oldest = { id, at: e.finishedAt };
    }
    return oldest?.id ?? null;
  }
}

function sameOwner(a: ExternalSearchOwner, b: ExternalSearchOwner): boolean {
  return a.userId === b.userId && a.companyId === b.companyId;
}
