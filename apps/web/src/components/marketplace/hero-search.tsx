"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { useState } from "react";

/**
 * HERO ARAMASI — sekmeli, tek kutu (2026-09-04).
 *
 * Denetim bulgusu: "pano" yazan ziyaretçi Alım Talepleri'ne düşüp "kayıt yok"
 * görüyordu; ürün arayan biri yanlış listeye gidiyordu. Sekme hangi listeye
 * gidileceğini seçer; varsayılan ÜRÜNLER (kalıcı ve en dolu envanter).
 *
 * Düz `<form method="get">` — JavaScript kapalıyken de varsayılan sekmeye
 * (ürünler) arama yapar; sekme yalnız `action`ı değiştirir. Ayrı bir `/ara`
 * sayfası açılmadı: dört türde birden arayan bir sonuç sayfası, dört listeyi
 * tekrar üretmek demekti.
 */
export interface HeroSearchTab {
  key: string;
  label: string;
  action: string;
  placeholder: string;
}

export function HeroSearch({ tabs }: { tabs: HeroSearchTab[] }) {
  const [active, setActive] = useState(tabs[0]);
  return (
    <div className="w-full">
      <div
        role="tablist"
        aria-label="Nerede aransın"
        className="mx-auto mb-3 flex w-fit max-w-full flex-wrap justify-center gap-1 rounded-full bg-zinc-100 p-1"
      >
        {tabs.map((t) => {
          const on = t.key === active.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                on ? "bg-zinc-950 text-white shadow-sm" : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <form action={active.action} method="get" role="search" className="w-full">
        <div className="flex items-stretch gap-2">
          <div className="relative flex flex-1 items-center rounded-full bg-white shadow-lg shadow-zinc-950/5 ring-1 ring-zinc-950/10 ring-inset transition focus-within:ring-2 focus-within:ring-zinc-950">
            <MagnifyingGlassIcon
              aria-hidden
              className="pointer-events-none absolute left-4 size-5 text-zinc-400"
            />
            <input
              key={active.key}
              type="search"
              name="q"
              placeholder={active.placeholder}
              aria-label={`${active.label} içinde ara`}
              className="h-14 w-full rounded-full bg-transparent pr-4 pl-11 text-base text-zinc-950 outline-none placeholder:text-zinc-400"
            />
          </div>
          <button
            type="submit"
            className="h-14 shrink-0 rounded-full bg-zinc-950 px-7 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
          >
            Ara
          </button>
        </div>
      </form>
    </div>
  );
}
