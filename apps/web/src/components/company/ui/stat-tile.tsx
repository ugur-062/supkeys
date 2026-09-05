"use client";

import { TrendBadge } from "@/components/dashboard/analytics-primitives";
import { cn } from "@/lib/utils";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Şirketim kartı — ikon rozeti, etiket, büyük sayı, eğilim rozeti, ipucu ve
 * isteğe bağlı alt içerik (mini grafik/avatarlar). `href` verilirse tamamı
 * bağlantı. Europages'in "insight tile" kalıbı: sakin yüzey, tek vurgu.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  deltaPct,
  deltaLabel,
  hint,
  href,
  cta,
  tone = "zinc",
  attention = false,
  children,
  className,
}: {
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: ReactNode;
  deltaPct?: number | null;
  deltaLabel?: string;
  hint?: ReactNode;
  href?: string;
  cta?: string;
  tone?: "zinc" | "blue" | "emerald" | "amber" | "violet";
  attention?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const iconCls = {
    zinc: "bg-zinc-100 text-zinc-600",
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
  }[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {Icon ? (
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", iconCls)}>
              <Icon aria-hidden className="size-4.5" />
            </span>
          ) : null}
          <p className="text-sm font-medium text-zinc-600">{label}</p>
        </div>
        <TrendBadge pct={deltaPct} periodLabel={deltaLabel} />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-zinc-950">{value}</p>
      {hint ? <div className="mt-1 text-xs text-zinc-500">{hint}</div> : null}
      {children ? <div className="mt-3">{children}</div> : null}
      {href && cta ? (
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 group-hover:text-zinc-600">
          {cta}
          <ArrowRightIcon aria-hidden className="size-3.5" />
        </span>
      ) : null}
    </>
  );
  const cls = cn(
    "group relative flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 transition",
    href && "hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10",
    attention && "ring-amber-300",
    className,
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Bölüm başlığı — başlık solda, ipucu altında, çıkış bağlantısı sağda (pano ritmi). */
export function SectionHead({ title, lead, href, cta, id }: { title: string; lead?: string; href?: string; cta?: string; id?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-lg font-semibold tracking-tight text-zinc-950">
          {title}
        </h2>
        {lead ? <p className="mt-1 text-sm text-zinc-500">{lead}</p> : null}
      </div>
      {href && cta ? (
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600">
          {cta}
          <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
