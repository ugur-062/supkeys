import type { ThrottlerStorage } from "@nestjs/throttler";

/**
 * In-memory rate-limit storage with one independent counter per key
 * (arayuz testi 2026-10 code-auth-2).
 *
 * WHY NOT THE LIBRARY ONE: `@nestjs/throttler` 6.5 `ThrottlerStorageService`
 * keeps one `setTimeout` per counted hit and files every timer under the
 * THROTTLER NAME. When any key's block ends it calls
 * `clearExpirationTimes(throttlerName)`, which cancels the pending expiry
 * timers of EVERY key under that name. Those other clients' hits then never
 * expire: a client that never went over its limit gets 429 as soon as its
 * stale hits plus the new ones exceed it (measured on resend-email-code:
 * 2 requests, 68 s pause, 2 requests -> the 4th is 429 with limit 3 per 60 s).
 *
 * SEMANTICS (same as the library for a single key):
 *  - a hit is counted unless the key is blocked; it expires `ttl` after it
 *    was made (sliding window);
 *  - a key is blocked for `blockDuration` when its counted hits exceed `limit`;
 *  - when the block is over the key starts from a clean counter (the request
 *    that finds the block over is hit number 1);
 *  - `timeToExpire` is the library's fixed window marker (X-RateLimit-Reset).
 *
 * DIFFERENCES: nothing a key does can touch another key; no timer is created
 * at all (each hit is an expiry timestamp, dropped lazily on the key's next
 * request); idle keys are swept, so the map does not grow without bound (the
 * library never removes a key). `timeToBlockExpire` is 0 while the key is not
 * blocked (the library returns a stale negative number; the guard reads it
 * only for blocked keys).
 *
 * State is per API instance, like the library storage it replaces.
 */

/** What the guard reads back (the package index does not export the type). */
export type ThrottlerHitRecord = Awaited<ReturnType<ThrottlerStorage["increment"]>>;

interface Bucket {
  /** Expiry time (ms) of every hit that still counts, oldest first. */
  hits: number[];
  /** Fixed window marker behind `timeToExpire`. */
  windowEndsAt: number;
  blocked: boolean;
  blockExpiresAt: number;
}

/** Idle buckets are removed at most this often (piggybacked on a request). */
export const THROTTLER_SWEEP_INTERVAL_MS = 60_000;

/**
 * Wall clock stepped back by more than this -> stored expiry times are in a
 * future that no longer exists and would keep hits/blocks alive for the size
 * of the step. Counters restart instead (fail-open, like a process restart).
 */
export const THROTTLER_CLOCK_STEP_TOLERANCE_MS = 5_000;

/** The same key under two throttler names never shares a counter. */
function bucketId(key: string, throttlerName: string): string {
  return `${throttlerName}\u0000${key}`;
}

function dropExpired(hits: number[], now: number): void {
  let expired = 0;
  while (expired < hits.length && hits[expired] <= now) expired++;
  if (expired > 0) hits.splice(0, expired);
}

/** Append in the common case; keeps the order if a later call uses a shorter ttl. */
function addHit(hits: number[], expiresAt: number): void {
  let at = hits.length;
  while (at > 0 && hits[at - 1] > expiresAt) at--;
  if (at === hits.length) hits.push(expiresAt);
  else hits.splice(at, 0, expiresAt);
}

/** True when the next request would see exactly what a brand-new key sees. */
function isIdle(bucket: Bucket, now: number): boolean {
  if (bucket.windowEndsAt > now) return false;
  if (bucket.blocked) return bucket.blockExpiresAt <= now;
  return bucket.hits.length === 0 || bucket.hits[bucket.hits.length - 1] <= now;
}

export class PerKeyThrottlerStorage implements ThrottlerStorage {
  private readonly buckets = new Map<string, Bucket>();
  private lastSeenAt = Number.NEGATIVE_INFINITY;
  private lastSweepAt = Number.NEGATIVE_INFINITY;

  /** Number of keys currently held (tests, diagnostics). */
  get size(): number {
    return this.buckets.size;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerHitRecord> {
    const now = Date.now();
    this.observeClock(now);

    const id = bucketId(key, throttlerName);
    let bucket = this.buckets.get(id);
    if (!bucket) {
      bucket = { hits: [], windowEndsAt: now + ttl, blocked: false, blockExpiresAt: 0 };
      this.buckets.set(id, bucket);
    } else if (bucket.windowEndsAt <= now) {
      bucket.windowEndsAt = now + ttl;
    }

    dropExpired(bucket.hits, now);
    if (bucket.blocked && bucket.blockExpiresAt <= now) {
      // Block is over: THIS key starts fresh. Nothing else is touched.
      bucket.blocked = false;
      bucket.hits.length = 0;
    }
    if (!bucket.blocked) {
      addHit(bucket.hits, now + ttl);
      if (bucket.hits.length > limit) {
        bucket.blocked = true;
        bucket.blockExpiresAt = now + blockDuration;
      }
    }

    return {
      totalHits: bucket.hits.length,
      timeToExpire: Math.ceil((bucket.windowEndsAt - now) / 1000),
      isBlocked: bucket.blocked,
      timeToBlockExpire: bucket.blocked ? Math.ceil((bucket.blockExpiresAt - now) / 1000) : 0,
    };
  }

  /** Removes every idle key; returns how many were removed. */
  sweep(now: number = Date.now()): number {
    let removed = 0;
    for (const [id, bucket] of this.buckets) {
      if (isIdle(bucket, now)) {
        this.buckets.delete(id);
        removed++;
      }
    }
    return removed;
  }

  private observeClock(now: number): void {
    if (now < this.lastSeenAt - THROTTLER_CLOCK_STEP_TOLERANCE_MS) {
      this.buckets.clear();
      this.lastSweepAt = now;
    }
    this.lastSeenAt = now;
    if (now - this.lastSweepAt >= THROTTLER_SWEEP_INTERVAL_MS) {
      this.lastSweepAt = now;
      this.sweep(now);
    }
  }
}
