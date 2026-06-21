"use client";

import { Input, InputGroup } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { EmptyState, PageHeader, Pagination } from "@/components/list";
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
import type { OrderDateRange, OrderStatus } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import {
  CheckCircle2,
  Clock,
  Inbox,
  Package,
  ThumbsUp,
  Truck,
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

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MiniKpi
          label="Toplam"
          value={stats.data?.total ?? 0}
          icon={Package}
          accent="bg-slate-100 text-slate-600"
          loading={stats.isLoading}
        />
        <MiniKpi
          label="Onay Bekliyor"
          value={stats.data?.pending ?? 0}
          icon={Clock}
          accent="bg-amber-50 text-amber-600"
          loading={stats.isLoading}
        />
        <MiniKpi
          label="Onaylandı"
          value={stats.data?.accepted ?? 0}
          icon={ThumbsUp}
          accent="bg-zinc-50 text-zinc-600"
          loading={stats.isLoading}
        />
        <MiniKpi
          label="Gönderildi"
          value={stats.data?.inDelivery ?? 0}
          icon={Truck}
          accent="bg-zinc-50 text-zinc-600"
          loading={stats.isLoading}
        />
        <MiniKpi
          label="Tamamlanan"
          value={stats.data?.completed ?? 0}
          icon={CheckCircle2}
          accent="bg-emerald-50 text-emerald-600"
          loading={stats.isLoading}
        />
      </div>

      {/* Toolbar — geniş arama üstte, filtreler altta */}
      <PanelCard padding="sm">
        <div className="space-y-3">
          {/* Üst satır: geniş arama + sıralama */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
            <Select
              value={sort}
              onChange={(e) => updateUrl({ sort: e.target.value })}
              aria-label="Sıralama"
              className="sm:w-44"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Alt satır: filtreler + sonuç sayısı */}
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={statusKey}
              onChange={(e) => updateUrl({ status: e.target.value })}
              aria-label="Sipariş durumu filtresi"
              className="w-full sm:w-auto sm:min-w-[160px]"
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </Select>

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
      </PanelCard>

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

function MiniKpi({
  label,
  value,
  icon: Icon,
  accent,
  loading,
}: {
  label: string;
  value: number;
  icon: typeof Package;
  accent: string;
  loading: boolean;
}) {
  return (
    <div className="bg-white ring-1 ring-zinc-950/5 rounded-xl shadow-sm p-3 flex items-center gap-3">
      <div
        className={cn(
          "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0",
          accent,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
          {label}
        </p>
        <p className="text-xl font-bold text-zinc-900 tabular-nums leading-tight">
          {loading ? "…" : value}
        </p>
      </div>
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
