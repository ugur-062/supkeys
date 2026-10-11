"use client";

import { useEffect, useRef } from "react";

/**
 * Veri istemcide yüklenen sayfada adresteki çapaya (`#bilgi-iste`, `#belgeler`)
 * kaydırır. Tarayıcının kendi çapa kaydırması ilk boyamada öğeyi bulamıyordu
 * (öğe veri gelince çiziliyor) ve sayfa en üstte açılıyordu (arayüz testi
 * D-022). `ready` ilk kez true olduğunda BİR KEZ çalışır.
 */
export function useScrollToHash(ready: boolean): void {
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current || typeof window === "undefined") return;
    done.current = true;
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!id) return;
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: "start" });
  }, [ready]);
}
