"use client";

import { accentFillClass, useButtonAccent } from "@/components/ui/button-accent";
import { cn } from "@/lib/utils";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * CTA ŞERİDİ — Europages "Request a quote" bandı, Rothern dilinde. `tone`:
 * `secondary` = sayfada başka bir primary CTA varken (satınalmada sol menüdeki
 * "Satın Alma Talebi Aç" — sayfa başına TEK primary kuralı); `primary` =
 * sayfanın tek primary'si (satış portalında sol menüde CTA yok).
 *
 * PORTAL RENGİ (2026-09-18, kullanıcı: "yeşil yap ve daha iyi hale getir"):
 * gri zemin + siyah düğme yerine portal tonunda yumuşak zemin (satış
 * emerald, satınalma mavi), ikon beyaz yuvarlakta portal renginde, düğme
 * `ButtonAccent` dolgusu. Herkese açık tedarikçi anasayfasındaki aynı
 * şeritle (`home-supplier.tsx`) aynı dil.
 */
export function CtaBand({
  icon,
  title,
  body,
  cta,
  tone = "secondary",
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  cta: { label: string; href: string };
  tone?: "primary" | "secondary";
}) {
  const accent = useButtonAccent();
  const soft =
    accent === "emerald"
      ? { band: "bg-emerald-50 ring-emerald-600/10", icon: "text-emerald-700 ring-emerald-600/15", link: "border-emerald-700/30 text-emerald-800 hover:bg-emerald-100" }
      : accent === "blue"
        ? { band: "bg-blue-50 ring-blue-600/10", icon: "text-blue-700 ring-blue-600/15", link: "border-blue-700/30 text-blue-800 hover:bg-blue-100" }
        : { band: "bg-zinc-50 ring-zinc-950/5", icon: "text-zinc-800 ring-zinc-950/10", link: "border-zinc-300 text-zinc-900 hover:bg-zinc-100" };
  return (
    <section
      aria-label={title}
      className={cn(
        "flex flex-col gap-4 rounded-2xl p-5 ring-1 sm:flex-row sm:items-center sm:justify-between sm:p-6",
        soft.band,
      )}
    >
      <div className="flex min-w-0 items-start gap-4">
        {icon ? (
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1", soft.icon)}>
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
          <p className="mt-0.5 text-sm/6 text-zinc-600">{body}</p>
        </div>
      </div>
      <Link
        href={cta.href}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold transition",
          tone === "primary" ? cn("text-white shadow-sm", accentFillClass(accent)) : cn("border bg-white", soft.link),
        )}
      >
        {cta.label}
        <ArrowRightIcon aria-hidden className="size-4" />
      </Link>
    </section>
  );
}
