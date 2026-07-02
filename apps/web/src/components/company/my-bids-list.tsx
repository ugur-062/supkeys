"use client";

import { Badge } from "@/components/catalyst/badge";
import {
  EmptyState,
  FilterSelect,
  ListSkeleton,
  PageHeader,
  Pagination,
  ResultCount,
  SearchInput,
} from "@/components/list";
import { CountdownFull } from "@/components/tenders/countdown-full";
import {
  useMyBids,
  type ListingType,
  type MyBid,
} from "@/hooks/use-company-listings";
import { closingUrgency } from "@/lib/tenders/seller-state";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowUpDown,
  Building2,
  Calendar,
  CalendarRange,
  CircleSlash,
  Gavel,
  ListFilter,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const PAGE_SIZE = 10;

const STATUS: Record<
  string,
  { label: string; color: "amber" | "green" | "zinc" | "red" | "violet" }
> = {
  DRAFT: { label: "Taslak", color: "amber" },
  SUBMITTED: { label: "Değerlendirmede", color: "violet" },
  WON: { label: "Kazandı", color: "green" },
  AWARDED_PARTIAL: { label: "Kısmen Kazandı", color: "green" },
  LOST: { label: "Elendi", color: "zinc" },
  WITHDRAWN: { label: "Geri çekildi", color: "red" },
};
// Bilinmeyen statü listeyi ÇÖKERTMESİN (eskiden DRAFT'ta beyaz ekran).
const STATUS_FALLBACK = { label: "Bilinmiyor", color: "zinc" as const };

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Tüm Durumlar" },
  { value: "DRAFT", label: "Taslak" },
  { value: "SUBMITTED", label: "Değerlendirmede" },
  { value: "WON", label: "Kazandı" },
  { value: "AWARDED_PARTIAL", label: "Kısmen Kazandı" },
  { value: "LOST", label: "Elendi" },
  { value: "WITHDRAWN", label: "Geri çekildi" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "En Yeni" },
  { value: "oldest", label: "En Eski" },
  { value: "amount", label: "Tutar (Yüksek → Düşük)" },
];

const RANGE_OPTIONS = [
  { value: "all", label: "Tüm Zamanlar" },
  { value: "7", label: "Son 7 Gün" },
  { value: "30", label: "Son 30 Gün" },
  { value: "90", label: "Son 3 Ay" },
  { value: "365", label: "Son 1 Yıl" },
];

function sym(currency: string | undefined): string {
  return (
    CURRENCY_SYMBOL[(currency as keyof typeof CURRENCY_SYMBOL) ?? "TRY"] ??
    currency ??
    "₺"
  );
}

function matchesSearch(b: MyBid, q: string) {
  if (!q) return true;
  const needle = q.toLocaleLowerCase("tr");
  return (
    b.listing.title.toLocaleLowerCase("tr").includes(needle) ||
    (b.listing.number ?? "").toLocaleLowerCase("tr").includes(needle) ||
    b.listing.ownerName.toLocaleLowerCase("tr").includes(needle)
  );
}

/** Teklif kartı — Satın Al / Açık İhaleler kart dilinin teklif sürümü. */
function MyBidCard({ b, fromHref }: { b: MyBid; fromHref: string }) {
  const st = STATUS[b.status] ?? STATUS_FALLBACK;
  const urgency =
    b.listing.status === "OPEN"
      ? closingUrgency(b.listing.status, b.listing.closesAt)
      : null;

  return (
    <Link
      href={`/company/ilan/${b.listing.id}?from=${encodeURIComponent(fromHref)}&fromLabel=Tekliflerim`}
      className="group block"
    >
      <div className="flex h-full flex-col rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] text-zinc-500">
              {b.listing.number ?? "—"}
            </p>
            <h3 className="mt-0.5 line-clamp-2 leading-snug font-semibold text-zinc-950">
              {b.listing.title}
            </h3>
          </div>
          <Badge color={st.color} className="shrink-0">
            {st.label}
          </Badge>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1.5 text-sm text-zinc-600">
            <Building2 className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
            <span className="truncate font-medium">{b.listing.ownerName}</span>
          </span>
          <span className="font-mono text-sm font-bold text-zinc-900 tabular-nums">
            {Number(b.amount).toLocaleString("tr-TR")} {sym(b.currency)}
          </span>
          {b.isBuyNow ? <Badge color="emerald">Hemen-Al</Badge> : null}
          {b.round > 1 ? <Badge color="zinc">Tur {b.round}</Badge> : null}
          {b.version > 1 ? (
            <span className="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
              v{b.version}
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-3 text-xs">
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            <span>
              Verildi{" "}
              {format(new Date(b.createdAt), "dd MMM yyyy", { locale: tr })}
            </span>
          </div>
          {b.listing.status === "OPEN" && b.listing.closesAt ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 font-semibold",
                urgency?.className ?? "text-zinc-500",
              )}
            >
              Kapanışa{" "}
              <CountdownFull
                deadline={b.listing.closesAt}
                endedLabel="Kapandı"
              />
            </span>
          ) : (
            <span className="text-zinc-400">İhale kapandı</span>
          )}
        </div>
      </div>
    </Link>
  );
}

