"use client";

import { TOPBAR_BASE_PX, topbarHeightPx } from "@/lib/safe-area";
import { useEffect, useState } from "react";

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
 *
 * Öğe STATE olarak verilir (callback ref ile `setEl`), RefObject değil:
 * başlık veri gelince render edildiğinden effect ilk koşumda ref'i boş bulur
 * ve bir daha koşmazdı — şerit hep görünür kalırdı (ilk doğrulamada yakalandı).
 */
export function useScrolledPast(el: HTMLElement | null, topOffsetPxProp?: number): boolean {
  const [past, setPast] = useState(false);
  // Üst çubuğun yüksekliği (56 px + güvenli alanın üst payı — mobil kabukta
  // çentikli telefonda daha uzun); döndürmede pay değişir, yeniden ölçülür.
  const [measuredOffset, setMeasuredOffset] = useState(TOPBAR_BASE_PX);
  useEffect(() => {
    if (topOffsetPxProp !== undefined) return;
    const measure = () => setMeasuredOffset(Math.round(topbarHeightPx()));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [topOffsetPxProp]);
  const topOffsetPx = topOffsetPxProp ?? measuredOffset;
  useEffect(() => {
    if (!el) {
      setPast(false);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
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
  }, [el, topOffsetPx]);
  return past;
}
