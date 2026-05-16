"use client";

import { useEffect, useState } from "react";

/**
 * Performans audit P-11 — Tek setInterval, çok subscriber.
 *
 * Tenders liste sayfasında her satır için ayrı `<CountdownTimer>` mount
 * ediliyordu; her biri kendi `setInterval`'ını kuruyordu (20 satır = 20 timer
 * = 20 setState/sn). Bu hook tüm subscriber'ları tek module-level interval'a
 * bağlar → 1 setInterval, N setState/sn (her bucket için).
 *
 * Bucket'lı (1s ve 60s) — saniye-saniye gösteren CountdownFull 1s, geniş
 * countdown'lar 60s'de yenilenir. Subscriber yoksa interval temizlenir.
 */

type Bucket = 1000 | 60_000;

const buckets: Record<Bucket, Set<() => void>> = {
  1000: new Set(),
  60_000: new Set(),
};
const timers: Record<Bucket, ReturnType<typeof setInterval> | null> = {
  1000: null,
  60_000: null,
};

function ensureTimer(bucket: Bucket) {
  if (buckets[bucket].size > 0 && timers[bucket] === null) {
    timers[bucket] = setInterval(() => {
      for (const cb of buckets[bucket]) cb();
    }, bucket);
  } else if (buckets[bucket].size === 0 && timers[bucket] !== null) {
    clearInterval(timers[bucket]);
    timers[bucket] = null;
  }
}

function subscribe(bucket: Bucket, cb: () => void): () => void {
  buckets[bucket].add(cb);
  ensureTimer(bucket);
  return () => {
    buckets[bucket].delete(cb);
    ensureTimer(bucket);
  };
}

/**
 * Belirtilen bucket'ta (1 sn veya 60 sn) güncellenen current timestamp.
 * SSR'da `Date.now()` ile başlar, mount sonrası tick'lerle update olur.
 */
export function useNow(bucket: Bucket = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    return subscribe(bucket, () => setNow(Date.now()));
  }, [bucket]);
  return now;
}
