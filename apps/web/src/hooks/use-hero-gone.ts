"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Hero arama kutusu (`[data-hero-search]`) görünümden çıktı mı? Header'ın
 * kompakt araması, panel üst çubuğu araması ve yüzen "Talep aç" bunu dinler:
 * hero ekrandayken büyük kutunun yanında ikinci bir arama/CTA tekrar olurdu.
 *
 * Kurallar (2026-09-05 düzeltmesi):
 *  · Sentinel yoksa `true` (hero'suz sayfa) — ama panelde kabuk hero'dan
 *    ÖNCE mount olur (auth kapısı sayfayı sonradan basar); bu yüzden kısa
 *    süre DOM'u gözleyip sentinel gelirse `false`a döner ve kesişimi izler.
 *  · Rota değişince yeniden değerlendirir (üst çubuk kalıcı, sayfa değişir).
 *  · İlk render'da HER ZAMAN `false` — sunucu çıktısıyla hydrate uyumsuzluğu
 *    olmasın; `usePathname` yalnız efekt bağımlılığı, render dallanması DEĞİL.
 */
const SENTINEL = "[data-hero-search]";
const LATE_MOUNT_WINDOW_MS = 4000;

export function useHeroGone(): boolean {
  const pathname = usePathname();
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let io: IntersectionObserver | null = null;
    let mo: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const watch = (el: Element) => {
      setGone(false);
      io = new IntersectionObserver(([e]) => setGone(!e.isIntersecting), {
        rootMargin: "-64px 0px 0px 0px",
      });
      io.observe(el);
    };

    const el = document.querySelector(SENTINEL);
    if (el) {
      watch(el);
    } else {
      setGone(true);
      mo = new MutationObserver(() => {
        const late = document.querySelector(SENTINEL);
        if (!late) return;
        mo?.disconnect();
        mo = null;
        if (timer) clearTimeout(timer);
        watch(late);
      });
      mo.observe(document.body, { childList: true, subtree: true });
      // Hero gerçekten yoksa gözlemi bırak — iç sayfalarda kalıcı DOM
      // dinleyicisi taşımanın anlamı yok.
      timer = setTimeout(() => {
        mo?.disconnect();
        mo = null;
      }, LATE_MOUNT_WINDOW_MS);
    }

    return () => {
      io?.disconnect();
      mo?.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [pathname]);

  return gone;
}
