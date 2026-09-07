"use client";

import { ProductCard } from "@/components/marketplace/product-card";
import { useDiscoverSearch } from "@/hooks/use-portal-discovery";
import { PANEL_MARKET, panelProductPath } from "@/lib/company/panel-market";
import { recentSearches } from "@/lib/company/recent-searches";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// Ekranda ~7 kart görünüyor; 8 çekmek şeridi kaydırılamaz kılardı (oklar
// hemen devre dışı kalırdı). 16 = iki "sayfa".
const LIMIT = 16;

/**
 * ÜRÜN TAVSİYESİ ŞERİDİ — "aramalarınıza ve kategorilerinize göre"
 * (2026-09-07, kullanıcı kararı).
 *
 * İKİ GİRDİ, İKİ ŞERİT — aynı listeyi iki kez basmamak için:
 *  · `mode="match"` (arama kutusunun hemen altı): SON ARAMA varsa onunla
 *    süzülmüş sonuçlar ("… aramanıza göre"), yoksa listenin varsayılan
 *    sırası — alıcının ALIM kategorileriyle örtüşenler önde (`matchesProfile`).
 *  · `mode="fresh"` (kategori vitrininin altı): `sort=newest`, "yeni eklenen".
 *
 * Neden ikisi ayrı: geçmişi olmayan kullanıcıda iki şerit de kategori
 * eşleşmesine düşse AYNI sekiz ürün iki kez basılırdı. "Yeni eklenen" her
 * hâlükârda farklı bir kesit.
 *
 * ARAMA GEÇMİŞİ TARAYICI-YERELDİR ve efektte okunur: sunucu render'ında
 * `localStorage` yok, koşulu render'a taşımak hydration uyuşmazlığı olurdu
 * (aynı ders: 2026-09-05 React #418).
 *
 * Şerit boşsa bölüm HİÇ çizilmez — boş kutu basmayız.
 */
export function PanelRecommendations({ mode }: { mode: "match" | "fresh" }) {
  const [term, setTerm] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(mode === "fresh");
  useEffect(() => {
    if (mode !== "match") return;
    setTerm(recentSearches("satinalma")[0]);
    setReady(true);
  }, [mode]);

  const { data, isLoading } = useDiscoverSearch(
    mode === "fresh"
      ? { pageSize: LIMIT, sort: "newest" }
      : { pageSize: LIMIT, ...(term ? { q: term } : {}) },
  );
  const items = data?.items ?? [];
  // Geçmiş okunmadan istek atılmasın: `q`siz sonuç gelip sonra `q`li sonuçla
  // değişince şerit gözle görülür biçimde zıplıyordu.
  if (!ready) return null;
  if (!isLoading && items.length === 0) return null;

  const copy =
    mode === "fresh"
      ? { title: "Yeni eklenen ürünler", lead: "Tedarikçilerin vitrinlerine en son eklediği ürünler." }
      : term
        ? { title: "Aramalarınıza göre", lead: `Son aradığınız “${term}” ile eşleşen tedarikçi ürünleri.` }
        : {
            title: "Size uygun ürünler",
            lead: "Alım kategorilerinizle örtüşen tedarikçi ürünleri.",
          };

  return (
    <section aria-labelledby={`oneri-${mode}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`oneri-${mode}`} className="text-lg font-semibold tracking-tight text-zinc-950">
            {copy.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">{copy.lead}</p>
        </div>
        <Link
          href={
            mode === "fresh"
              ? `${PANEL_MARKET.products}?sirala=yeni`
              : term
                ? `${PANEL_MARKET.products}?q=${encodeURIComponent(term)}`
                : PANEL_MARKET.products
          }
          className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          Tümünü gör
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 w-40 shrink-0 animate-pulse rounded-lg bg-zinc-100 sm:w-44" />
          ))}
        </div>
      ) : (
        <CardRail>
          {items.map((p) => (
            <li key={`${p.company.slug}/${p.slug}`} className="w-40 shrink-0 snap-start sm:w-44">
              <ProductCard
                product={p}
                company={p.company}
                href={panelProductPath(p.company.slug, p.slug)}
                variant="compact"
              />
            </li>
          ))}
        </CardRail>
      )}
    </section>
  );
}

/**
 * YATAY ŞERİT — iki uçta yuvarlak ok, GÖRÜNÜR KAYDIRMA ÇUBUĞU YOK
 * (2026-09-07, kullanıcı kararı; kaynak spec §10 "arrows-inset-12").
 *
 * Çubuk gizlendiği için ok DÜĞMELERİ tek görünür kaydırma yolu olur — bu
 * yüzden okları "uçtayken gizle" değil DEVRE DIŞI BIRAK yaparız: kaybolan
 * düğme kaydırmanın bittiğini anlatmaz, sadece arayüzü zıplatır. Kaydırma
 * dokunmatikte ve trackpad'de zaten çalışır; klavye için şerit
 * odaklanabilir (`tabIndex`) ve ok tuşlarıyla kayar.
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
  const page = (dir: -1 | 1) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.8), behavior: "smooth" });

  return (
    <div className="relative">
      <RailButton side="left" disabled={edge.start} onClick={() => page(-1)} />
      <ul
        ref={ref}
        onScroll={measure}
        tabIndex={0}
        aria-label="Ürün şeridi"
        // `scroll-pl-*` ŞART: ilk kartın snap noktası scrollLeft=0'da
        // olmazsa Chrome yüklenişte kaydırır ve o scroll olayı LCP
        // raporunu keser (2026-09-04'te ölçüldü).
        // Kaydırma çubuğu gizli: Firefox `scrollbar-width`, WebKit sözde öğe.
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth scroll-pl-1 pb-1 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
      <RailButton side="right" disabled={edge.end} onClick={() => page(1)} />
    </div>
  );
}

/**
 * Kenardan 12 px içeride yuvarlak düğme (kaynak: `arrows-inset-12`).
 *
 * Dikey hizası kartın ORTASI değil GÖRSEL alanı: kart 309 px yüksek,
 * ortaya konunca düğme ilk kartın BAŞLIĞINI örtüyordu. Görsel 4:3 ve kart
 * 176 px geniş → ~132 px yükseklik; 5,5 rem o alanın içinde kalır.
 */
function RailButton({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
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
      <Icon aria-hidden className="size-5" strokeWidth={2} />
    </button>
  );
}