/**
 * Firmanın verdiği teklifler. `listingType` ile portala göre süzülür:
 * - SATIS → satıcıların ilanlarına verilen (Satın Al) teklifler (satınalma paneli)
 * - ALIM  → açık ihalelere verilen teklifler (satış paneli)
 */
export function MyBidsList({ listingType }: { listingType: ListingType }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [range, setRange] = useState("all");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useMyBids();

  const isPurchase = listingType === "SATIS";
  const description = isPurchase
    ? "Satıcıların ilanlarına verdiğin teklifler ve sonuçları."
    : "Açık ihalelere verdiğin tüm teklifler ve sonuçları.";
  const emptyHint = isPurchase
    ? "Satın Al ekranından bir ilana teklif verdiğinde burada görünür."
    : "Açık ihaleler ekranından bir ihaleye teklif verdiğinde burada görünür.";
  const fromHref = isPurchase
    ? "/company/satinalma/tekliflerim"
    : "/company/satis/tekliflerim";

  const all = useMemo(
    () => (data ?? []).filter((b) => b.listing.type === listingType),
    [data, listingType],
  );

  const filtered = useMemo(() => {
    const rangeMs = range === "all" ? null : Number(range) * 86_400_000;
    const now = Date.now();
    const rows = all.filter((b) => {
      if (!matchesSearch(b, search)) return false;
      if (status !== "all" && b.status !== status) return false;
      if (rangeMs !== null && now - new Date(b.createdAt).getTime() > rangeMs)
        return false;
      return true;
    });
    const out = [...rows];
    if (sort === "oldest") {
      out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } else if (sort === "amount") {
      out.sort((a, b) => Number(b.amount) - Number(a.amount));
    } else {
      out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return out;
  }, [all, search, status, sort, range]);

  const isFiltered = search !== "" || status !== "all" || range !== "all";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  function resetToFirstPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setPage(1);
      setter(v);
    };
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Tekliflerim" description={description} />

      {/* Arama + filtreler — diğer listelerle aynı düzen: üstte tam-genişlik
          arama + sıralama, altta ikonlu filtre pill'leri + sonuç sayacı. */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={resetToFirstPage(setSearch)}
            placeholder={
              isPurchase
                ? "İlan adı, numarası veya satıcı ara…"
                : "İhale adı, numarası veya alıcı ara…"
            }
            className="flex-1"
          />
          <FilterSelect
            icon={ArrowUpDown}
            value={sort}
            onChange={resetToFirstPage(setSort)}
            options={SORT_OPTIONS}
            ariaLabel="Sıralama"
            active={sort !== "newest"}
            className="sm:min-w-[160px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            icon={ListFilter}
            value={status}
            onChange={resetToFirstPage(setStatus)}
            options={STATUS_FILTER_OPTIONS}
            ariaLabel="Duruma göre filtrele"
            active={status !== "all"}
          />
          <FilterSelect
            icon={CalendarRange}
            value={range}
            onChange={resetToFirstPage(setRange)}
            options={RANGE_OPTIONS}
            ariaLabel="Tarih aralığı"
            active={range !== "all"}
          />
          <ResultCount
            total={filtered.length}
            isFiltered={isFiltered}
            unit="teklif"
            className="ml-auto"
          />
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={isFiltered ? CircleSlash : Gavel}
          variant={isFiltered ? "no-results" : "no-data"}
          title={isFiltered ? "Eşleşen teklif yok" : "Henüz teklif vermedin"}
          description={
            isFiltered ? "Filtreleri değiştirip tekrar dene." : emptyHint
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {pageRows.map((b) => (
              <MyBidCard key={b.id} b={b} fromHref={fromHref} />
            ))}
          </div>
          {totalPages > 1 ? (
            <Pagination
              variant="bare"
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
