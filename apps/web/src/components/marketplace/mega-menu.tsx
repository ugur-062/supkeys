"use client";

import { categoryPath } from "@/lib/public/marketplace";
import type { CategoryMenuNode } from "@/lib/public/marketplace-api";
import { categoryVisual } from "@/lib/public/category-visual";
import { fetchCategoryMenu } from "@/lib/public/suggest-client";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * KATEGORİ MEGA MENÜSÜ (PROMPT 6) — üst çubuktaki "Kategoriler ▾".
 *
 * Sol sütun 58 segment (ikon + ad + ürün sayısı), sağda seçili segmentin
 * L2 aileleri 3 sütun ve altta "Tüm {segment} ürünleri →". Ürünü olmayan dal
 * da listelenir (katalog gerçek ve gezilebilir), sayı yalnız > 0 ise basılır.
 *
 * Ağaç İSTEMCİDE, ilk açılışta (ya da düğmeye hover'da) bir kez çekilir ve
 * modülde önbelleklenir: kabuk her herkese açık sayfada çiziliyor, ağacı
 * sunucuda beklemek hepsini bir tur yavaşlatırdı.
 *
 * Klavye: düğme Enter/Space ile açar, Esc kapatır ve odağı düğmeye geri
 * verir, Tab paneli gezer, panel dışına çıkınca kapanır. `aria-expanded`
 * düğmede, panel `aria-hidden` DEĞİL — kapalıyken hiç çizilmez.
 */
export function MegaMenu({ label = "Kategoriler" }: { label?: string } = {}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CategoryMenuNode[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Panel TIKLAMAYLA açıldıysa fare çıkınca kapanmaz; ikinci tık kapatır.
      (Hover açıp tıklamanın kapatması "düğme çalışmıyor" hissi veriyordu.) */
  const pinned = useRef(false);

  const load = useCallback(() => {
    if (items.length > 0) return;
    void fetchCategoryMenu().then((rows) => {
      setItems(rows);
      setActiveId((a) => a ?? rows[0]?.id ?? null);
    });
  }, [items.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) {
        pinned.current = false;
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pinned.current = false;
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = items.find((i) => i.id === activeId) ?? items[0] ?? null;
  // Alt kategorisi olmayan dalda: en çok ürünlü 12 segment (prompt kuralı) —
  // panel boş kalmasın, ziyaretçi başka bir dala geçebilsin.
  const fallback = items.filter((i) => i.count > 0).slice(0, 12);
  const cells = active && active.children.length > 0 ? active.children : fallback;

  const hoverOpen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    load();
    setOpen(true);
  };
  const hoverClose = () => {
    if (pinned.current) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div
      ref={wrap}
      className="relative"
      onMouseEnter={hoverOpen}
      onMouseLeave={hoverClose}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          pinned.current = false;
          setOpen(false);
        }
      }}
    >
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onFocus={load}
        onClick={() => {
          load();
          // Hover paneli zaten açmış olabilir: tık onu KAPATMAZ, sabitler.
          if (open && pinned.current) {
            pinned.current = false;
            setOpen(false);
          } else {
            pinned.current = true;
            setOpen(true);
          }
        }}
        className={cn(
          "inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold whitespace-nowrap text-zinc-900 transition hover:bg-zinc-100",
          open && "bg-zinc-100",
        )}
      >
        {label}
        <ChevronDownIcon aria-hidden className={cn("size-4 transition", open && "rotate-180")} />
      </button>

      {open && items.length > 0 ? (
        <div className="absolute top-full left-0 z-40 mt-1 w-[min(64rem,calc(100vw-2rem))] overflow-hidden rounded-lg bg-white shadow-pop ring-1 ring-zinc-950/10">
          <div className="grid grid-cols-[15rem_1fr]">
            <ul className="max-h-[26rem] overflow-y-auto border-r border-zinc-950/5 py-2">
              {items.map((seg) => {
                const { icon: Icon } = categoryVisual([seg.id]);
                const on = seg.id === active?.id;
                return (
                  <li key={seg.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveId(seg.id)}
                      onFocus={() => setActiveId(seg.id)}
                      onClick={() => {
                        pinned.current = true;
                        setActiveId(seg.id);
                      }}
                      aria-current={on ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition",
                        on ? "bg-zinc-100 font-semibold text-zinc-950" : "text-zinc-700 hover:bg-zinc-50",
                      )}
                    >
                      <Icon aria-hidden strokeWidth={1.5} className="size-4 shrink-0 text-zinc-400" />
                      <span className="min-w-0 flex-1 truncate">{seg.name}</span>
                      {seg.count > 0 ? <span className="tnum text-xs text-zinc-400">{seg.count}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="min-w-0 p-5">
              <ul className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-3">
                {cells.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={categoryPath(c.id, c.name)}
                      onClick={() => {
                        pinned.current = false;
                        setOpen(false);
                      }}
                      className="flex items-baseline gap-1.5 rounded px-1 py-1 text-sm text-zinc-700 hover:text-zinc-950 hover:underline"
                    >
                      <span className="min-w-0 truncate">{c.name}</span>
                      {c.count > 0 ? <span className="tnum shrink-0 text-xs text-zinc-400">{c.count}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
              {active ? (
                <Link
                  href={categoryPath(active.id, active.name)}
                  onClick={() => {
                    pinned.current = false;
                    setOpen(false);
                  }}
                  className="mt-4 inline-flex items-center gap-1 border-t border-zinc-950/5 pt-3 text-sm font-semibold text-zinc-950 hover:text-zinc-600"
                >
                  Tüm {active.name} ürünleri →
                </Link>
              ) : null}

              {/* Ariba kataloğunda bazı segmentlerin yalnız 3-4 ailesi var;
                  panelin sağı boş kalmasın diye ürünü OLAN dallar altta. */}
              {cells.length < 6 && fallback.length > 0 ? (
                <div className="mt-5 border-t border-zinc-950/5 pt-3">
                  <p className="mb-2 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
                    Ürünü olan dallar
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {fallback
                      .filter((f) => f.id !== active?.id)
                      .slice(0, 8)
                      .map((f) => (
                        <Link
                          key={f.id}
                          href={categoryPath(f.id, f.name)}
                          onClick={() => {
                            pinned.current = false;
                            setOpen(false);
                          }}
                          className="inline-flex max-w-[16rem] items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-950 hover:text-white"
                        >
                          <span className="truncate">{f.name}</span>
                          <span className="tnum opacity-60">{f.count}</span>
                        </Link>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
