import { cn } from "@/lib/utils";

/** İskelet blok — `animate-pulse` (reduced-motion küresel kuralla durur). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded bg-zinc-100", className)} />;
}

/** N satır metin iskeleti; son satır kısa. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** Ürün kartı oranında iskelet (4:3 görsel + 2 satır + fiyat + düğme) — CLS yok. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex h-full flex-col rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-950/5", className)}>
      <Skeleton className="aspect-[4/3] w-full rounded-xl" />
      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="mt-4 h-6 w-2/5" />
      <Skeleton className="mt-auto h-9 w-full rounded-full pt-3" />
    </div>
  );
}
