"use client";

import {
  EmptyState as EmptyStateComponent,
  FilterSelect,
  ListSkeleton,
  PageHeader,
  Pagination,
  ResultCount,
  SearchInput,
} from "@/components/list";
import {
  CounterpartDropdown,
  RangeDropdown,
} from "@/components/orders/filter-dropdowns";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useOrderCounterparts,
  useOrders,
  useOrderStats,
} from "@/hooks/use-tenant-orders";
import { ORDER_STATUS_META } from "@/lib/orders/status";
import type {
  OrderDateRange,
  OrderStats,
  OrderStatus,
} from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertCircle,
  ArrowUpDown,
  Building2,
  ListFilter,
  Package,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const TABS: Array<{ key: string; label: string; status?: OrderStatus }> = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Onay Bekliyor", status: "PENDING" },
  { key: "accepted", label: "Onaylandı", status: "ACCEPTED" },
  { key: "in_delivery", label: "Gönderildi", status: "IN_DELIVERY" },
  { key: "delivered", label: "Ödeme Bekliyor", status: "DELIVERED" },
  { key: "completed", label: "Tamamlandı", status: "COMPLETED" },
  { key: "rejected", label: "Reddedildi", status: "REJECTED" },
  { key: "cancelled", label: "İptal Edildi", status: "CANCELLED" },
];

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "En Yeni" },
  { value: "createdAt:asc", label: "En Eski" },
  { value: "totalAmount:desc", label: "Tutar (Yüksek → Düşük)" },
  { value: "totalAmount:asc", label: "Tutar (Düşük → Yüksek)" },
];


const STATUS_COUNT_KEY: Record<string, keyof OrderStats> = {
  all: "total",
  pending: "pending",
  accepted: "accepted",
  in_delivery: "inDelivery",
  delivered: "delivered",
  completed: "completed",
  rejected: "rejected",
  cancelled: "cancelled",
};

function StatusDropdown({
  value,
  onChange,
  stats,
}: {
  value: string;
  onChange: (value: string) => void;
  stats: OrderStats | undefined;
}) {
  return (
    <FilterSelect
      icon={ListFilter}
      value={value}
      onChange={onChange}
      ariaLabel="Sipariş durumu filtresi"
      active={value !== "all"}
      options={TABS.map((t) => ({
        value: t.key,
        label: `${t.label}${
          stats ? ` (${stats[STATUS_COUNT_KEY[t.key] ?? "total"]})` : ""
        }`,
      }))}
    />
  );
}

function formatMoney(value: string | number, currency: string): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "—";
  try {
    return num.toLocaleString("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    });
  } catch {
    return `${num.toFixed(2)} ${currency}`;
  }
}

