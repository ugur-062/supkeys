"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * YATAY KAYAN SEKME SATIRI (mobil denetim g02-06) — arama sonucu sekmeleri
 * sayaçlarla birlikte 360 px'e sığmıyordu: "Alım Talepleri 1" ikinci satıra
 * düşüyor, etkin çizgi ilk satırda kalıyor, alt çizgi ikinci satırın altından
 * geçiyordu. Satır tek kalır ve sığmazsa yatay kayar:
 *  · etkin sekme (`aria-current="page"`) açılışta görünür alana kaydırılır
 *    (yalnız bu satır kayar — sayfa dikeyde oynamaz);
 *  · kaydırılabilen kenar yumuşakça solar — devamı olduğu görünsün.
 * Sığdığında (geniş ekran) hiçbir şey yapmaz.
 */
/** Kenar solmasının genişliği — `maskFor`daki 1.5rem ile aynı. */
const FADE_PX = 24;

export function TabScrollRow({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState<{ start: boolean; end: boolean }>({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      const next = { start: el.scrollLeft > 1, end: max - el.scrollLeft > 1 };
      setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
    };
    const active = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (active && el.scrollWidth > el.clientWidth) {
      const r = ((active.closest("li") as HTMLElement | null) ?? active).getBoundingClientRect();
      const box = el.getBoundingClientRect();
      // Pay = kenardaki solma genişliği (1,5rem): etkin sekme solan şeride düşmesin.
      if (r.right > box.right) el.scrollLeft += r.right - box.right + FADE_PX;
      else if (r.left < box.left) el.scrollLeft -= box.left - r.left + FADE_PX;
    }
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const fade = edges.start || edges.end ? maskFor(edges.start, edges.end) : undefined;
  return (
    <ul ref={ref} className={className} style={fade} data-fade-start={edges.start || undefined} data-fade-end={edges.end || undefined}>
      {children}
    </ul>
  );
}

function maskFor(start: boolean, end: boolean): CSSProperties {
  const g = `linear-gradient(to right, ${start ? "transparent, #000 1.5rem" : "#000"}, ${end ? "#000 calc(100% - 1.5rem), transparent" : "#000"})`;
  return { maskImage: g, WebkitMaskImage: g };
}
