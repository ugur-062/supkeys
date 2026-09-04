"use client";

import { useHeroGone } from "@/hooks/use-hero-gone";
import Link from "next/link";

/**
 * Yüzen "Talep aç" — hero görünümden çıkınca belirir (B8). Hero'daki şerit
 * aynı CTA'yı zaten taşıyor; ikisi aynı anda ekrandayken tekrar olurdu.
 * `aria-hidden` + `pointer-events-none` iken sekmeyle de erişilmez.
 */
export function FloatingCta({ href, label = "Talep aç" }: { href: string; label?: string }) {
  const show = useHeroGone();
  return (
    <div
      aria-hidden={!show}
      className={`fixed right-5 bottom-5 z-40 transition duration-300 sm:right-8 sm:bottom-8 ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <Link
        href={href}
        tabIndex={show ? 0 : -1}
        className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-zinc-950/20 transition hover:bg-zinc-800"
      >
        {label}
      </Link>
    </div>
  );
}
