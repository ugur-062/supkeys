"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * YAPIŞKAN EYLEM ŞERİDİ — ürün sayfasında karar ekrandan çıkmasın.
 *
 * Europages'te sayfa kaydırılınca üstte ürün adı ve iletişim düğmesi sabit
 * kalır. Rothern'de satıcı paneli `lg:sticky` ama YALNIZ iki sütunlu blok
 * boyunca yapışır: sekmelere ve ilişkili ürünlere inildiğinde eylem
 * kayboluyordu. Şerit ÜSTTE değil ALTTA duruyor — public kabuk ve panel
 * kabuğu ikisi de üstte sabit çubuk taşıyor, üçüncü bir şerit oraya
 * yığılırdı.
 *
 * Şerit KENDİLİĞİNDEN görünmez: nöbetçi (asıl eylemin hemen altındaki sıfır
 * yükseklikli işaret) görünürken çizilmez — aynı düğme iki kez ekranda
 * durmaz, ikinci bir sekme durağı açılmaz.
 */
export function StickyCta({
  title,
  price,
  meta,
  children,
}: {
  /** Ürün adı — dar ekranda tek satır. */
  title: string;
  /** Fiyat başlığı ("41.000 ₺ / adet" ya da "Fiyat için teklif isteyin"). */
  price: { headline: string; hasPrice: boolean };
  /** İkinci satır (MOQ) — yoksa yer kaplamaz. */
  meta?: string;
  /** Tek eylem; `cta` slotuyla aynı düğme olabilir. */
  children: ReactNode;
}) {
  const sentinel = useRef<HTMLSpanElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        // Nöbetçi YUKARIDA kaldıysa (sayfa aşağı kaydı) şerit görünür;
        // aşağıda ise (henüz oraya gelinmedi) görünmez.
        setShow(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { rootMargin: "0px 0px -80% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <span ref={sentinel} aria-hidden className="block h-0" />
      <div
        // `hidden` özniteliği: JS yokken de kapalı kalır (asıl eylem sayfada
        // zaten var), ekran okuyucuya da iki kez okunmaz.
        hidden={!show}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-950/10 bg-white/95 px-4 py-3 backdrop-blur"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="hidden min-w-0 flex-1 sm:block">
            <p className="truncate text-sm font-medium text-zinc-700">{title}</p>
          </div>
          <div className="min-w-0 flex-1 sm:flex-none sm:text-right">
            <p className={`tnum truncate text-sm font-semibold ${price.hasPrice ? "text-zinc-950" : "text-zinc-600"}`}>
              {price.headline}
            </p>
            {meta ? <p className="tnum truncate text-xs text-zinc-500">{meta}</p> : null}
          </div>
          <div className="shrink-0">{children}</div>
        </div>
      </div>
    </>
  );
}
