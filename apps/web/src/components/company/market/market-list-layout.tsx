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
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
      <aside
        aria-label="Süzgeçler"
        className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100svh-6rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1 [scrollbar-width:thin]"
      >
        {rail}
      </aside>
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-3">
            <MobileFilterButton />
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
 * PAZAR IZGARASI — `auto-fill minmax(16rem, 1fr)`: 1440 px'te üç sütun,
 * geniş ekranda dört. Sabit `sm:2 xl:3` sınıflarında panel içeriği 1320 px
 * olduğu için ekranın yarısı boş kalıyordu.
 */
export function MarketGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))]">
      {children}
    </div>
  );
}

/**
 * LİSTE GÖRÜNÜMÜ — tek sütun yatay kart (`ProductCard variant="wide"`).
 * Izgara "tarama", liste "karşılaştırma" içindir: fiyat ve MOQ aynı sütunda
 * alt alta okunur.
 */
export function MarketList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

/** Yükleme iskeleti — kart yüksekliğiyle aynı, ızgara zıplamasın. */
export function MarketGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <MarketGrid>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-[22rem] animate-pulse rounded-xl bg-zinc-100" aria-hidden />
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
