"use client";

import { ProductCard } from "./product-card";
import type { ProductIndexCard } from "@/lib/public/marketplace-api";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * ÜRÜN ŞERİDİ — anasayfanın alıcı yüzü (2026-09-08, kullanıcı kararı:
 * "panel anasayfalarını www.rothern.com anasayfasına taşı").
 *
 * Panel anasayfasındaki tavsiye şeridinin (`PanelRecommendations`) herkese
 * açık karşılığı: aynı anatomi (başlık + çıkış bağlantısı + iki uçta ok +
 * gizli kaydırma çubuğu + `compact` ürün kartı), farklı VERİ.
 *
 * ⚠️ Bilinçli tekrar: `PanelRecommendations` kendi şerit iskeletini taşımaya
 * devam ediyor. Ortak bir bileşene çıkarmak panel dosyasına dokunmayı
 * gerektirirdi; kullanıcı bu turda değişikliği yalnız anasayfayla sınırladı.
 * Panel şeridi bir gün elden geçerse ikisi burada birleştirilmeli.
 *
 * Panelden AYRILAN yer VERİ ve BAŞLIK: panel "size uygun" diyebiliyor çünkü
 * girişteki firmanın alım kategorileri var. Ziyaretçinin profili YOK; o
 * yüzden burada "öne çıkan" ve "yeni eklenen" gibi ölçülebilir kesitler
 * kullanılır — "size uygun" anonimde uydurma olurdu.
 *
 * Kartlar SUNUCUDA basılır (veri sayfadan prop olarak gelir): şerit
 * arayüzü istemcide çalışsa da ürün adları HTML'de durur, indekslenir.
 */
export function ProductStrip({
  id,
  title,
  lead,
  href,
  hrefLabel = "Tümünü gör",
  items,
  accent = "blue",
  showNew = true,
}: {
  id: string;
  title: string;
  lead: string;
  /** "Tümünü gör" hedefi — ürün dizininin ilgili kesiti. */
  href: string;
  hrefLabel?: string;
  items: ProductIndexCard[];
  accent?: "blue" | "emerald";
  /** "Yeni" rozeti; hepsi yeniyse ayırt etmediği için kapatılır. */
  showNew?: boolean;
}) {
  // Boş şerit çizilmez — boş kutu basmayız (anasayfa eşik kuralı).
  if (items.length === 0) return null;
  const link =
    accent === "emerald"
      ? "text-emerald-700 hover:text-emerald-800"
      : "text-blue-700 hover:text-blue-800";

  return (
    <section aria-labelledby={id}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={id} className="text-lg font-semibold tracking-tight text-zinc-950">
            {title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">{lead}</p>
        </div>
        <Link href={href} className={`inline-flex items-center gap-1 text-sm font-semibold ${link}`}>
          {hrefLabel}
          <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      </div>

      <CardRail>
        {items.map((p) => (
          <li
            key={`${p.company.slug}/${p.slug}`}
            /* 160/176 px DAR GELDİ (canlı bulgu 2026-09-09): kartın firma satırında
               avatar + bayrak + iki rozet sabit yer kaplıyor, geriye ada ~70 px
               kalıyordu ve "Başkent Medikal Ltd. Şti." canlıda "Başke…" diye
               okunuyordu — "kimden alıyorum" kartın karar veren alanı. Genişlik
               176/208/224'e çıktı; 1440 px'te bir kart az görünüyor, ad okunuyor. */
            className="w-44 shrink-0 snap-start sm:w-52 lg:w-56"
          >
            <ProductCard
              product={p}
              company={p.company}
              companySlug={p.company.slug}
              variant="compact"
              accent={accent === "blue" ? "blue" : "default"}
              showNew={showNew}
            />
          </li>
        ))}
      </CardRail>
    </section>
  );
}

/**
 * Yatay şerit: iki uçta yuvarlak ok, GÖRÜNÜR KAYDIRMA ÇUBUĞU YOK.
 *
 * Çubuk gizli olduğu için oklar tek görünür kaydırma yolu — bu yüzden uçta
 * GİZLENMEZ, devre dışı bırakılır: kaybolan düğme arayüzü zıplatır ve
 * kaydırmanın bittiğini anlatmaz. Klavye için şerit odaklanabilir.
 */
function CardRail({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState<{ start: boolean; end: boolean }>({ start: true, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({ start: el.scrollLeft <= 1, end: el.scrollLeft >= max - 1 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Bir "sayfa" = görünen genişliğin %80'i; tam genişlik kaydırmak sıradaki
  // kartın yarısını da geçirip bağlamı koparıyordu.
  const page = (dir: -1 | 1) =>
    ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.8), behavior: "smooth" });

  return (
    <div className="relative">
      <RailButton side="left" disabled={edge.start} onClick={() => page(-1)} />
      <ul
        ref={ref}
        onScroll={measure}
        tabIndex={0}
        aria-label="Ürün şeridi"
        /* `scroll-pl-*` ŞART: ilk kartın snap noktası scrollLeft=0'da olmazsa
           Chrome yüklenişte kaydırır ve o scroll olayı LCP raporunu keser
           (2026-09-04'te ölçüldü). */
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth scroll-pl-1 pb-1 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
      <RailButton side="right" disabled={edge.end} onClick={() => page(1)} />
    </div>
  );
}

/** Kenardan içeride yuvarlak düğme; dikey hizası kartın GÖRSEL alanı. */
function RailButton({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Geri kaydır" : "İleri kaydır"}
      className={`absolute top-[5.5rem] z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-zinc-700 shadow-md ring-1 ring-zinc-950/10 transition hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-0 sm:flex ${
        side === "left" ? "left-3" : "right-3"
      }`}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}
