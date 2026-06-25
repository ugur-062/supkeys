import { RothernLogo } from "@/components/brand/logo";
import { CheckIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import type { ReactNode } from "react";

const benefits = [
  "Tek hesapla hem al, hem sat",
  "Kapalı zarf teklif — adil rekabet",
  "Yurtiçi ve 98 ülkede ticaret",
  "Koltuk ücreti yok, sınırsız rol",
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
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Sol — koyu marka paneli (animasyonlu) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0A0A0A] p-12 lg:flex">
        {/* grid deseni */}
        <svg
          aria-hidden="true"
          className="absolute inset-0 -z-10 size-full stroke-white/5 [mask-image:radial-gradient(60%_50%_at_50%_30%,white,transparent)]"
        >
          <defs>
            <pattern
              id="auth-panel-grid"
              width={52}
              height={52}
              x="50%"
              patternUnits="userSpaceOnUse"
            >
              <path d="M.5 52V.5H52" fill="none" />
            </pattern>
          </defs>
          <rect
            width="100%"
            height="100%"
            strokeWidth={0}
            fill="url(#auth-panel-grid)"
          />
        </svg>
        {/* yüzen glow */}
        <div
          aria-hidden="true"
          className="rt-float-slow absolute -top-20 left-1/3 -z-10 size-[34rem] rounded-full bg-gradient-to-tr from-emerald-500/10 via-white/5 to-transparent blur-3xl"
        />

        <Link href="/" className="relative -m-1.5 w-fit p-1.5">
          <RothernLogo variant="full" size="md" priority />
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold tracking-tight text-balance text-white">
            Hem al, hem sat —{" "}
            <span className="text-zinc-500">tek platformda.</span>
          </h2>
          <p className="mt-4 text-base/7 text-zinc-400">
            Alım ilanı aç, kapalı zarf teklif topla; ya da fazlanı sat.
            Firmalarla bağlan, ihaleyi yönet, siparişi belgesine kadar takip et.
          </p>
          <ul className="mt-8 space-y-3">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-3 text-zinc-300">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                  <CheckIcon className="size-3.5 text-emerald-400" />
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        {/* uçuşan mini kartlar */}
        <div className="relative flex flex-wrap gap-3">
          <div className="rt-float flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
            <span className="size-2 rounded-full bg-blue-500" />
            <span className="text-sm font-medium text-white">
              Çelik alımı · 3 teklif
            </span>
          </div>
          <div className="rt-float-slow flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-white">
              Sipariş kargolandı
            </span>
          </div>
        </div>
      </div>

      {/* Sağ — form */}
      <div className="flex flex-col items-center justify-center bg-zinc-50 px-4 py-12 sm:py-16">
        <div className="w-full max-w-md">
          {/* mobilde logo (sol panel gizli) */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Link href="/">
              <RothernLogo variant="full" size="md" priority />
            </Link>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-950/5">
            <div className="mb-6 space-y-1 text-center">
              <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
              <p className="text-sm text-slate-500">{subtitle}</p>
            </div>
            {children}
          </div>

          <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>
        </div>
      </div>
    </div>
  );
}
