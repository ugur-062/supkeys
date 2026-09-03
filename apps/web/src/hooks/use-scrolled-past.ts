"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Referans verilen öğe görünümden ÇIKTI mı (yukarı kaydırıldı mı)?
 *
 * İlan detayındaki yapışkan eylem şeridi için (v2 7b): şerit sayfa
 * başındayken de çiziliyordu ve durum rozeti başlıkla birlikte İKİ kez
 * görünüyordu. Şerit yalnız başlık kaydırılıp gidince görünür.
 *
 * IntersectionObserver yoksa (test/eski tarayıcı) `true` döner — şerit her
 * zaman görünür, eski davranış. Fail-open: eylem şeridini kaybetmek, çift
 * rozetten kötüdür.
 */
export function useScrolledPast(ref: RefObject<HTMLElement | null>, topOffsetPx = 56): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setPast(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // Başlık üst kenarın (topbar) altında kaldıysa görünür sayılır.
        setPast(!entry.isIntersecting && entry.boundingClientRect.top < topOffsetPx);
      },
      { rootMargin: `-${topOffsetPx}px 0px 0px 0px`, threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, topOffsetPx]);
  return past;
}
