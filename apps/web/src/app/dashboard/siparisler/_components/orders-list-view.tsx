"use client";

import {
  EmptyState as EmptyStateComponent,
  ListSkeleton,
  ResultCount,
  SearchInput,
  SortDropdown,
} from "@/components/list";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { useOrders, useOrderStats } from "@/hooks/use-tenant-orders";
import { ORDER_STATUS_META } from "@/lib/orders/status";
import type { OrderStatus } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { AlertCircle, Building2, Filter, Package, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

const TABS: Array<{ key: string; label: string; status?: OrderStatus }> = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Onay Bekliyor", status: "PENDING" },
  { key: "accepted", label: "Onaylandı", status: "ACCEPTED" },
  { key: "in_delivery", label: "Gönderildi", status: "IN_DELIVERY" },
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

function StatusDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative w-full md:w-auto">
      <Filter className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Sipariş durumu filtresi"
        className={cn(
          "pl-9 pr-8 py-2 text-sm rounded-lg appearance-none bg-white cursor-pointer w-full md:min-w-[180px]",
          "border border-surface-border text-brand-900",
          "focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
        )}
      >
        {TABS.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
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
  const page = Number(params.get("page") ?? 1);

  const setSearch = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("search", value);
    else next.delete("search");
    next.delete("page");
    router.replace(`/dashboard/siparisler?${next.toString()}`);
  };

  const setSort = (value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("sort", value);
    next.delete("page");
    router.replace(`/dashboard/siparisler?${next.toString()}`);
  };

  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0]!;

  const stats = useOrderStats();
  const list = useOrders({
    status: activeTab.status,
    search: searchUrl || undefined,
    sort: sortUrl,
    page,
  });

  const isFiltered = Boolean(searchUrl) || Boolean(activeTab.status);

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

  const kpi = useMemo(() => {
    const s = stats.data;
    if (!s) return null;
    return [
      { label: "Toplam", value: s.total, color: "text-brand-900" },
      { label: "Onay Bekliyor", value: s.pending, color: "text-warning-700" },
      { label: "Onaylandı", value: s.accepted ?? 0, color: "text-brand-700" },
      {
        label: "Gönderildi",
        value: s.inDelivery ?? 0,
        color: "text-indigo-700",
      },
      {
        label: "Tamamlandı",
        value: s.completed,
        color: "text-success-700",
      },
    ];
  }, [stats.data]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-2xl md:text-3xl text-brand-900">
            Siparişler
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            İhalelerinizden çıkan siparişler buradan takip edilir.
          </p>
        </div>
      </header>

      {/* KPI cards */}
      {kpi ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {kpi.map((it) => (
            <div
              key={it.label}
              className="bg-white border border-slate-200 rounded-xl p-4"
            >
              <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">
                {it.label}
              </p>
              <p className={cn("text-2xl font-bold mt-1", it.color)}>
                {it.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Search + Status + Sort */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <SearchInput
          value={searchUrl}
          onChange={setSearch}
          placeholder="Sipariş no, ihale veya tedarikçi…"
          className="w-full md:w-80"
        />
        <StatusDropdown value={tab} onChange={setTab} />
        <SortDropdown value={sortUrl} onChange={setSort} options={SORT_OPTIONS} />
        {list.data ? (
          <ResultCount
            total={list.data.pagination.total}
            isFiltered={isFiltered}
            unit="sipariş"
            className="md:ml-auto"
          />
        ) : null}
      </div>

      {/* List */}
      {list.isLoading && !list.data ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <ListSkeleton rows={5} />
        </div>
      ) : list.isError || !list.data ? (
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
              page={list.data.pagination.page}
              totalPages={list.data.pagination.totalPages}
              onPage={setPage}
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

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <p className="text-sm text-slate-500">
        {page} / {totalPages} sayfa
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          Önceki
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Sonraki
        </Button>
      </div>
    </div>
  );
}

// Re-export ORDER_STATUS_META so the ESLint detects the import is used in
// OrderStatusBadge — kept for future tab badges.
void ORDER_STATUS_META;
