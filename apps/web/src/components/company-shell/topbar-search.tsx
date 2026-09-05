"use client";

import { useHeroGone } from "@/hooks/use-hero-gone";
import type { PortalKey } from "@/lib/company/portals";
import { cn } from "@/lib/utils";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/**
 * ÜST ÇUBUK ARAMASI — Europages'in her sayfada duran arama kutusunun panel
 * karşılığı (2026-09-05, kullanıcı kararı). Portal duyarlı:
 *   satinalma → ürün arar     (`/company/satinalma/urunler?q=`)
 *   satis     → açık talep arar (`/company/satis?q=` — liste anasayfada)
 *
 * Anasayfalarda büyük kutu (`PanelHeroSearch`, `[data-hero-search]`)
 * görünümdeyken GİZLİ; kaydırınca ve hero'suz her sayfada görünür. Sunucu
 * her zaman gizli basar (hydration farkı olmasın), kararı istemci verir.
 * Böylece "Ürün Ara" ve "Açık Talepler" menü satırları olmadan da her
 * sayfadan tek tıkla aramaya ulaşılır.
 */
export const TOPBAR_SEARCH: Record<PortalKey, { action: string; placeholder: string }> = {
  satinalma: { action: "/company/satinalma/urunler", placeholder: "Ürün ara" },
  satis: { action: "/company/satis", placeholder: "Açık talep ara" },
};

export function TopbarSearch({ portal, className }: { portal: PortalKey; className?: string }) {
  const router = useRouter();
  const heroGone = useHeroGone();
  const [q, setQ] = useState("");
  const cfg = TOPBAR_SEARCH[portal];
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `${cfg.action}?q=${encodeURIComponent(term)}` : cfg.action);
  };
  if (!heroGone) return null;
  return (
    <form
      action={cfg.action}
      method="get"
      role="search"
      onSubmit={onSubmit}
      className={cn("relative hidden md:block", className)}
    >
      <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
      <input
        type="search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={cfg.placeholder}
        placeholder={cfg.placeholder}
        autoComplete="off"
        className="h-9 w-44 rounded-full bg-zinc-50 pr-3 pl-8 text-sm text-zinc-900 ring-1 ring-zinc-200 ring-inset outline-none transition placeholder:text-zinc-400 focus:w-64 focus:bg-white focus:ring-2 focus:ring-zinc-950 lg:w-56"
      />
    </form>
  );
}
