"use client";

import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface CountdownFullProps {
  deadline: string;
  className?: string;
  /** Süre dolduğunda gösterilecek metin (varsayılan "Süre doldu"). */
  endedLabel?: string;
}

interface Parts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

function parts(deadline: Date, now: Date): Parts {
  const totalMs = deadline.getTime() - now.getTime();
  if (totalMs <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs };
  }
  const totalSec = Math.floor(totalMs / 1000);
  return {
    days: Math.floor(totalSec / 86_400),
    hours: Math.floor((totalSec % 86_400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
    totalMs,
  };
}

/**
 * Saniye-saniye uzun format ("23 saat 40 dakika 1 saniye"). PratisPro tarzı.
 * Süre dolunca `endedLabel` döner. Son 1 saat kırmızı, son 24 saat amber.
 *
 * Paylaşılan `useNow(1000)` ile module-level tek setInterval — liste içinde
 * çok sayıda instance olsa bile tek timer.
 */
export function CountdownFull({
  deadline,
  className,
  endedLabel = "Süre doldu",
}: CountdownFullProps) {
  const target = useMemo(() => new Date(deadline), [deadline]);
  const now = useNow(1000);
  const p = parts(target, new Date(now));

  if (p.totalMs <= 0) {
    return (
      <span
        role="status"
        className={cn("font-semibold text-danger-600", className)}
      >
        {endedLabel}
      </span>
    );
  }

  const tone =
    p.totalMs < 60 * 60 * 1000
      ? "text-danger-600"
      : p.totalMs < 24 * 60 * 60 * 1000
        ? "text-warning-600"
        : "text-zinc-700";

  const segments: string[] = [];
  if (p.days > 0) segments.push(`${p.days} gün`);
  segments.push(`${p.hours} saat`);
  segments.push(`${p.minutes} dakika`);
  if (p.days === 0) segments.push(`${p.seconds} saniye`);

  return (
    // role="timer" + aria-live kapalı: ekran okuyucu her saniye spam'lemez,
    // odaklanınca/gezinince güncel kalan süreyi okur.
    <span
      role="timer"
      aria-label={`Kalan süre: ${segments.join(" ")}`}
      className={cn("font-semibold tabular-nums", tone, className)}
    >
      {segments.join(" ")}
    </span>
  );
}
