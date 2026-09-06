import { cn } from "@/lib/utils";
import { BadgeCheck, Crown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * ROZET — pazar yeri sözlüğü (PROMPT 2, 2026-09-06). Ton anlam taşır, renk
 * değil: verified = Doğrulanmış (yeşil, TEK yerde tanımlı — dağınık 7
 * satır-içi CheckBadgeIcon kopyasının yerine), gold = Gold Üye (amber),
 * new = Yeni (monokrom koyu), neutral, danger. Palet monokrom kalır;
 * `catalyst/badge` (renk adıyla) panel durum rozetleri için yaşamaya devam eder.
 */
export type BadgeTone = "verified" | "gold" | "new" | "neutral" | "danger";

const TONE: Record<BadgeTone, string> = {
  verified: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  gold: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-500/30",
  new: "bg-zinc-950 text-white",
  neutral: "bg-zinc-100 text-zinc-700",
  danger: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20",
};

const SIZE = {
  sm: "h-5 px-1.5 text-[11px] gap-1 [&>svg]:size-3",
  md: "h-6 px-2 text-xs gap-1 [&>svg]:size-3.5",
} as const;

const ICON: Partial<Record<BadgeTone, typeof BadgeCheck>> = { verified: BadgeCheck, gold: Crown };

export function Badge({
  tone = "neutral",
  size = "md",
  icon = true,
  className,
  children,
  ...rest
}: {
  tone?: BadgeTone;
  size?: keyof typeof SIZE;
  /** verified → BadgeCheck, gold → Crown; `false` ile ikonsuz. */
  icon?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "children">) {
  const Icon = icon ? ICON[tone] : undefined;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-semibold whitespace-nowrap",
        TONE[tone],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon aria-hidden /> : null}
      {children}
    </span>
  );
}
