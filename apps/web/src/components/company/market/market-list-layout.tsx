"use client";

import { FilterResults, MobileFilterButton, useFilters } from "@/components/marketplace/filter-shell";
import { Pagination } from "@/components/ui/pagination";
import { PER_PAGE_OPTIONS, type PerPage } from "@/lib/public/product-filter-params";
import type { ReactNode } from "react";

/**
 * PAZAR LİSTE İSKELETİ — kenar süzgeci + araç çubuğu + ızgara + sayfalama.
 *
 * Ürün ve firma dizinleri AYNI iskeleti kullanır; ayrışsalardı biri
 * sayfalamayı numaralı öteki "Önceki/Sonraki" gösterirdi (bugünkü hâl).
 *
 * Kenar çubuğu `sticky` ve KENDİ KAYDIRMA ÇUBUĞU YOK: gruplar katlanabilir
 * ve her grup ilk 6 seçeneği gösterdiği için ray ekrandan taşmaz. `max-h`
 * yine de duruyor — bütün grupları açan kullanıcıda alt gruplar
 * erişilemez kalmasın diye (taşma OLMADIĞINDA çubuk çizilmez).
 *
 * RAY `xl`'DE AÇILIR, `lg`'DE DEĞİL (2026-09-07, yoğunluk düzeltmesi).
 * Panelde ekranı sol menü de paylaşıyor: 1024 px'te menü (256) + ray (256)
 * + iç boşluk, sonuç sütununa 416 px bırakıyordu — ızgara TEK SÜTUNA
 * düşüyor ve ~500×380 px kapaklı kartlarla ekrana bir ürün sığıyordu
 * ("pazar yeri değil blog"). 1024-1280 arasında süzgeçler artık çekmecede;
 * `MobileFilterButton`/çekmece kırılımı da `xl` (ayrışırsa o bantta ne ray
 * ne çekmece kalır).
 *
 * Sonuç sütunu bir `@container`: ızgara kırılımları GÖRÜNTÜ ALANINA değil
 * kendi genişliğine bakar. Aynı `lg` görüntü alanı bu sayfada 416 px, aynı
 * bileşen herkese açık `/urunler`de 900+ px sütun demek — viewport
 * kırılımı ikisinden birinde her zaman yanlış sütun genişliği üretirdi.
 */
