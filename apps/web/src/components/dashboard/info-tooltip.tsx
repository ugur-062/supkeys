"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  content: ReactNode;
  /** İkon boyutu (default sm = 14px) */
  size?: "sm" | "md";
}

/**
 * V2-6 Dashboard — küçük (i) info ikonu + tooltip.
 * Hover/focus'ta açılan açıklama balonu (saf CSS, Radix'siz). Genelde KPI
 * başlıklarının yanında kullanılır.
 */
export function InfoTooltip({ content, size = "sm" }: Props) {
  const px = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="text-zinc-400 hover:text-zinc-700 focus:outline-none focus-visible:text-zinc-700"
        aria-label="Bilgi"
      >
        <Info className={px} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-xs -translate-x-1/2 rounded-lg bg-zinc-900 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
