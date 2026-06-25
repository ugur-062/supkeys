import { RothernLogo } from "@/components/brand/logo";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import type { ReactNode } from "react";

function Mini({
  className,
  dot,
  text,
  float = "rt-float",
}: {
  className: string;
  dot?: string;
  text: string;
  float?: string;
}) {
  return (
    <div
      className={`absolute hidden max-w-[12rem] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 shadow-xl backdrop-blur lg:flex ${float} ${className}`}
    >
      {dot ? <span className={`size-2 shrink-0 rounded-full ${dot}`} /> : null}
      <span className="truncate text-sm font-medium text-white">{text}</span>
    </div>
  );
}

const cards = [
  { c: "top-[13%] left-[3%]", f: "rt-float", dot: "bg-blue-500", t: "Çelik alımı · 3 teklif" },
  { c: "top-[43%] left-[6%]", f: "rt-float-slow", t: "🌍 98 ülke · sınır ötesi" },
  { c: "bottom-[13%] left-[4%]", f: "rt-float-slow", dot: "bg-emerald-500", t: "Bakır satışı · hemen-al" },
  { c: "top-[15%] right-[3%]", f: "rt-float-slow", dot: "bg-emerald-500", t: "Sipariş kargolandı" },
  { c: "top-[45%] right-[6%]", f: "rt-float", dot: "bg-blue-500", t: "Kapalı zarf · gizli teklif" },
  { c: "right-[4%] bottom-[15%]", f: "rt-float", t: "Yeni bağlantı · kabul" },
];

const pulses = [
  "top-[26%] left-[24%] bg-emerald-400",
  "top-[70%] left-[30%] bg-blue-400",
  "top-[20%] right-[26%] bg-blue-400",
  "top-[66%] right-[22%] bg-emerald-400",
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-zinc-900 via-[#0b0b0f] to-zinc-900 px-4 py-10">
      {/* grid deseni */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 -z-10 size-full stroke-white/[0.06]"
      >
        <defs>
          <pattern
            id="auth-grid"
            width={48}
            height={48}
            x="50%"
            patternUnits="userSpaceOnUse"
          >
            <path d="M.5 48V.5H48" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" strokeWidth={0} fill="url(#auth-grid)" />
      </svg>
      {/* ışık havuzları */}
      <div
        aria-hidden="true"
        className="rt-float-slow absolute top-1/2 left-1/2 -z-10 size-[48rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/12 blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="rt-float absolute top-1/3 left-1/3 -z-10 size-[34rem] rounded-full bg-blue-500/12 blur-[110px]"
      />
      <div
        aria-hidden="true"
        className="rt-float-slow absolute right-1/4 bottom-1/4 -z-10 size-[30rem] rounded-full bg-violet-500/8 blur-[100px]"
      />

      {/* nabız noktaları */}
      {pulses.map((p) => (
        <span
          key={p}
          aria-hidden="true"
          className={`absolute hidden size-1.5 animate-pulse rounded-full lg:block ${p}`}
        />
      ))}

      {/* uçuşan mini kartlar */}
      {cards.map((m) => (
        <Mini key={m.c} className={m.c} float={m.f} dot={m.dot} text={m.t} />
      ))}

      {/* ortadaki kart */}
      <div className="relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center gap-4">
          <Link href="/" className="-m-1.5 p-1.5">
            <span className="sr-only">Rothern</span>
            <RothernLogo variant="full-white" size="lg" priority />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 transition hover:text-zinc-300"
          >
            <ArrowLeftIcon className="size-3.5" />
            Anasayfaya dön
          </Link>
        </div>

        <div className="rounded-3xl bg-white p-8 shadow-2xl ring-1 ring-white/10">
          <div className="mb-6 space-y-1 text-center">
            <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
          {children}
        </div>

        <div className="mt-6 text-center text-sm text-zinc-400">{footer}</div>
      </div>
    </div>
  );
}
