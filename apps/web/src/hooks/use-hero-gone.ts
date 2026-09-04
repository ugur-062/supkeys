"use client";

import { useEffect, useState } from "react";

/**
 * Hero arama kutusu (`[data-hero-search]`) görünümden çıktı mı? Header'ın
 * kompakt araması ve yüzen "Talep aç" bunu dinler: hero ekrandayken büyük
 * kutunun yanında ikinci bir arama/CTA göstermek tekrar olurdu.
 *
 * Sayfada sentinel yoksa (hero'suz sayfa) `true` — orada zaten gösterilecek.
 * İlk render'da `false` — sunucu çıktısıyla hydrate uyumsuzluğu olmasın;
 * sentinel yoksa ilk efekt anında `true`ya çeker.
 */
export function useHeroGone(): boolean {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-hero-search]");
    if (!el) {
      setGone(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setGone(!e.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return gone;
}
