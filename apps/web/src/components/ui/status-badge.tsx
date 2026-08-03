"use client";

import { cn } from "@/lib/utils";

/**
 * P1 (frontend denetimi §8.4) — rozet disiplini, iki ayrı primitive:
 *
 *  - <StatusBadge tone>: DURUM iletişimi. Dolgulu, solda 6px nokta,
 *    rounded-full; renk YALNIZ durumdan gelir (pending→amber, active→info,
 *    done→success, failed→danger, neutral→gri).
 *  - <MetaTag>: TİP/nitelik etiketi ("Alış", "Yurtiçi", "Teklif Toplama") —
 *    RENKSİZ. Durum olmayan hiçbir şey renkli rozet giymez.
 *
 * Kota (kart başına 1 StatusBadge + 3 MetaTag) çağıran tarafın kuralıdır.
 */
export type StatusTone =
  | "pending"
  | "active"
  | "done"
  | "failed"
  | "neutral";

const TONE: Record<StatusTone, { badge: string; dot: string }> = {
  pending: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  active: { badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  done: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  failed: { badge: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
  neutral: { badge: "bg-zinc-100 text-zinc-600 border-zinc-200", dot: "bg-zinc-400" },
};

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        t.badge,
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", t.dot)} aria-hidden />
      {children}
    </span>
  );
}

export function MetaTag({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-lg bg-white px-2 py-0.5 text-xs font-medium text-zinc-500 ring-1 ring-zinc-950/10",
        className,
      )}
    >
      {children}
    </span>
  );
}
