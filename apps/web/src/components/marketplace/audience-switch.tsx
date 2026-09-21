"use client";

import { cn } from "@/lib/utils";
import { BuildingStorefrontIcon, ShoppingCartIcon } from "@heroicons/react/20/solid";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

/**
 * ALICIYIM / TEDARİKÇİYİM — anasayfanın yüzünü seçen anahtar (kullanıcı
 * kararı, 2026-09-07).
 *
 * Rothern'de tek hesap iki tarafı da yapar; ama anasayfaya gelen ziyaretçi
 * o an TEK bir amaçla gelir. Anahtar hangi tarafın içeriğinin görüneceğini
 * söyler: **alıcı → ürünler**, **tedarikçi → açık alım talepleri**.
 *
 * VARSAYILAN YÜZ TEDARİKÇİ (2026-09-21, kullanıcı kararı: "ilk başta
 * tedarikçiyim sayfası açılsın; tuşta tedarikçiyim solda, alıcıyım sağda").
 * Hidrasyon kuralı (2026-09-05 #418 dersi): sunucu HER ZAMAN "tedarikçi"
 * basar; tercih istemcide efektle okunur. İki tarafın içeriği de HTML'de durur,
 * görünmeyen taraf `hidden` ile gizlenir — arama motoru ikisini de görür,
 * geçiş anında olur, `display:none` ile ölçüm/etkileşim dışı kalır.
 *
 * Tercih `localStorage`ta: aynı ziyaretçi ikinci gelişinde kendi tarafını
 * görür. Erişilemezse (özel pencere) sessizce varsayılana düşer.
 */
export type Audience = "buyer" | "supplier";

const KEY = "rothern.audience";
/** Sunucunun bastığı ve kayıtlı tercih yokken açılan yüz. */
export const DEFAULT_AUDIENCE: Audience = "supplier";

/* PAYLAŞILAN TARAF DEPOSU (2026-09-17, kullanıcı: "www.rothern.com'da Ücretsiz
   Kaydol tuşu satış ekranına geçince yeşil olsun"): üst çubuk sağlayıcının
   DIŞINDA (kök düzen) mount olur; bağlam ona ulaşmaz. Tek modül-düzeyi depo:
   sağlayıcı yazar, üst çubuk `useAudienceValue` ile okur. Sunucu anlık
   görüntüsü hep varsayılan yüz → hidrasyon uyuşmazlığı yok. */
let audienceNow: Audience = DEFAULT_AUDIENCE;
const audienceListeners = new Set<() => void>();
function readSavedAudience(): Audience {
  try {
    const saved = window.localStorage.getItem(KEY);
    return saved === "supplier" || saved === "buyer" ? saved : DEFAULT_AUDIENCE;
  } catch {
    return DEFAULT_AUDIENCE;
  }
}
function publishAudience(a: Audience) {
  audienceNow = a;
  audienceListeners.forEach((l) => l());
}
function subscribeAudience(cb: () => void) {
  audienceListeners.add(cb);
  return () => {
    audienceListeners.delete(cb);
  };
}
/** Sağlayıcı dışından (üst çubuk) seçili taraf; mount'ta kayıtlı tercihi okur. */
export function useAudienceValue(): Audience {
  const a = useSyncExternalStore(subscribeAudience, () => audienceNow, () => DEFAULT_AUDIENCE);
  useEffect(() => {
    const saved = readSavedAudience();
    if (saved !== audienceNow) publishAudience(saved);
  }, []);
  return a;
}

/* Hero "Ürün | Firma" kapsam pili ve firma listesi anasayfadan KALKTI
   (2026-09-21, kullanıcı kararı: "herkese açık kısımda firma arama
   özelliğini kaldıralım, firmaları görüntüleyemesin"). Bağlam yalnız yüzü taşır. */
const Ctx = createContext<{
  audience: Audience;
  setAudience: (a: Audience) => void;
}>({
  audience: DEFAULT_AUDIENCE,
  setAudience: () => {},
});

export function AudienceProvider({ children }: { children: ReactNode }) {
  const [audience, set] = useState<Audience>(DEFAULT_AUDIENCE);

  useEffect(() => {
    const saved = readSavedAudience();
    set(saved);
    publishAudience(saved);
  }, []);

  const setAudience = (a: Audience) => {
    set(a);
    publishAudience(a);
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

const OPTIONS: {
  key: Audience;
  label: string;
  hint: string;
  Icon: typeof ShoppingCartIcon;
  on: string;
}[] = [
  // SIRA: Tedarikçiyim SOLDA, Alıcıyım SAĞDA (2026-09-21, kullanıcı kararı).
  {
    key: "supplier",
    label: "Tedarikçiyim",
    hint: "Talep arıyorum, teklif vereceğim",
    Icon: BuildingStorefrontIcon,
    on: "bg-white text-emerald-700 shadow-sm",
  },
  {
    key: "buyer",
    label: "Alıcıyım",
    hint: "Ürün arıyorum",
    Icon: ShoppingCartIcon,
    on: "bg-white text-blue-700 shadow-sm",
  },
];

/**
 * Anahtarın GÖRÜNÜMÜ panel portal piliyle aynı (2026-09-08, kullanıcı
 * kararı): açık gri hazne, seçili taraf BEYAZ yuva + kendi portal rengi
 * (alıcı mavi, tedarikçi yeşil) + ikon. Panelde soldaki Satınalma | Satış
 * anahtarı da böyle; anasayfa o ekranları taşıdığı için aynı jest aynı
 * görünmeli.
 *
 * ETİKET panel adları DEĞİL ("Satınalma"/"Satış" içeriden terimlerdir):
 * ziyaretçi kendini alıcı ya da tedarikçi olarak tanır.
 */
export function AudienceSwitch({ className }: { className?: string }) {
  const { audience, setAudience } = useAudience();
  return (
    <div
      role="radiogroup"
      aria-label="Hangi taraftasınız?"
      className={cn(
        /* Yükseklik 40 px (`p-0.5` + `py-1.5`), 44 değil: anasayfada pil
         fotoğrafın üstünde, header çizgisi ile hero başlığının ARASINDA
         duruyor ve o aralık yalnız 60 px (band `min-h-[30rem]` içinde
         dikeyde ortalı). 44 px'te başlığın üst kenarına 4 px kalıyordu. */
      "inline-flex items-center gap-1 rounded-full bg-zinc-100 p-0.5 ring-1 ring-zinc-950/5",
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
              "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition",
              on ? o.on : "text-zinc-600 hover:text-zinc-950",
            )}
          >
            <o.Icon aria-hidden className="size-4" />
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
