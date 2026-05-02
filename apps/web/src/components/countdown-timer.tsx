"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface CountdownTimerProps {
  /** ISO datetime string */
  deadline: string;
  className?: string;
  /** Süre dolduğunda gösterilecek metin */
  expiredLabel?: string;
}

interface Parts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

function parts(deadline: Date, now: Date = new Date()): Parts {
  const totalMs = deadline.getTime() - now.getTime();
  if (totalMs <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs };
  }
  const totalSec = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { days, hours, minutes, seconds, totalMs };
}

function pickInterval(totalMs: number): number {
  if (totalMs <= 0) return 60_000; // Süre dolmuşsa nadiren güncelle
  if (totalMs < 60 * 60 * 1000) return 1_000; // <1sa: saniye-saniye
  if (totalMs < 24 * 60 * 60 * 1000) return 60_000; // <24sa: dakika
  return 60_000; // >24sa: dakika yeterli
}

function formatParts(p: Parts): string {
  if (p.totalMs <= 0) return "Süresi Doldu";
  if (p.days > 0) return `${p.days} gün ${p.hours} saat`;
  if (p.hours > 0) return `${p.hours} saat ${p.minutes} dk`;
  if (p.minutes > 0) return `${p.minutes} dk ${p.seconds} sn`;
  return `${p.seconds} sn`;
}

export function CountdownTimer({
  deadline,
  className,
  expiredLabel = "Süresi Doldu",
}: CountdownTimerProps) {
  const target = new Date(deadline);
  const [p, setP] = useState<Parts>(() => parts(target));

  useEffect(() => {
    const tick = () => setP(parts(target));
    tick();
    const interval = setInterval(tick, pickInterval(p.totalMs));
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);

  // Renk: <1sa kalan süreler kırmızı, <24sa sarı, daha fazlası nötr
  const tone =
    p.totalMs <= 0
      ? "text-slate-500"
      : p.totalMs < 60 * 60 * 1000
        ? "text-danger-600"
        : p.totalMs < 24 * 60 * 60 * 1000
          ? "text-warning-600"
          : "text-brand-700";

  return (
    <span className={cn("tabular-nums font-semibold", tone, className)}>
      {p.totalMs <= 0 ? expiredLabel : formatParts(p)}
    </span>
  );
}
