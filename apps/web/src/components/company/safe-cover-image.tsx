"use client";

import { useState } from "react";

/**
 * Kapak görseli — İSTEMCİ bileşeni. `CompanyProfileView` herkese açık sayfada
 * (/firma/[slug]) SUNUCU bileşeni olarak render edilir; orada <img onError>
 * gibi olay işleyicileri yasaktır ("Event handlers cannot be passed to Client
 * Component props" → 500, kapak görseli olan her firmada; 2026-08-22'de
 * yakalandı).
 *
 * Kırık URL'de (erişilemeyen R2 host vb.) çıplak kırık-görsel ikonu yerine
 * koyu zemin + ortada soluk logo (2026-09-04: kırık ikon canlıda görüldü —
 * tarayıcı `onError` ateşlenene kadar ikonu basıyordu; `alt=""` + görsel
 * yüklenene dek `opacity-0` ile o ara kare de gizlenir). Kapsayıcının
 * yüksekliği sabit sınıf (`h-40 sm:h-56`) — yükleme kayması yok.
 */
export function SafeCoverImage({
  src,
  alt,
  logoSrc,
}: {
  src: string;
  alt: string;
  /** Kırık kapakta ortada gösterilecek logo (opsiyonel). */
  logoSrc?: string | null;
}) {
  const [state, setState] = useState<"loading" | "ok" | "broken">("loading");
  if (state === "broken") {
    return logoSrc ? (
      <div className="flex h-full w-full items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" className="max-h-16 w-auto opacity-30 grayscale" />
      </div>
    ) : null;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`h-full w-full object-cover transition-opacity ${state === "ok" ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setState("ok")}
        onError={() => setState("broken")}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
    </>
  );
}
