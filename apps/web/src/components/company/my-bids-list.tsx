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
  SortDropdown,
} from "@/components/list";
import { CountdownFull } from "@/components/tenders/countdown-full";
import { useMyBids, type MyBid } from "@/hooks/use-company-listings";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { CircleSlash, Gavel } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const PAGE_SIZE = 10;

const STATUS: Record<
  MyBid["status"],
  { label: string; color: "amber" | "green" | "zinc" | "red" }
> = {
  SUBMITTED: { label: "Değerlendirmede", color: "amber" },
  WON: { label: "Kazandı", color: "green" },
  LOST: { label: "Elendi", color: "zinc" },
  WITHDRAWN: { label: "Geri çekildi", color: "red" },
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Tüm durumlar" },
  { value: "SUBMITTED", label: "Değerlendirmede" },
  { value: "WON", label: "Kazandı" },
  { value: "LOST", label: "Elendi" },
  { value: "WITHDRAWN", label: "Geri çekildi" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "En yeni" },
  { value: "oldest", label: "En eski" },
  { value: "amount", label: "Tutar (yüksek→düşük)" },
];

function matchesSearch(b: MyBid, q: string) {
  if (!q) return true;
  const needle = q.toLocaleLowerCase("tr");
  return (
    b.listing.title.toLocaleLowerCase("tr").includes(needle) ||
    (b.listing.number ?? "").toLocaleLowerCase("tr").includes(needle)
  );
}

/** Firmanın açık ihalelere verdiği tüm teklifler — profesyonel liste. */
export function MyBidsList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useMyBids();

  const all = data ?? [];

  const filtered = useMemo(() => {
    const rows = all.filter(
      (b) =>
        matchesSearch(b, search) && (status === "all" || b.status === status),
    );
    const out = [...rows];
    if (sort === "oldest") {
      out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } else if (sort === "amount") {
      out.sort((a, b) => Number(b.amount) - Number(a.amount));
    } else {
      out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return out;
  }, [all, search, status, sort]);

  const isFiltered = search !== "" || status !== "all";
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
      <PageHeader
        title="Tekliflerim"
        description="Açık ihalelere verdiğin tüm teklifler ve sonuçları."
      />

      {all.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={resetToFirstPage(setSearch)}
              placeholder="İhale ara…"
              className="w-full sm:w-64"
            />
            <FilterSelect
              value={status}
              onChange={resetToFirstPage(setStatus)}
              options={STATUS_FILTER_OPTIONS}
              ariaLabel="Duruma göre filtrele"
              active={status !== "all"}
            />
            <SortDropdown
              value={sort}
              onChange={resetToFirstPage(setSort)}
              options={SORT_OPTIONS}
            />
          </div>
          <ResultCount total={filtered.length} isFiltered={isFiltered} unit="teklif" />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-950/10 bg-white">
        {isLoading ? (
          <ListSkeleton rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={isFiltered ? CircleSlash : Gavel}
            variant={isFiltered ? "no-results" : "no-data"}
            title={isFiltered ? "Eşleşen teklif yok" : "Henüz teklif vermedin"}
            description={
              isFiltered
                ? "Filtreleri değiştirip tekrar dene."
                : "Açık ihaleler ekranından bir ihaleye teklif verdiğinde burada görünür."
            }
          />
        ) : (
          <>
            <div className="divide-y divide-zinc-950/5">
              {pageRows.map((b) => {
                const st = STATUS[b.status];
                return (
                  <Link
                    key={b.id}
                    href={`/company/ilan/${b.listing.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-zinc-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">
                        {b.listing.title}
                      </div>
                      <div className="text-xs text-zinc-500">
                        <span className="font-mono">{b.listing.number ?? "—"}</span>
                        {" · "}
                        {format(new Date(b.createdAt), "dd MMM yyyy", {
                          locale: tr,
                        })}
                        {b.isBuyNow ? " · Hemen-Al" : ""}
                        {b.listing.status === "OPEN" && b.listing.closesAt ? (
                          <>
                            {" · "}
                            <CountdownFull
                              deadline={b.listing.closesAt}
                              endedLabel="Kapandı"
                            />
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-zinc-900">
                        {Number(b.amount).toLocaleString("tr-TR")} {b.currency}
                      </span>
                      <Badge color={st.color}>{st.label}</Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
            {totalPages > 1 ? (
              <Pagination
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
    </div>
  );
}
