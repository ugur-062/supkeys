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
import { useOrders, type CompanyOrder } from "@/hooks/use-company-orders";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { CircleSlash, PackageOpen } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const PAGE_SIZE = 10;

const STATUS_LABEL: Record<CompanyOrder["status"], string> = {
  PENDING: "Onay bekliyor",
  ACCEPTED: "Onaylandı",
  CREATED: "Yeni",
  IN_DELIVERY: "Kargoda",
  DELIVERED: "Teslim edildi",
  COMPLETED: "Tamamlandı",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal",
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Tüm durumlar" },
  { value: "PENDING", label: "Onay bekliyor" },
  { value: "ACCEPTED", label: "Onaylandı" },
  { value: "IN_DELIVERY", label: "Kargoda" },
  { value: "DELIVERED", label: "Teslim edildi" },
  { value: "COMPLETED", label: "Tamamlandı" },
  { value: "REJECTED", label: "Reddedildi" },
  { value: "CANCELLED", label: "İptal" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "En yeni" },
  { value: "oldest", label: "En eski" },
  { value: "amount", label: "Tutar (yüksek→düşük)" },
];

function matchesSearch(o: CompanyOrder, q: string) {
  if (!q) return true;
  const needle = q.toLocaleLowerCase("tr");
  return (
    (o.listingTitle ?? "").toLocaleLowerCase("tr").includes(needle) ||
    (o.number ?? "").toLocaleLowerCase("tr").includes(needle) ||
    o.counterparty.toLocaleLowerCase("tr").includes(needle)
  );
}

export function OrdersList({ role }: { role: "buyer" | "seller" }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useOrders();
  const isSeller = role === "seller";

  const all = useMemo(
    () => (data ?? []).filter((o) => o.role === role),
    [data, role],
  );

  const filtered = useMemo(() => {
    const rows = all.filter(
      (o) =>
        matchesSearch(o, search) && (status === "all" || o.status === status),
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

  const emptyHint = isSeller
    ? "Henüz satış siparişin yok. Bir satış ilanın veya ihale teklifin kazandığında burada görünür."
    : "Henüz alım siparişin yok. Bir ihaleni kazandırdığında veya satın aldığında burada görünür.";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Siparişlerim" />

      {all.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={resetToFirstPage(setSearch)}
              placeholder="Sipariş ara…"
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
          <ResultCount
            total={filtered.length}
            isFiltered={isFiltered}
            unit="sipariş"
          />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-950/10 bg-white">
        {isLoading ? (
          <ListSkeleton rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={isFiltered ? CircleSlash : PackageOpen}
            variant={isFiltered ? "no-results" : "no-data"}
            title={isFiltered ? "Eşleşen sipariş yok" : "Henüz sipariş yok"}
            description={isFiltered ? "Filtreleri değiştirip tekrar dene." : emptyHint}
          />
        ) : (
          <>
            <div className="divide-y divide-zinc-950/5">
              {pageRows.map((o) => (
                <Link
                  key={o.id}
                  href={`/company/siparis/${o.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-zinc-50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge color={isSeller ? "emerald" : "blue"}>
                      {isSeller ? "🟢 Gönderiyorsun" : "🔵 Alıyorsun"}
                    </Badge>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">
                        {o.listingTitle ?? "—"}
                      </div>
                      <div className="text-xs text-zinc-500">
                        <span className="font-mono">{o.number}</span>
                        {" · "}
                        {isSeller ? "Alıcı" : "Satıcı"}: {o.counterparty}
                        {" · "}
                        {format(new Date(o.createdAt), "dd MMM yyyy", {
                          locale: tr,
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-zinc-900">
                      {Number(o.amount).toLocaleString("tr-TR")} ₺
                    </span>
                    <Badge color="zinc">{STATUS_LABEL[o.status]}</Badge>
                  </div>
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
