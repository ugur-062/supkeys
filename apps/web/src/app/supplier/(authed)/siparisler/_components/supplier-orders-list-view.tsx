"use client";

import { Input, InputGroup } from "@/components/catalyst/input";
import {
  EmptyState,
  FilterSelect,
  PageHeader,
  Pagination,
} from "@/components/list";
import {
  CounterpartDropdown,
  RangeDropdown,
} from "@/components/orders/filter-dropdowns";
import { PanelCard } from "@/components/supplier/panel-card";
import {
  useSupplierOrderCounterparts,
  useSupplierOrderStats,
  useSupplierOrders,
} from "@/hooks/use-supplier-orders";
import type {
  OrderDateRange,
  OrderStats,
  OrderStatus,
} from "@/lib/tenders/types";

const STATUS_COUNT_KEY: Record<string, keyof OrderStats> = {
  all: "total",
  PENDING: "pending",
  ACCEPTED: "accepted",
  IN_DELIVERY: "inDelivery",
  DELIVERED: "delivered",
  COMPLETED: "completed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import {
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Inbox,
  ListFilter,
  Package,
  ThumbsUp,
  Truck,
  Wallet,
  XCircle,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { OrderCard } from "./order-card";

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "En Yeni" },
  { value: "createdAt:asc", label: "En Eski" },
  { value: "totalAmount:desc", label: "Tutar (Y→D)" },
  { value: "totalAmount:asc", label: "Tutar (D→Y)" },
];

const STATUS_FILTERS: Array<{
  key: string;
  status?: OrderStatus;
  label: string;
  icon: typeof Package;
}> = [
  { key: "all", label: "Tümü", icon: Inbox },
  {
    key: "PENDING",
    status: "PENDING",
    label: "Onay Bekliyor",
    icon: Clock,
  },
  {
    key: "ACCEPTED",
    status: "ACCEPTED",
    label: "Onaylandı",
    icon: ThumbsUp,
  },
  {
    key: "IN_DELIVERY",
    status: "IN_DELIVERY",
    label: "Gönderildi",
    icon: Truck,
  },
  {
    key: "DELIVERED",
    status: "DELIVERED",
    label: "Ödeme Bekliyor",
    icon: Wallet,
  },
  {
    key: "COMPLETED",
    status: "COMPLETED",
    label: "Tamamlandı",
    icon: CheckCircle2,
  },
  {
    key: "REJECTED",
    status: "REJECTED",
    label: "Reddedildi",
    icon: XCircle,
  },
  {
    key: "CANCELLED",
    status: "CANCELLED",
    label: "İptal Edildi",
    icon: XCircle,
  },
];

const PAGE_SIZE = 20;

