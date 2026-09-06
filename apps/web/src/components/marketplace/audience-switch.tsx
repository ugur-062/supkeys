"use client";

import { cn } from "@/lib/utils";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * ALICIYIM / TEDARİKÇİYİM — anasayfanın yüzünü seçen anahtar (kullanıcı
 * kararı, 2026-09-07).
 *
 * Rothern'de tek hesap iki tarafı da yapar; ama anasayfaya gelen ziyaretçi
 * o an TEK bir amaçla gelir. Anahtar hangi tarafın içeriğinin görüneceğini
 * söyler: **alıcı → ürünler**, **tedarikçi → açık alım talepleri**.
 *
 * Hidrasyon kuralı (2026-09-05 #418 dersi): sunucu HER ZAMAN "alıcı" basar;
 * tercih istemcide efektle okunur. İki tarafın içeriği de HTML'de durur,
 * görünmeyen taraf `hidden` ile gizlenir — arama motoru ikisini de görür,
 * geçiş anında olur, `display:none` ile ölçüm/etkileşim dışı kalır.
 *
 * Tercih `localStorage`ta: aynı ziyaretçi ikinci gelişinde kendi tarafını
 * görür. Erişilemezse (özel pencere) sessizce varsayılana düşer.
 */
export type Audience = "buyer" | "supplier";

const KEY = "rothern.audience";

const Ctx = createContext<{ audience: Audience; setAudience: (a: Audience) => void }>({
  audience: "buyer",
  setAudience: () => {},
});

export function AudienceProvider({ children }: { children: ReactNode }) {
  const [audience, set] = useState<Audience>("buyer");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved === "supplier" || saved === "buyer") set(saved);
    } catch {
      /* depolama kapalı — varsayılan taraf */
    }
  }, []);

  const setAudience = (a: Audience) => {
    set(a);
    try {
      window.localStorage.setItem(KEY, a);
    } catch {
      /* kaydedilemedi — oturum boyunca yine geçerli */
    }
  };

  return <Ctx.Provider value={{ audience, setAudience }}>{children}</Ctx.Provider>;
}

export function useAudience() {
  return useContext(Ctx);
}

const OPTIONS: { key: Audience; label: string; hint: string }[] = [
  { key: "buyer", label: "Alıcıyım", hint: "Ürün ve tedarikçi arıyorum" },
  { key: "supplier", label: "Tedarikçiyim", hint: "Talep arıyorum, teklif vereceğim" },
];

export function AudienceSwitch({ className }: { className?: string }) {
  const { audience, setAudience } = useAudience();
  return (
    <div
      role="radiogroup"
      aria-label="Hangi taraftasınız?"
      className={cn(
        "mx-auto inline-flex items-center gap-1 rounded-full bg-zinc-100 p-1 ring-1 ring-zinc-950/5",
        className,
      )}
    >
      {OPTIONS.map((o) => {
        const on = o.key === audience;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.hint}
            onClick={() => setAudience(o.key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition",
              on ? "bg-zinc-950 text-white shadow-sm" : "text-zinc-600 hover:text-zinc-950",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Yalnız seçili tarafta GÖRÜNEN blok. Sunucu ikisini de basar (SEO + geçiş
 * anında olsun); `hidden` görünmeyeni tamamen kaldırır.
 */
export function AudienceOnly({ side, children }: { side: Audience; children: ReactNode }) {
  const { audience } = useAudience();
  return <div hidden={audience !== side}>{children}</div>;
}
