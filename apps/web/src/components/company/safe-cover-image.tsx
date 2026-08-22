"use client";

import { useState } from "react";

/**
 * Kapak görseli — İSTEMCİ bileşeni. `CompanyProfileView` herkese açık sayfada
 * (/firma/[slug]) SUNUCU bileşeni olarak render edilir; orada <img onError>
 * gibi olay işleyicileri yasaktır ("Event handlers cannot be passed to Client
 * Component props" → 500, kapak görseli olan her firmada; 2026-08-22'de
 * yakalandı). Kırık URL'de (erişilemeyen R2 host vb.) çıplak kırık-görsel
 * ikonu yerine kartın koyu zeminine sessizce düşer.
 */
export function SafeCoverImage({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setBroken(true)} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
    </>
  );
}
