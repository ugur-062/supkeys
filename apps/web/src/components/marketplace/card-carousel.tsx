"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * KART KARUSELİ — başlık + oklar + kaydırmalı kart şeridi.
 *
 * Europages'te ilişkili ürünler oklu bir şeritte duruyor ve şeridin sağ
 * üstünde "Tüm ürünleri görüntüle (35)" bağlantısı var; parmakla kaydırma
 * masaüstünde keşfedilebilir değil, ok görünür bir davet (kullanıcı
 * referansı, 2026-09-07).
 *
 * Kaydırma YİNE NATIVE: `overflow-x-auto` + `scroll-snap`. Oklar yalnız
 * `scrollBy` çağırır — JS yoksa/`prefers-reduced-motion` varsa şerit
 * elle kaydırılmaya devam eder, içerik erişilemez kalmaz.
 *
 * `scroll-pl-*` ŞART: snap noktası scrollLeft=0'da değilse Chrome yüklenişte
 * şeridi kaydırıyor ve o scroll olayı LCP raporunu kesiyordu (2026-09-04'te
 * ölçüldü).
 */
export function CardCarousel({
  heading,
  headingId,
  link,
  children,
}: {
  heading: ReactNode;
  /** Başlık `h2` — sekme içinde kullanılırken `h3`e düşürmek için. */
  headingId?: string;
  /** Sağ üstteki çıkış bağlantısı ("Tüm ürünleri görüntüle (35)"). */
  link?: { href: string; label: string };
  /** `<li>` elemanları. */
  children: ReactNode;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState<{ start: boolean; end: boolean }>({ start: true, end: true });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // 2 px tolerans: alt piksel kaydırmada "son" hiç yakalanmıyordu.
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft >= max - 2 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [measure]);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.9), behavior: "smooth" });
  };

  // Şerit hiç kaydırılamıyorsa (az kart) oklar çizilmez — çalışmayan düğme
  // basmak "bozuk" hissi verir.
  const scrollable = !(edge.start && edge.end);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight text-zinc-950">
          {heading}
        </h2>
        <div className="flex items-center gap-3">
          {link ? (
            <Link
              href={link.href}
              className="text-sm font-semibold text-zinc-900 underline underline-offset-4 hover:text-zinc-600"
            >
              {link.label}
            </Link>
          ) : null}
          {scrollable ? (
            <span className="hidden items-center gap-1.5 sm:flex">
              <ArrowButton dir={-1} disabled={edge.start} onClick={() => scroll(-1)} />
              <ArrowButton dir={1} disabled={edge.end} onClick={() => scroll(1)} />
            </span>
          ) : null}
        </div>
      </div>
      <ul
        ref={ref}
        className="-mx-1 mt-5 flex snap-x scroll-pl-1 gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]"
      >
        {children}
      </ul>
    </section>
  );
}

function ArrowButton({ dir, disabled, onClick }: { dir: 1 | -1; disabled: boolean; onClick: () => void }) {
  const Icon = dir === 1 ? ChevronRightIcon : ChevronLeftIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 1 ? "Sonraki ürünler" : "Önceki ürünler"}
      className="inline-flex size-9 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}
