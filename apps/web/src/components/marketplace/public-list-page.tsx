import { FilterChip } from "./facets";
import { SearchForm } from "./search-form";
import { Heading } from "@/components/catalyst/heading";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * HERKESE AÇIK LİSTE İSKELETİ — ilan ve ürün dizinleri ORTAK (2026-09-04).
 *
 * başlık + açıklama + arama → aktif süzgeç çipleri → SOL süzgeç sütunu +
 * sonuç ızgarası. Çerçeve tek yerde: iki listenin ritmi ayrışamaz (biri
 * kenar çubuğunu gizler öteki göstermez, biri çipleri başka yere koyar…).
 *
 * Kenar çubuğu HER ZAMAN çizilir — eskiden sonuç yokken gizleniyordu ve
 * sayfa açıklamasının vaat ettiği süzgeçler ("kategoriye ve şehre göre
 * süzün") ortada yoktu.
 */
export function PublicListPage({
  title,
  lead,
  search,
  breadcrumb,
  chips,
  clearHref,
  sidebar,
  summary,
  chipsNode,
  children,
}: {
  title: string;
  lead: string;
  search: {
    action: string;
    defaultValue?: string;
    placeholder?: string;
    hidden?: Record<string, string | undefined>;
    hiddenList?: Record<string, string[]>;
  };
  breadcrumb?: ReactNode;
  /** Aktif süzgeçler — boşsa şerit çizilmez. */
  chips: { key: string; label: string; href: string }[];
  clearHref: string;
  sidebar: ReactNode;
  /** "12 ürün" gibi sayı satırı. */
  summary?: ReactNode;
  /**
   * Süzgeç v3: çip şeridi/sıralama/mobil düğme istemci bileşenlerinden
   * gelir (`chipsNode`); verilirse `chips`/`clearHref` yok sayılır ve aside
   * mobilde GİZLENİR (çekmece var).
   */
  chipsNode?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className="border-b border-zinc-950/5 bg-white pt-28 pb-10">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          {breadcrumb}
          <Heading
            level={1}
            className="text-3xl font-semibold tracking-tight !text-zinc-950 sm:text-4xl"
          >
            {title}
          </Heading>
          <p className="mt-3 max-w-2xl text-base/7 text-zinc-500">{lead}</p>
          <div className="mt-7 max-w-3xl">
            <SearchForm {...search} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 pt-8 pb-24 lg:px-8">
        {chipsNode ?? null}
        {!chipsNode && chips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-zinc-500">Süzgeçler:</span>
            {chips.map((c) => (
              <FilterChip key={c.key} href={c.href} label={c.label} />
            ))}
            <Link
              href={clearHref}
              className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
            >
              Tümünü temizle
            </Link>
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[16rem_1fr]">
          {/* Sticky sidebar viewport'tan uzunsa kendi içinde kaydırılır —
              eskiden ~1450 px sabit kalıyor, alttaki gruplar görünmüyordu (A1). */}
          <aside
            aria-label="Süzgeçler"
            className={`${chipsNode ? "hidden lg:block" : ""} lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-2 [scrollbar-width:thin]`}
          >
            {sidebar}
          </aside>
          <div>
            {summary ? <p className="mb-4 text-sm text-zinc-500">{summary}</p> : null}
            {children}
          </div>
        </div>
      </div>
    </>
  );
}

/** Sonuç ızgarası — sütun sayısı içerik sayısıyla sınırlı (tek kart öksüz kalmasın). */
export function ResultGrid({ count, children }: { count: number; children: ReactNode }) {
  const cols =
    count >= 3 ? "sm:grid-cols-2 xl:grid-cols-3" : count === 2 ? "sm:grid-cols-2" : "sm:max-w-sm";
  return <div className={`grid grid-cols-1 gap-5 ${cols}`}>{children}</div>;
}
