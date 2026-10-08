"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * GEÇERSİZ İLK ALANA ODAK (arayüz testi 2026-10 signup-tr-8, code-auth-9).
 *
 * Kimlik formlarında gönder düğmesi sessizce pasif KALMAZ: basılınca geçersiz
 * her alan `aria-invalid` olur, iletisi altında çizilir ve odak ilk geçersiz
 * alana gider. Alanlar hatayı bir sonraki çizimde alır → odak, çizimden SONRA
 * çalışan efektte ve DOM sırasıyla (görsel sıra) bulunur; alan başına ref
 * tutmaya gerek kalmaz (onay kutuları dahil — `role="checkbox"` odaklanabilir).
 *
 * Kullanım: `ref` forma verilir; doğrulama düşünce `focusFirstInvalid()`.
 */
export function useFocusFirstInvalid<T extends HTMLElement = HTMLFormElement>() {
  const ref = useRef<T>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!tick) return;
    const control = ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!control) return;
    // Tarayıcının kendi odak kaydırması kutuyu pencerenin üst kenarına yaslar ve
    // ETİKETİ ekranın dışında bırakır (duman testi 2026-10-08: "Ad" etiketi
    // y = -34). Odak kaydırmasız verilir; alanın kabı (etiket + kutu + ileti)
    // tam görünmüyorsa ortalanır.
    control.focus({ preventScroll: true });
    const box = control.closest<HTMLElement>('[data-slot="field"]') ?? control;
    const rect = box.getBoundingClientRect();
    const margin = 8;
    if (rect.top < margin || rect.bottom > window.innerHeight - margin) {
      box.scrollIntoView?.({ block: "center" });
    }
  }, [tick]);
  const focusFirstInvalid = useCallback(() => setTick((n) => n + 1), []);
  return { ref, focusFirstInvalid };
}