export function MarketListLayout({
  rail,
  toolbarStart,
  toolbarEnd,
  children,
  page,
  total,
  pageSize,
  onPage,
  onPerPage,
  perPage,
}: {
  rail: ReactNode;
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  children: ReactNode;
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  /** Verilirse "Sayfa başına" seçici çizilir. */
  onPerPage?: (n: PerPage) => void;
  perPage?: PerPage;
}) {
  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[16rem_1fr]">
      <aside
        aria-label="Süzgeçler"
        className="hidden xl:sticky xl:top-20 xl:block xl:max-h-[calc(100svh-6rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:pr-1 [scrollbar-width:thin]"
      >
        {rail}
      </aside>
      <div className="@container min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-3">
            <MobileFilterButton hideAt="xl" />
            {toolbarStart}
          </span>
          {toolbarEnd}
        </div>
        <FilterResults>{children}</FilterResults>
        {total > pageSize ? (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 pt-6">
            <Pagination page={page} total={total} pageSize={pageSize} onChange={onPage} />
            {onPerPage && perPage != null ? <PerPageSelect value={perPage} onChange={onPerPage} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** "Sayfa başına" — URL'de `adet`; nötr kontrol (birincil eylem rengi DEĞİL). */
function PerPageSelect({ value, onChange }: { value: PerPage; onChange: (n: PerPage) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-500">
      Sayfa başına
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as PerPage)}
        className="tnum h-8 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900"
      >
        {PER_PAGE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * PAZAR IZGARASI — 1 → 2 → 3 → 4 sütun, eşiği SONUÇ SÜTUNUNUN genişliğinde
 * (`@container`, bkz. `MarketListLayout`).
 *
 * `auto-fill minmax(16rem,1fr)` yerine sayılı kırılım: auto-fill sütun
 * sayısını "16 rem sığıyor mu" diye hesapladığı için 952 px'lik en geniş
 * sütunda bile üçte takılıyor (4×256+3×20 = 1084 > 952), dar bantlarda ise
 * TEK sütuna düşüyordu.
 *
 * Eşikler ÖLÇÜLEREK seçildi (12 görüntü alanı genişliği, sonuç sütunu
 * gerçek genişliğiyle) ve tek bir kural gözetildi: **görüntü alanı
 * genişledikçe sütun sayısı asla azalmamalı.** Ray `xl`'de geri geldiği
 * için 1280 px'te sonuç sütunu 1152 px'tekinden DAR (656 < 832); 3 sütun
 * eşiği 40 rem'de olmasaydı pencereyi büyüten kullanıcı bir sütun
 * kaybederdi. Ölçülen sonuç: 420→1, 540→2, 640→2, 768-1440→3, 1536+→4;
 * sütun genişliği her kademede 205-390 px, ekranda aynı anda 6-9 ürün.
 *
 * `variant`: firma kartı ürün kartından metin-yoğun (Hakkında, sertifika,
 * "N ürün · Kuruluş · çalışan") — aynı eşiklerde 205 px'e inince satırlar
 * kırpılmaktan okunmaz hâle gelir; firma dizini bir kademe geniş kalır.
 */
export function MarketGrid({
  children,
  variant = "product",
}: {
  children: ReactNode;
  variant?: "product" | "company";
}) {
  return <div className={MARKET_GRID_CLS[variant]}>{children}</div>;
}

/** Izgara sınıfları — iskelet de AYNISINI kullanır (yükleme zıplamasın). */
const MARKET_GRID_CLS = {
  product: "grid grid-cols-1 gap-4 @[28rem]:grid-cols-2 @[40rem]:grid-cols-3 @[56rem]:grid-cols-4",
  company: "grid grid-cols-1 gap-4 @[30rem]:grid-cols-2 @[52rem]:grid-cols-3",
} as const;

/**
 * LİSTE GÖRÜNÜMÜ — tek sütun yatay kart (`ProductCard variant="wide"`).
 * Izgara "tarama", liste "karşılaştırma" içindir: fiyat ve MOQ aynı sütunda
 * alt alta okunur.
 */
export function MarketList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

/** Yükleme iskeleti — kart yüksekliğiyle aynı, ızgara zıplamasın. */
export function MarketGridSkeleton({
  count = 12,
  variant,
}: {
  count?: number;
  variant?: "product" | "company";
}) {
  return (
    <MarketGrid variant={variant}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-[22rem] animate-pulse rounded-lg bg-zinc-100" aria-hidden />
      ))}
    </MarketGrid>
  );
}

/**
 * BOŞ DURUM — tek başlık, ≤1 satır, ≤1 birincil eylem (EmptyState kuralı).
 * "Filtreleri temizle" kabuğun `clear`ini çağırır; eskiden `clear()` ile
 * `update()` peş peşe çağrılıyor ve ikincisi BAYAT durumu yazdığı için
 * süzgeçler geri geliyordu (yalnız arama düşüyordu).
 */
export function MarketEmpty({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  const { clear, update, activeCount, state } = useFilters<{ q?: string; page: number }>();
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-12 text-center">
      <p className="text-base font-semibold text-zinc-900">{title}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
        {action}
        {activeCount > 0 ? (
          <button type="button" onClick={clear} className={SECONDARY}>
            Filtreleri temizle
          </button>
        ) : state.q ? (
          // `clear` aramayı KORUR (görünüm tercihi gibi davranır), bu yüzden
          // süzgeç yokken doğru eylem "aramayı kaldır" — aynı düğmeye iki
          // farklı iş yaptırmak, hiçbir şey olmuyormuş gibi görünmesine yol
          // açıyordu.
          <button type="button" onClick={() => update({ q: undefined })} className={SECONDARY}>
            Aramayı kaldır
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** İkincil eylem — birincil rengin çerçeveli hâli (§ tek eylem rengi). */
const SECONDARY =
  "rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-zinc-900 transition hover:bg-white";
