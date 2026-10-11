"use client";

import { useTranslations } from "next-intl";

import { MAX_PRODUCT_IMAGES } from "@rothern/shared";
import { createPortal } from "react-dom";
import { CategoryImage } from "./category-image";
import { cn } from "@/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassPlusIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * ÜRÜN GALERİSİ (PROMPT 7) — kare ana görsel + altında küçük resim şeridi.
 *
 * Eskiden ilk görsel 16:10 basılıyor, kalanlar TIKLANAMAYAN bir şerit olarak
 * altına diziliyordu: ziyaretçi ikinci fotoğrafı büyük göremiyordu. Şerit
 * artık seçicidir (seçili olan koyu çerçeveli); tek görselli üründe hiç
 * çizilmez. Kare oran Europages kalıbı — ürün fotoğrafları çoğunlukla kare
 * çekilmiş stüdyo/atölye kareleri, 16:10 onları kırpıyordu.
 *
 * Görsel yoksa `CategoryImage` kategori ikonuna düşer (nötr gri) — ürün
 * görseli yayın kapısında zorunlu, yokluğu bir EKSİKLİK; tonlu kutu saklardı.
 */
export function ProductGallery({
  images,
  alt,
  categoryIds,
  badge,
}: {
  images: string[];
  alt: string;
  categoryIds: string[];
  /** Kapağın sol üstüne binen rozet ("Yeni Ürün") — kaynak kalıp. */
  badge?: ReactNode;
}) {
  const t = useTranslations("web.marketplace.gallery");
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  // Yükleyici ve API ile AYNI tavan (O-100: galeri 6'da kesiyordu, 7. ve 8.
  // görsel hiçbir yerde görünmüyordu).
  const list = images.slice(0, MAX_PRODUCT_IMAGES);
  const current = list[active] ?? list[0];
  const step = (d: 1 | -1) => setActive((i) => (list.length ? (i + d + list.length) % list.length : 0));
  const stripRef = useRef<HTMLUListElement>(null);

  // Seçili küçük resim şeritte görünür kalsın — yalnız ŞERİT yatay kayar
  // (`scrollIntoView` sayfayı da dikey kaydırırdı).
  useEffect(() => {
    const strip = stripRef.current;
    const item = strip?.children[active] as HTMLElement | undefined;
    if (!strip || !item) return;
    const left = item.offsetLeft;
    const right = left + item.offsetWidth;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
  }, [active]);

  // Büyütme katmanı Esc ile kapanır; açıkken sayfa kaydırması durur.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, list.length]);

  return (
    /* GENİŞLİK SINIRI (2026-09-07, kullanıcı bulgusu: "ürün fotoğrafı çok
       büyük"). Galeri sütunu `1fr` olduğu için kare görsel 1152 px'lik
       kapsayıcıda ~670 px'e çıkıyordu — ürün fotoğrafı sayfayı ezip
       satıcı paneliyle dengeyi bozuyordu. Europages'te aynı görsel ~34 rem
       civarında duruyor; kare oran (PROMPT 7 kararı) korunuyor, yalnız
       tavan konuyor. Sütun içinde SOLA yaslı kalır. */
    <div className="w-full max-w-[34rem]">
      <div className="relative">
        <CategoryImage
          src={current}
          categoryIds={categoryIds}
          alt={alt}
          ratio="aspect-square"
          className="rounded-2xl bg-zinc-100 ring-1 ring-zinc-950/5"
          sizes="(max-width: 1024px) 100vw, 34rem"
          priority
          fallback="neutral"
        />
        {badge ? <span className="absolute top-3 left-3 z-10">{badge}</span> : null}
        {/* BÜYÜT (kaynak kalıp): ürün fotoğrafı karar verdiren şeydir; kare
            kapak ayrıntıyı gösteremiyor. Görsel YOKSA düğme çizilmez —
            kategori ikonunu büyütmek anlamsız olurdu. */}
        {current ? (
          <button
            type="button"
            onClick={() => setZoom(true)}
            aria-label={t("zoom")}
            className="absolute top-3 right-3 z-10 inline-flex size-10 items-center justify-center rounded-full bg-white/95 text-zinc-700 shadow-sm ring-1 ring-zinc-950/10 transition hover:text-zinc-950"
          >
            <MagnifyingGlassPlusIcon aria-hidden className="size-5" />
          </button>
        ) : null}
      </div>
      {list.length > 1 ? (
        <div className="mt-3 flex items-center gap-2">
          <ArrowBtn dir={-1} onClick={() => step(-1)} />
        {/* TEK SATIR (arayüz testi webA-03 yeniden doğrulama): tavan 8'e
            çıkınca (O-100) 6 sütunluk ızgara 7.–8. görseli ikinci satıra
            kaydırıyor, oklar iki satırın ortasında asılı kalıyordu. Küçük
            resim boyu aynı (5 / sm 6 görünür), fazlası yatay kayar; seçili
            olan görünür alana alınır. */}
        <ul
          ref={stripRef}
          className="relative flex min-w-0 flex-1 snap-x gap-3 overflow-x-auto [scrollbar-width:none]"
        >
          {list.map((src, i) => (
            <li key={src} className="w-[calc((100%-3rem)/5)] shrink-0 snap-start sm:w-[calc((100%-3.75rem)/6)]">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={t("showImage", { n: i + 1 })}
                aria-current={i === active}
                className={cn(
                  "block w-full overflow-hidden rounded-lg ring-1 transition",
                  i === active ? "ring-2 ring-zinc-950" : "ring-zinc-950/10 hover:ring-zinc-400",
                )}
              >
                <CategoryImage src={src} alt="" ratio="aspect-square" />
              </button>
            </li>
          ))}
        </ul>
          <ArrowBtn dir={1} onClick={() => step(1)} />
        </div>
      ) : null}

      {/* PORTAL (arayüz testi O-015): galeri `lg:sticky` sarmalayıcıda; sticky
          kendi katman bağlamını kurduğu için portalsız katman o bağlamda
          hapsoluyor, sabit üst çubuk katmanın ÜSTÜNDE çiziliyor ve masaüstünde
          Kapat (X) tıklanamıyordu (z-index yükseltmek yetmez). `body`ye
          taşınan katman sayfanın tamamını örter. Açılış yalnız tıklamayla
          olduğu için `document` her zaman var (SSR'da zoom kapalı). */}
      {zoom && current
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={alt}
              onClick={() => setZoom(false)}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 p-4"
            >
              <button
                type="button"
                aria-label={t("close")}
                onClick={() => setZoom(false)}
                className="absolute top-4 right-4 inline-flex size-10 items-center justify-center rounded-full bg-white/95 text-zinc-800"
              >
                <XMarkIcon aria-hidden className="size-5" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current}
                alt={alt}
                onClick={(e) => e.stopPropagation()}
                className="max-h-[90vh] max-w-full rounded-xl object-contain"
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** Şerit oku — seçili görseli bir ileri/geri alır (kaynak kalıp). */
function ArrowBtn({ dir, onClick }: { dir: 1 | -1; onClick: () => void }) {
  const t = useTranslations("web.marketplace.gallery");
  const Icon = dir === 1 ? ChevronRightIcon : ChevronLeftIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 1 ? t("nextImage") : t("prevImage")}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-950"
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}
