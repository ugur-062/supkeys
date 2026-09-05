import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * CTA ŞERİDİ — Europages "Request a quote" bandı, Rothern dilinde. `tone`:
 * `secondary` = sayfada başka bir primary CTA varken (satınalmada sol menüdeki
 * "Satın Alma Talebi Aç" — sayfa başına TEK primary kuralı); `primary` =
 * sayfanın tek primary'si (satış portalında sol menüde CTA yok).
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
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 rounded-2xl bg-zinc-50 p-5 ring-1 ring-zinc-950/5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-800 ring-1 ring-zinc-950/10">
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
        className={
          tone === "primary"
            ? "inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            : "inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-950 hover:text-white"
        }
      >
        {cta.label}
        <ArrowRightIcon aria-hidden className="size-4" />
      </Link>
    </section>
  );
}
