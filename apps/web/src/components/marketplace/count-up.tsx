"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sayı animasyonu — görünüme girince 0'dan hedefe (600 ms, ease-out).
 * SSR'da ve `prefers-reduced-motion`da hedef sayı doğrudan basılır; JS
 * gelmezse de doğru sayı görünür (animasyon süs, içerik değil).
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || started.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || started.current) return;
        started.current = true;
        io.disconnect();
        const t0 = performance.now();
        const dur = 600;
        const tick = (t: number) => {
          const k = Math.min(1, (t - t0) / dur);
          const eased = 1 - Math.pow(1 - k, 3);
          setShown(Math.round(value * eased));
          if (k < 1) requestAnimationFrame(tick);
        };
        setShown(0);
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString("tr-TR")}
    </span>
  );
}
