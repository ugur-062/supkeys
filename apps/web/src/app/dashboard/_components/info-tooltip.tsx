"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  content: ReactNode;
  /** İkon boyutu (default sm = 14px) */
  size?: "sm" | "md";
}

/**
 * V2-6 Dashboard — küçük (i) info ikonu + Radix tooltip.
 * Hover/focus'ta açılan açıklama balonu. Genelde KPI başlıklarının yanında kullanılır.
 */
export function InfoTooltip({ content, size = "sm" }: Props) {
  const px = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            className="text-slate-400 hover:text-brand-600 focus:outline-none focus-visible:text-brand-600"
            aria-label="Bilgi"
          >
            <Info className={px} />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="z-50 max-w-xs rounded-lg bg-brand-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-brand-900" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
