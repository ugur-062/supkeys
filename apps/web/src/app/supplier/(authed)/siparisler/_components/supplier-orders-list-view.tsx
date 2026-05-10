"use client";

import { PanelCard } from "@/components/supplier/panel-card";
import {
  useSupplierOrderStats,
  useSupplierOrders,
} from "@/hooks/use-supplier-orders";
import type { OrderStatus } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Clock,
  Inbox,
  Package,
  Search,
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
  { key: "PENDING", status: "PENDING", label: "Bekliyor", icon: Clock },
  {
    key: "IN_DELIVERY",
    status: "IN_DELIVERY",
    label: "Teslimat Sürüyor",
    icon: Truck,
  },
  {
    key: "COMPLETED",
    status: "COMPLETED",
    label: "Tamamlandı",
    icon: CheckCircle2,
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
  const page = Math.max(1, Number(params.get("page") ?? 1));

  const stats = useSupplierOrderStats();

  const queryParams = useMemo(() => {
    const status =
      statusKey !== "all" ? (statusKey as OrderStatus) : undefined;
    return {
      status,
      search: search || undefined,
      sort,
      page,
      pageSize: PAGE_SIZE,
    };
  }, [statusKey, search, sort, page]);

  const list = useSupplierOrders(queryParams);

  const updateUrl = (next: {
    status?: string;
    search?: string;
    sort?: string;
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
      <header>
        <h1 className="font-display font-bold text-3xl text-brand-900">
          Siparişler
        </h1>
        <p className="text-slate-600 mt-1 text-sm">
          Kazandığınız ihalelerden oluşan siparişler.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi
          label="Toplam"
          value={stats.data?.total ?? 0}
          icon={Package}
          accent="bg-slate-100 text-slate-600"
          loading={stats.isLoading}
        />
        <MiniKpi
          label="Bekleyen"
          value={stats.data?.pending ?? 0}
          icon={Clock}
          accent="bg-blue-50 text-blue-600"
          loading={stats.isLoading}
        />
        <MiniKpi
          label="Teslimatta"
          value={stats.data?.inDelivery ?? 0}
          icon={Truck}
          accent="bg-amber-50 text-amber-600"
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-3">
          <PanelCard padding="sm" className="lg:sticky lg:top-4">
            <div className="relative mb-4">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => updateUrl({ search: e.target.value })}
                placeholder="Sipariş ara..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
              />
            </div>

            <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
              Durum
            </h3>
            <div className="space-y-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  type="button"
                  key={f.key}
                  onClick={() => updateUrl({ status: f.key })}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 text-sm transition-colors",
                    statusKey === f.key
                      ? "bg-brand-50 text-brand-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <f.icon
                    className={cn(
                      "h-4 w-4 flex-shrink-0",
                      statusKey === f.key
                        ? "text-brand-600"
                        : "text-slate-400",
                    )}
                  />
                  <span className="flex-1">{f.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
                Sıralama
              </h3>
              <select
                value={sort}
                onChange={(e) => updateUrl({ sort: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none bg-white"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </PanelCard>
        </aside>

        <main className="lg:col-span-9">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-slate-500">
              {list.isLoading
                ? "Yükleniyor…"
                : `${totalCount.toLocaleString("tr-TR")} sipariş${search || statusKey !== "all" ? " (filtrelenmiş)" : ""}`}
            </p>
          </div>

          {list.isError ? (
            <PanelCard className="text-center py-12">
              <p className="text-brand-900 font-medium mb-2">Veri alınamadı</p>
              <button
                type="button"
                onClick={() => list.refetch()}
                className="text-sm text-brand-700 hover:underline"
              >
                Tekrar dene
              </button>
            </PanelCard>
          ) : list.isLoading ? (
            <CardGridSkeleton />
          ) : items.length === 0 ? (
            <PanelCard className="text-center py-16">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Inbox className="h-5 w-5 text-slate-400" />
              </div>
              <p className="font-semibold text-brand-900">
                {search
                  ? "Aramayla eşleşen sipariş yok"
                  : statusKey === "all"
                    ? "Henüz sipariş yok"
                    : "Bu durumda sipariş yok"}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Bir ihale kazandığınızda sipariş otomatik oluşur.
              </p>
            </PanelCard>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((o) => (
                  <OrderCard key={o.id} order={o} />
                ))}
              </div>

              {totalPages > 1 ? (
                <div className="mt-6 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => updateUrl({ page: page - 1 })}
                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Önceki
                  </button>
                  <span className="text-sm text-slate-600 px-3">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => updateUrl({ page: page + 1 })}
                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Sonraki
                  </button>
                </div>
              ) : null}
            </>
          )}
        </main>
      </div>
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
    <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm p-3 flex items-center gap-3">
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
        <p className="text-xl font-bold text-brand-900 tabular-nums leading-tight">
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
          className="bg-white border border-slate-200/80 rounded-2xl p-5 animate-pulse"
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
