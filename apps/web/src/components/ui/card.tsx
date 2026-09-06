import { cn } from "@/lib/utils";
import { forwardRef, type HTMLAttributes } from "react";

/**
 * KART — herkese açık yüzeyin tek kart çerçevesi (PROMPT 2): mevcut
 * `rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5` dili (12 dosyada
 * elle 19 kez yazılıyordu). `interactive` = 0,5px kalkış + gölge; radius ve
 * ring rol ayırır, kartın içindeki hiçbir blok ikinci bir kart olmaz.
 */
const PADDING = { none: "", sm: "p-3", md: "p-5", lg: "p-6 sm:p-8" } as const;

export const Card = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { padding?: keyof typeof PADDING; interactive?: boolean }
>(function Card({ padding = "md", interactive = false, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5",
        interactive && "transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10 motion-reduce:transform-none",
        PADDING[padding],
        className,
      )}
      {...rest}
    />
  );
});
