"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface CountdownFullProps {
  deadline: string;
  className?: string;
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
 * Süre dolduğunda "Süre doldu" metnini döner.
 */
export function CountdownFull({ deadline, className }: CountdownFullProps) {
  const [p, setP] = useState<Parts>(() => parts(new Date(deadline)));

  useEffect(() => {
    const target = new Date(deadline);
    const tick = () => setP(parts(target));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (p.totalMs <= 0) {
    return (
      <span className={cn("text-warning-700 font-semibold", className)}>
        Süre doldu
      </span>
    );
  }

  const tone =
    p.totalMs < 60 * 60 * 1000
      ? "text-danger-700"
      : p.totalMs < 24 * 60 * 60 * 1000
        ? "text-warning-700"
        : "text-brand-700";

  const segments: string[] = [];
  if (p.days > 0) segments.push(`${p.days} gün`);
  segments.push(`${p.hours} saat`);
  segments.push(`${p.minutes} dakika`);
  if (p.days === 0) segments.push(`${p.seconds} saniye`);

  return (
    <span className={cn("font-semibold tabular-nums", tone, className)}>
      {segments.join(" ")}
    </span>
  );
}

/**
 * Live status pill — "Teklife Açık" (yeşil pulse) / "Kazandırma Aşamasında" (mor) vb.
 */
export function TenderLiveStatusPill({
  status,
  className,
}: {
  status:
    | "DRAFT"
    | "OPEN_FOR_BIDS"
    | "IN_AWARD"
    | "AWARDED"
    | "CLOSED_NO_AWARD"
    | "CANCELLED";
  className?: string;
}) {
  const config = {
    DRAFT: {
      label: "Taslak",
      bg: "bg-slate-100 text-slate-700 border-slate-200",
      dot: "bg-slate-400",
      pulse: false,
    },
    OPEN_FOR_BIDS: {
      label: "Teklife Açık",
      bg: "bg-success-50 text-success-700 border-success-200",
      dot: "bg-success-500",
      pulse: true,
    },
    IN_AWARD: {
      label: "Kazandırma Aşamasında",
      bg: "bg-purple-50 text-purple-700 border-purple-200",
      dot: "bg-purple-500",
      pulse: false,
    },
    AWARDED: {
      label: "Sonuçlandı",
      bg: "bg-brand-50 text-brand-700 border-brand-200",
      dot: "bg-brand-500",
      pulse: false,
    },
    CLOSED_NO_AWARD: {
      label: "Kapatıldı (Kazanan Yok)",
      bg: "bg-slate-100 text-slate-600 border-slate-200",
      dot: "bg-slate-400",
      pulse: false,
    },
    CANCELLED: {
      label: "İptal Edildi",
      bg: "bg-danger-50 text-danger-700 border-danger-200",
      dot: "bg-danger-500",
      pulse: false,
    },
  }[status];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap",
        config.bg,
        className,
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          config.dot,
          config.pulse && "animate-pulse",
        )}
      />
      {config.label}
    </div>
  );
}
