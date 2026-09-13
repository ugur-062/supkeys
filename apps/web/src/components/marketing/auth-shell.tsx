import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * UÇUŞAN MİNİ KARTLAR VE NABIZ NOKTALARI KALDIRILDI (2026-09-13, kullanıcı
 * kararı). Altı kart sahte etkinlik basıyordu ("Çelik alımı · 3 teklif",
 * "Sipariş kargolandı") ve ikisi SİSTEMDE OLMAYAN özelliklere atıf yapıyordu
 * ("Bakır satışı · hemen-al" — satış ilanı ve Hemen Al 2026-09-04'te
 * kaldırıldı). "Uydurma sinyal basılmaz" kuralının doğrudan ihlaliydi.
 *
 * Nabız noktaları da gitti: tek işlevi kartların yanında "canlı hareket"
 * hissi vermekti, kartlar olmadan anlamsız leke kalıyordu.
 *
 * KALAN atmosfer bir şey İDDİA ETMEYEN saf görsel: ızgara deseni ve renk
 * bulanıklıkları. Yeniden kart eklenecekse metin GERÇEK bir olguya dayanmalı.
 */

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