export function OrdersListView() {
  const router = useRouter();
  const params = useSearchParams();
  const { has } = usePermissions();
  // V2-6.5 — "İhale Oluştur" butonu sadece tender:create yetkisi olan
  // (BUYER) kullanıcıya gösterilir. Yönetici ve Onaylayıcı için yasak.
  const canCreateTender = has("tender:create");

  const tab = params.get("tab") ?? "all";
  const searchUrl = params.get("search") ?? "";
  const sortUrl = params.get("sort") ?? "createdAt:desc";
  const rangeUrl = (params.get("range") as OrderDateRange | null) ?? "all";
  const supplierIdUrl = params.get("supplierId") ?? "";
  const page = Number(params.get("page") ?? 1);

  const replaceUrl = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all" && value !== "") next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.replace(`/dashboard/siparisler?${next.toString()}`);
  };

  const setSearch = (value: string) => replaceUrl("search", value);
  const setSort = (value: string) => {
    // sort'un default'u "createdAt:desc"; bu zaman delete edilebilir
    const next = new URLSearchParams(params.toString());
    next.set("sort", value);
    next.delete("page");
    router.replace(`/dashboard/siparisler?${next.toString()}`);
  };
  const setRange = (value: string) => replaceUrl("range", value);
  const setSupplierId = (value: string) => replaceUrl("supplierId", value);

  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0]!;

  const stats = useOrderStats();
  const counterparts = useOrderCounterparts();
  const list = useOrders({
    status: activeTab.status,
    search: searchUrl || undefined,
    supplierId: supplierIdUrl || undefined,
    range: rangeUrl,
    sort: sortUrl,
    page,
  });

  const isFiltered =
    Boolean(searchUrl) ||
    Boolean(activeTab.status) ||
    Boolean(supplierIdUrl) ||
    rangeUrl !== "all";

  const setTab = (next: string) => {
    const url = new URLSearchParams(params.toString());
    url.set("tab", next);
    url.delete("page");
    router.replace(`/dashboard/siparisler?${url.toString()}`);
  };

  const setPage = (next: number) => {
    const url = new URLSearchParams(params.toString());
    url.set("page", String(next));
    router.replace(`/dashboard/siparisler?${url.toString()}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Siparişler"
        description="İhalelerinizden çıkan siparişler buradan takip edilir."
      />

      {/* Arama + filtreler — kutusuz, pill-tarzı */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={searchUrl}
            onChange={setSearch}
            placeholder="Sipariş no, ihale veya tedarikçi…"
            className="flex-1"
          />
          <FilterSelect
            icon={ArrowUpDown}
            value={sortUrl}
            onChange={setSort}
            options={SORT_OPTIONS}
            ariaLabel="Sıralama"
            active={sortUrl !== "createdAt:desc"}
            className="sm:min-w-[180px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusDropdown value={tab} onChange={setTab} stats={stats.data} />
          <RangeDropdown value={rangeUrl} onChange={setRange} />
          <CounterpartDropdown
            value={supplierIdUrl}
            onChange={setSupplierId}
            options={counterparts.data ?? []}
            loading={counterparts.isLoading}
            placeholder="Tüm Tedarikçiler"
          />
          {list.data ? (
            <ResultCount
              total={list.data.pagination.total}
              isFiltered={isFiltered}
              unit="sipariş"
              className="ml-auto"
            />
          ) : null}
        </div>
      </div>

      {/* List */}
      {list.isLoading && !list.data ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <ListSkeleton rows={5} />
        </div>
      ) : !list.data ? (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-danger-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-danger-700">Siparişler yüklenemedi.</p>
        </div>
      ) : list.data.items.length === 0 ? (
        isFiltered ? (
          <EmptyStateComponent
            icon={Package}
            variant="no-results"
            title="Filtre eşleşmedi"
            description="Aramanız veya seçtiğiniz statü ile eşleşen sipariş bulunamadı."
            action={
              <button
                type="button"
                onClick={() => router.replace("/dashboard/siparisler")}
                className="text-sm text-brand-600 hover:underline font-semibold"
              >
                Filtreleri temizle
              </button>
            }
          />
        ) : (
          <EmptyStateComponent
            icon={Package}
            variant="no-data"
            title="Henüz sipariş yok"
            description="Bir ihale kazandırdığınızda otomatik olarak burada sipariş(ler) oluşturulacak."
            action={
              canCreateTender ? (
                <Link href="/dashboard/ihaleler/yeni">
                  <Button variant="primary" size="sm">
                    <Plus className="w-4 h-4" />
                    İhale Oluştur
                  </Button>
                </Link>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <OrdersTable orders={list.data.items} />
          {list.data.pagination.totalPages > 1 ? (
            <Pagination
              variant="bare"
              page={list.data.pagination.page}
              totalPages={list.data.pagination.totalPages}
              total={list.data.pagination.total}
              pageSize={list.data.pagination.pageSize}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function OrdersTable({
  orders,
}: {
  orders: import("@/lib/tenders/types").OrderListItem[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </div>
  );
}

function OrderCard({
  order,
}: {
  order: import("@/lib/tenders/types").OrderListItem;
}) {
  const { active, lastDone, isTerminated } = getStageState(order.status);
  const stages = ["Oluşturuldu", "Onaylandı", "Gönderildi", "Tamamlandı"];

  return (
    <Link
      href={`/dashboard/siparisler/${order.id}`}
      className="group block bg-white border border-slate-200 rounded-2xl p-5 hover:border-brand-300 hover:shadow-md transition-all"
    >
      {/* Header: order no + status */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-slate-500 tracking-wide">
            {order.orderNumber}
          </p>
          <p className="font-semibold text-brand-900 line-clamp-2 mt-0.5 leading-snug group-hover:text-brand-700">
            {order.tender.title}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {/* Supplier + amount */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
          <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="truncate font-medium">
            {order.supplier?.companyName ?? "—"}
          </span>
        </div>
        <p className="text-base font-bold text-success-700 font-mono tabular-nums whitespace-nowrap">
          {formatMoney(order.totalAmount, order.currency)}
        </p>
      </div>

      {/* 4-stage progress bar */}
      {!isTerminated ? (
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center gap-1">
            {stages.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition",
                  i === active
                    ? "bg-brand-500"
                    : i <= lastDone
                      ? "bg-success-500"
                      : "bg-slate-200",
                )}
              />
            ))}
          </div>
          <div className="flex items-center justify-between text-[10px] font-medium text-slate-500 tracking-tight">
            {stages.map((label, i) => (
              <span
                key={label}
                className={cn(
                  "w-1/4 text-center first:text-left last:text-right truncate",
                  i === active && "text-brand-700",
                  i < active && "text-success-700",
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
          {order.status === "REJECTED"
            ? "Tedarikçi reddetti"
            : "Sipariş iptal edildi"}
        </div>
      )}

      {/* Footer: tender link + date */}
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500 pt-2 border-t border-slate-100">
        <span className="font-mono truncate">
          {order.tender.tenderNumber}
        </span>
        <span className="whitespace-nowrap">
          {format(new Date(order.createdAt), "d MMM yyyy", { locale: tr })}
        </span>
      </div>
    </Link>
  );
}

function getStageState(status: string): {
  active: number;
  lastDone: number;
  isTerminated: boolean;
} {
  if (status === "REJECTED" || status === "CANCELLED")
    return { active: -1, lastDone: 0, isTerminated: true };
  if (status === "PENDING") return { active: 0, lastDone: 0, isTerminated: false };
  if (status === "ACCEPTED") return { active: 1, lastDone: 1, isTerminated: false };
  if (status === "IN_DELIVERY" || status === "IN_PROGRESS")
    return { active: 2, lastDone: 2, isTerminated: false };
  if (status === "COMPLETED" || status === "DELIVERED")
    return { active: 3, lastDone: 3, isTerminated: false };
  return { active: 0, lastDone: 0, isTerminated: false };
}

// Re-export ORDER_STATUS_META so the ESLint detects the import is used in
// OrderStatusBadge — kept for future tab badges.
void ORDER_STATUS_META;
