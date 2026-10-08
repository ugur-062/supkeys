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
    ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [tick]);
  const focusFirstInvalid = useCallback(() => setTick((n) => n + 1), []);
  return { ref, focusFirstInvalid };
}
