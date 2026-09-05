"use client";

import { resolveApiBaseUrl } from "@/lib/resolve-api-url";
import { useEffect } from "react";

/**
 * Herkese açık profil/ürün sayfası görüntülenme beacon'ı (Ziyaret Edenler).
 * Sayfa ISR ile önbellekli — API'ye uğramadığı için sayım istemciden atılır.
 *  · 3 sn gerçek okuma + sekme görünür → tek istek (sekme başına bir kez).
 *  · Otomasyon (`navigator.webdriver`) atılmaz; sunucu bot ajanlarını da süzer.
 *  · Çerezsiz (`credentials: "omit"`): giriş yapmış üye de burada ANONİMDİR —
 *    kimliği yalnız panel görüntülemesinde yazılır.
 */
export function ViewBeacon({ type, companySlug, productSlug }: { type: "profile" | "product"; companySlug: string; productSlug?: string }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return;
    const key = `rothern.view:${type}:${companySlug}:${productSlug ?? ""}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      /* depolama yok — yine de gönder */
    }
    const t = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* depolama yok */
      }
      const base = resolveApiBaseUrl();
      if (!base) return;
      void fetch(`${base}/public/views`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, companySlug, ...(productSlug ? { productSlug } : {}) }),
        keepalive: true,
        credentials: "omit",
      }).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, [type, companySlug, productSlug]);
  return null;
}
