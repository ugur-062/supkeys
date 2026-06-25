"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { NewListingDialog } from "@/components/company/new-listing-dialog";
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
import {
  useBrowseListings,
  useMyListings,
  type BrowseListing,
  type Listing,
  type ListingStatus,
  type ListingType,
} from "@/hooks/use-company-listings";
import { PlusIcon } from "@heroicons/react/20/solid";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { CircleSlash, Inbox, Lock, Package } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const PAGE_SIZE = 10;

const STATUS_LABEL: Record<ListingStatus, string> = {
  DRAFT: "Taslak",
  OPEN: "Açık",
  CLOSED: "Kapandı",
  AWARDED: "Kazandırıldı",
  CANCELLED: "İptal",
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Tüm durumlar" },
  { value: "DRAFT", label: "Taslak" },
  { value: "OPEN", label: "Açık" },
  { value: "CLOSED", label: "Kapandı" },
  { value: "AWARDED", label: "Kazandırıldı" },
  { value: "CANCELLED", label: "İptal" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "En yeni" },
  { value: "oldest", label: "En eski" },
  { value: "title", label: "Başlık (A→Z)" },
];

function matchesSearch(l: { title: string; number: string | null }, q: string) {
  if (!q) return true;
  const needle = q.toLocaleLowerCase("tr");
  return (
    l.title.toLocaleLowerCase("tr").includes(needle) ||
    (l.number ?? "").toLocaleLowerCase("tr").includes(needle)
  );
}

function sortListings<T extends { title: string; createdAt: string }>(
  rows: T[],
  sort: string,
): T[] {
  const out = [...rows];
  if (sort === "oldest") {
    out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } else if (sort === "title") {
    out.sort((a, b) => a.title.localeCompare(b.title, "tr"));
  } else {
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return out;
}

/** Kendi ilanlarım (portal türüne göre filtreli) + oluştur. */
export function MyListings({
  type,
  title,
  createLabel,
  emptyHint,
  createHref,
}: {
  type: ListingType;
  title: string;
  createLabel: string;
  emptyHint: string;
  /** Verilirse "oluştur" butonu bu sayfaya yönlendirir (çok-adımlı wizard);
   *  yoksa basit dialog açılır. */
  createHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);

  const mine = useMyListings();

  const all = useMemo(
    () => (mine.data ?? []).filter((l) => l.type === type),
    [mine.data, type],
  );

  const filtered = useMemo(() => {
    const rows = all.filter(
      (l) =>
        matchesSearch(l, search) && (status === "all" || l.status === status),
    );
    return sortListings(rows, sort);
  }, [all, search, status, sort]);

  const isFiltered = search !== "" || status !== "all";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const createButton = createHref ? (
    <Button href={createHref}>
      <PlusIcon data-slot="icon" />
      {createLabel}
    </Button>
  ) : (
    <Button onClick={() => setOpen(true)}>
      <PlusIcon data-slot="icon" />
      {createLabel}
    </Button>
  );

  // Sayfa/filtre değişince geçersiz sayfada kalmayı önle
  function resetToFirstPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setPage(1);
      setter(v);
    };
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={title} action={createButton} />

      {all.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={resetToFirstPage(setSearch)}
              placeholder="İlan ara…"
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
          <ResultCount total={filtered.length} isFiltered={isFiltered} unit="ilan" />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-950/10 bg-white">
        {mine.isLoading ? (
          <ListSkeleton rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={isFiltered ? CircleSlash : Package}
            variant={isFiltered ? "no-results" : "no-data"}
            title={isFiltered ? "Eşleşen ilan yok" : "Henüz ilan yok"}
            description={isFiltered ? "Filtreleri değiştirip tekrar dene." : emptyHint}
            action={isFiltered ? undefined : createButton}
          />
        ) : (
          <>
            <div className="divide-y divide-zinc-950/5">
              {pageRows.map((l) => (
                <Link
                  key={l.id}
                  href={`/company/ilan/${l.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">
                      {l.title}
                    </div>
                    <div className="text-xs text-zinc-500">
                      <span className="font-mono">{l.number ?? "—"}</span>
                      {" · "}
                      {l.visibility === "PUBLIC" ? "herkese açık" : "bağlantılar"}
                      {" · "}
                      {format(new Date(l.createdAt), "dd MMM yyyy", { locale: tr })}
                    </div>
                  </div>
                  <Badge color="zinc">{STATUS_LABEL[l.status]}</Badge>
                </Link>
              ))}
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

      <NewListingDialog
        open={open}
        onClose={() => setOpen(false)}
        fixedType={type}
      />
    </div>
  );
}

/** Bana açık ilanlar (browse) — portal türüne göre filtreli. */
export function BrowseListings({
  type,
  title,
  emptyHint,
}: {
  type: ListingType;
  title: string;
  emptyHint: string;
}) {
  const [search, setSearch] = useState("");
  const [bid, setBid] = useState("all");
  const [page, setPage] = useState(1);

  const browse = useBrowseListings();

  const all = useMemo(
    () => (browse.data ?? []).filter((l) => l.type === type),
    [browse.data, type],
  );

  const filtered = useMemo(() => {
    const rows = all.filter(
      (l) =>
        matchesSearch(l, search) &&
        (bid === "all" ||
          (bid === "biddable" ? l.canBid : !l.canBid)),
    );
    return sortListings(rows, "newest");
  }, [all, search, bid]);

  const isFiltered = search !== "" || bid !== "all";
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
      <PageHeader title={title} />

      {all.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={resetToFirstPage(setSearch)}
              placeholder="İlan ara…"
              className="w-full sm:w-64"
            />
            <FilterSelect
              value={bid}
              onChange={resetToFirstPage(setBid)}
              options={[
                { value: "all", label: "Tümü" },
                { value: "biddable", label: "Teklif verebilirim" },
                { value: "locked", label: "Premium gerekir" },
              ]}
              ariaLabel="Teklif durumuna göre filtrele"
              active={bid !== "all"}
            />
          </div>
          <ResultCount total={filtered.length} isFiltered={isFiltered} unit="ilan" />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-950/10 bg-white">
        {browse.isLoading ? (
          <ListSkeleton rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={isFiltered ? CircleSlash : Inbox}
            variant={isFiltered ? "no-results" : "no-data"}
            title={isFiltered ? "Eşleşen ilan yok" : "Açık ilan yok"}
            description={isFiltered ? "Filtreleri değiştirip tekrar dene." : emptyHint}
          />
        ) : (
          <>
            <div className="divide-y divide-zinc-950/5">
              {pageRows.map((l: BrowseListing) => (
                <Link
                  key={l.id}
                  href={`/company/ilan/${l.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">
                      {l.title}
                    </div>
                    <div className="text-xs text-zinc-500">
                      <span className="font-mono">{l.number ?? "—"}</span>
                      {" · "}
                      {l.owner ? (
                        l.owner.name
                      ) : (
                        <span className="inline-flex items-center gap-1 italic">
                          <Lock className="h-3 w-3" /> Gizli firma
                        </span>
                      )}
                    </div>
                  </div>
                  {l.canBid ? (
                    <Badge color="green">Teklif verebilirsin</Badge>
                  ) : (
                    <Badge color="amber">Premium gerekir</Badge>
                  )}
                </Link>
              ))}
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