export function SupplierOrdersListView() {
  const router = useRouter();
  const params = useSearchParams();

  const statusKey = params.get("status") ?? "all";
  const search = params.get("search") ?? "";
  const sort = params.get("sort") ?? "createdAt:desc";
  const range = (params.get("range") as OrderDateRange | null) ?? "all";
  const tenantIdFilter = params.get("tenantId") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1));

  const stats = useSupplierOrderStats();
  const counterparts = useSupplierOrderCounterparts();

  const queryParams = useMemo(() => {
    const status =
      statusKey !== "all" ? (statusKey as OrderStatus) : undefined;
    return {
      status,
      search: search || undefined,
      tenantId: tenantIdFilter || undefined,
      range,
      sort,
      page,
      pageSize: PAGE_SIZE,
    };
  }, [statusKey, search, sort, range, tenantIdFilter, page]);

  const list = useSupplierOrders(queryParams);

  const updateUrl = (next: {
    status?: string;
    search?: string;
    sort?: string;
    range?: string;
    tenantId?: string;
    page?: number;
  }) => {
    const p = new URLSearchParams(params.toString());
    if (next.status !== undefined) {
      if (next.status === "all") p.delete("status");
      else p.set("status", next.status);
      p.delete("page");
    }
    if (next.search !== undefined) {
      if (next.search === "") p.delete("search");
      else p.set("search", next.search);
      p.delete("page");
    }
    if (next.sort !== undefined) {
      if (next.sort === "createdAt:desc") p.delete("sort");
      else p.set("sort", next.sort);
      p.delete("page");
    }
    if (next.range !== undefined) {
      if (next.range === "all") p.delete("range");
      else p.set("range", next.range);
      p.delete("page");
    }
    if (next.tenantId !== undefined) {
      if (next.tenantId === "") p.delete("tenantId");
      else p.set("tenantId", next.tenantId);
      p.delete("page");
    }
    if (next.page !== undefined) {
      if (next.page <= 1) p.delete("page");
      else p.set("page", String(next.page));
    }
    const qs = p.toString();
    router.replace(qs ? `/supplier/siparisler?${qs}` : "/supplier/siparisler");
  };

  const items = list.data?.items ?? [];
  const totalCount = list.data?.pagination.total ?? 0;
  const totalPages = list.data?.pagination.totalPages ?? 1;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Siparişler"
        description="Kazandığınız ihalelerden oluşan siparişler."
      />

      {/* Arama + filtreler — kutusuz, pill-tarzı */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex-1">
            <InputGroup>
              <MagnifyingGlassIcon data-slot="icon" />
              <Input
                value={search}
                onChange={(e) => updateUrl({ search: e.target.value })}
                placeholder="Sipariş ara..."
              />
            </InputGroup>
          </div>
          <FilterSelect
            icon={ArrowUpDown}
            value={sort}
            onChange={(v) => updateUrl({ sort: v })}
            options={SORT_OPTIONS}
            ariaLabel="Sıralama"
            active={sort !== "createdAt:desc"}
            className="sm:min-w-[150px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            icon={ListFilter}
            value={statusKey}
            onChange={(v) => updateUrl({ status: v })}
            ariaLabel="Sipariş durumu filtresi"
            active={statusKey !== "all"}
            options={STATUS_FILTERS.map((f) => ({
              value: f.key,
              label: `${f.label}${
                stats.data
                  ? ` (${stats.data[STATUS_COUNT_KEY[f.key] ?? "total"]})`
                  : ""
              }`,
            }))}
          />

          <RangeDropdown
            value={range}
            onChange={(v) => updateUrl({ range: v })}
          />

          <CounterpartDropdown
            value={tenantIdFilter}
            onChange={(v) => updateUrl({ tenantId: v })}
            options={counterparts.data ?? []}
            loading={counterparts.isLoading}
            placeholder="Tüm Müşteriler"
          />

          <p className="ml-auto whitespace-nowrap text-xs text-zinc-500">
              {list.isLoading
                ? "Yükleniyor…"
                : `${totalCount.toLocaleString("tr-TR")} sipariş${
                    search ||
                    statusKey !== "all" ||
                    range !== "all" ||
                    tenantIdFilter
                      ? " (filtrelenmiş)"
                      : ""
                  }`}
            </p>
          </div>
      </div>

      {/* Sipariş grid */}
      {list.isError ? (
        <PanelCard className="text-center py-12">
          <p className="text-zinc-900 font-medium mb-2">Veri alınamadı</p>
          <button
            type="button"
            onClick={() => list.refetch()}
            className="text-sm text-zinc-700 hover:underline"
          >
            Tekrar dene
          </button>
        </PanelCard>
      ) : list.isLoading ? (
        <CardGridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          variant={search ? "no-results" : "no-data"}
          title={
            search
              ? "Aramayla eşleşen sipariş yok"
              : statusKey === "all"
                ? "Henüz sipariş yok"
                : "Bu durumda sipariş yok"
          }
          description="Bir ihale kazandığınızda sipariş otomatik oluşur."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>

          {totalPages > 1 ? (
            <Pagination
              variant="bare"
              page={page}
              totalPages={totalPages}
              total={totalCount}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => updateUrl({ page: p })}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-white ring-1 ring-zinc-950/5 rounded-2xl p-5 animate-pulse"
        >
          <div className="h-3 bg-slate-200 rounded w-24 mb-2" />
          <div className="h-5 bg-slate-200 rounded w-full mb-3" />
          <div className="h-4 bg-slate-200 rounded w-3/4 mb-4" />
          <div className="h-2 bg-slate-200 rounded w-full" />
        </div>
      ))}
    </div>
  );
}
