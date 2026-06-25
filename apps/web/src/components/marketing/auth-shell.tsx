import Image from "next/image";
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
      className={`absolute hidden max-w-[12rem] items-center gap-2 rounded-xl border border-zinc-950/5 bg-white px-3.5 py-2.5 shadow-lg ring-1 ring-zinc-950/5 lg:flex ${float} ${className}`}
    >
      {dot ? <span className={`size-2 shrink-0 rounded-full ${dot}`} /> : null}
      <span className="truncate text-sm font-medium text-zinc-800">{text}</span>
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
  "top-[26%] left-[24%] bg-emerald-500",
  "top-[70%] left-[30%] bg-blue-500",
  "top-[20%] right-[26%] bg-blue-500",
  "top-[66%] right-[22%] bg-emerald-500",
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-50 px-4 py-6">
      {/* grid deseni */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 -z-10 size-full stroke-zinc-200 [mask-image:radial-gradient(75%_70%_at_50%_40%,white,transparent)]"
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
      {/* yumuşak renkli gradient'ler */}
      <div
        aria-hidden="true"
        className="rt-float-slow absolute -top-24 left-1/4 -z-10 size-[34rem] rounded-full bg-emerald-400/15 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="rt-float absolute top-1/3 right-1/4 -z-10 size-[30rem] rounded-full bg-blue-400/15 blur-[110px]"
      />
      <div
        aria-hidden="true"
        className="rt-float-slow absolute bottom-0 left-1/3 -z-10 size-[28rem] rounded-full bg-violet-400/10 blur-[100px]"
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
        <div className="mb-5 flex justify-center">
          <Link href="/" className="-m-1.5 p-1.5">
            <span className="sr-only">Rothern</span>
            <Image
              src="/rothern-logo-trans.png"
              alt="Rothern"
              width={205}
              height={60}
              priority
              unoptimized
              className="h-[46px] w-auto"
            />
          </Link>
        </div>

        <div className="rounded-3xl bg-white p-7 shadow-xl ring-1 ring-zinc-950/5">
          <div className="mb-5 space-y-1 text-center">
            <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
          {children}
        </div>

        <div className="mt-6 text-center text-sm text-zinc-500">{footer}</div>
      </div>
    </div>
  );
}
