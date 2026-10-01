"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { BuildingStorefrontIcon, ShoppingCartIcon } from "@heroicons/react/20/solid";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";

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

/**
 * YALNIZ ALICI YÜZÜNDE DURAN ÇAPALAR. Altbilgi ve boş durum "Kategoriler"i
 * `/#kategoriler`e gönderir; vitrin alıcı yüzünde olduğu için varsayılan
 * (tedarikçi) yüzde hedef `hidden` kalıyor ve hiçbir yere kaymıyordu (arayüz
 * testi O-118). Böyle bir çapayla gelinince yüz alıcıya geçer (kayıtlı tercih
 * DEĞİŞMEZ — ziyaretçinin seçimi değil, bağlantının hedefi) ve hedef
 * görünür olduktan sonra kaydırılır.
 */
const BUYER_ANCHORS = new Set(["kategoriler"]);
function buyerAnchor(hash: string): string | null {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  return BUYER_ANCHORS.has(id) ? id : null;
}

export function AudienceProvider({ children }: { children: ReactNode }) {
  const [audience, set] = useState<Audience>(DEFAULT_AUDIENCE);
  const [scrollTo, setScrollTo] = useState<{ id: string } | null>(null);

  useEffect(() => {
    const anchor = buyerAnchor(window.location.hash);
    const initial = anchor ? "buyer" : readSavedAudience();
    set(initial);
    publishAudience(initial);
    if (anchor) setScrollTo({ id: anchor });

    const goTo = (id: string) => {
      set("buyer");
      publishAudience("buyer");
      setScrollTo({ id });
    };
    const onHash = () => {
      const id = buyerAnchor(window.location.hash);
      if (id) goTo(id);
    };
    /* Aynı sayfadaki `/#kategoriler` bağlantısı istemci yönlendiricisiyle
       (pushState) gider ve `hashchange` ATEŞLENMEZ — tıklama yakalanır. */
    const onClick = (e: MouseEvent) => {
      // Yeni sekme/pencere (Ctrl/Cmd/Shift/Alt+tık, target="_blank") bu
      // sekmede gezinme değildir — mevcut sayfa yüz değiştirmemeli.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a?.href) return;
      if (a.target && a.target !== "_self") return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
      const id = buyerAnchor(url.hash);
      if (id) goTo(id);
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  // Hedef ancak alıcı yüzü çizildikten sonra görünür; tarayıcının kendi çapa
  // kaydırması gizli öğede boşa düşer, burada açıkça kaydırılır.
  useEffect(() => {
    if (!scrollTo || audience !== "buyer") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(scrollTo.id)?.scrollIntoView?.({ block: "start" });
      setScrollTo(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollTo, audience]);

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

export function AudienceSwitch({ className }: { className?: string }) {
  const { audience, setAudience } = useAudience();
  const t = useTranslations("web.marketing.audience");
  // SIRA: Tedarikçiyim SOLDA, Alıcıyım SAĞDA (2026-09-21, kullanıcı kararı).
  const OPTIONS: {
    key: Audience;
    label: string;
    hint: string;
    Icon: typeof ShoppingCartIcon;
    on: string;
  }[] = [
    {
      key: "supplier",
      label: t("supplier"),
      hint: t("supplierHint"),
      Icon: BuildingStorefrontIcon,
      on: "bg-white text-emerald-700 shadow-sm",
    },
    {
      key: "buyer",
      label: t("buyer"),
      hint: t("buyerHint"),
      Icon: ShoppingCartIcon,
      on: "bg-white text-blue-700 shadow-sm",
    },
  ];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  /* RADYO KALIBI (arayüz testi D-313): grup TEK sekme durağıdır (seçili olan);
     ok tuşları seçimi kaydırır ve odağı taşır, Home/End uçlara gider. */
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = OPTIONS.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    setAudience(OPTIONS[next]!.key);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className={cn(
        /* Yükseklik 40 px (`p-0.5` + `py-1.5`), 44 değil: anasayfada pil
         fotoğrafın üstünde, header çizgisi ile hero başlığının ARASINDA
         duruyor ve o aralık yalnız 60 px (band `min-h-[30rem]` içinde
         dikeyde ortalı). 44 px'te başlığın üst kenarına 4 px kalıyordu. */
      "inline-flex items-center gap-1 rounded-full bg-zinc-100 p-0.5 ring-1 ring-zinc-950/5",
        className,
      )}
    >
      {OPTIONS.map((o, i) => {
        const on = o.key === audience;
        return (
          <button
            key={o.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.hint}
            onClick={() => setAudience(o.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
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
