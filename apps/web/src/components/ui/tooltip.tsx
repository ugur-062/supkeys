"use client";

import { cn } from "@/lib/utils";
import { useId, useRef, useState, type ReactNode } from "react";

/**
 * İPUCU — küçük, koyu, 150 ms gecikmeli; hover VE klavye odağında açılır,
 * `aria-describedby` ile okunur. Headless UI'da Tooltip yok; taşıyıcı
 * `inline-flex` sarmalayıcı, yönü `side`. Dokunmatikte odak ile açılır.
 */
export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 150);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };
  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={id}
    >
      {children}
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute left-1/2 z-40 w-max max-w-56 -translate-x-1/2 rounded-md bg-zinc-950 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg transition-opacity motion-reduce:transition-none",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        {label}
      </span>
    </span>
  );
}
