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
      className={`absolute hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur xl:flex ${float} ${className}`}
    >
      {dot ? <span className={`size-2 shrink-0 rounded-full ${dot}`} /> : null}
      <span className="text-sm font-medium whitespace-nowrap text-white">
        {text}
      </span>
    </div>
  );
}

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0A0A0A] px-4 py-10">
      {/* grid deseni */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 -z-10 size-full stroke-white/5 [mask-image:radial-gradient(60%_55%_at_50%_45%,white,transparent)]"
      >
        <defs>
          <pattern
            id="auth-grid"
            width={52}
            height={52}
            x="50%"
            patternUnits="userSpaceOnUse"
          >
            <path d="M.5 52V.5H52" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" strokeWidth={0} fill="url(#auth-grid)" />
      </svg>
      {/* yüzen glow'lar */}
      <div
        aria-hidden="true"
        className="rt-float-slow absolute -top-32 left-1/2 -z-10 size-[40rem] -translate-x-1/2 rounded-full bg-gradient-to-tr from-emerald-500/15 via-white/5 to-transparent blur-3xl"
      />
      <div
        aria-hidden="true"
        className="rt-float absolute -bottom-40 left-1/3 -z-10 size-[34rem] rounded-full bg-gradient-to-tr from-blue-500/10 to-transparent blur-3xl"
      />

      {/* uçuşan mini kartlar (geniş ekran) */}
      <Mini
        className="top-[18%] left-[9%]"
        float="rt-float"
        dot="bg-blue-500"
        text="Çelik alımı · 3 teklif"
      />
      <Mini
        className="bottom-[18%] left-[12%]"
        float="rt-float-slow"
        dot="bg-emerald-500"
        text="Sipariş kargolandı"
      />
      <Mini
        className="top-[20%] right-[9%]"
        float="rt-float-slow"
        text="🌍 98 ülke · sınır ötesi"
      />
      <Mini
        className="right-[12%] bottom-[20%]"
        float="rt-float"
        text="Yeni bağlantı · kabul"
      />

      {/* ortadaki kart */}
      <div className="relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center gap-4">
          <Link href="/" className="-m-1.5 p-1.5">
            <span className="sr-only">Rothern</span>
            <RothernLogo variant="full" size="lg" priority />
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
