"use client";

import { OrderStatusBadge } from "@/components/orders/status-badge";
import { Button } from "@/components/ui/button";
import { useOrders, useOrderStats } from "@/hooks/use-tenant-orders";
import { ORDER_STATUS_META } from "@/lib/orders/status";
import type { OrderStatus } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertCircle,
  Building2,
  Loader2,
  Package,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const TABS: Array<{ key: string; label: string; status?: OrderStatus }> = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Bekliyor", status: "PENDING" },
  { key: "accepted", label: "Kabul Edildi", status: "ACCEPTED" },
  { key: "in_progress", label: "Üretimde", status: "IN_PROGRESS" },
  { key: "delivered", label: "Teslim Edildi", status: "DELIVERED" },
  { key: "completed", label: "Tamamlandı", status: "COMPLETED" },
];

const TRIGGER_CLS = cn(
  "px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px transition whitespace-nowrap",
  "data-[state=active]:border-brand-500 data-[state=active]:text-brand-700",
  "data-[state=inactive]:border-transparent data-[state=inactive]:text-slate-500",
  "hover:text-slate-700 focus:outline-none",
);

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

  const tab = params.get("tab") ?? "all";
  const searchUrl = params.get("search") ?? "";
  const page = Number(params.get("page") ?? 1);

  const [searchInput, setSearchInput] = useState(searchUrl);
  const [debouncedSearch, setDebouncedSearch] = useState(searchUrl);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (debouncedSearch === searchUrl) return;
    const next = new URLSearchParams(params.toString());
    if (debouncedSearch) next.set("search", debouncedSearch);
    else next.delete("search");
    next.delete("page");
    router.replace(`/dashboard/siparisler?${next.toString()}`);
  }, [debouncedSearch, searchUrl, params, router]);

  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0]!;

  const stats = useOrderStats();
  const list = useOrders({
    status: activeTab.status,
    search: debouncedSearch || undefined,
    page,
  });

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
      { label: "Bekliyor", value: s.pending, color: "text-warning-700" },
      { label: "Üretimde", value: s.inProgress, color: "text-indigo-700" },
      {
        label: "Tamamlandı",
        value: s.completed + s.delivered,
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

      {/* Tabs + search */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <TabsPrimitive.Root value={tab} onValueChange={setTab}>
          <TabsPrimitive.List
            className="border-b border-slate-200 flex items-center gap-1 overflow-x-auto"
            aria-label="Sipariş statü filtresi"
          >
            {TABS.map((t) => (
              <TabsPrimitive.Trigger
                key={t.key}
                value={t.key}
                className={TRIGGER_CLS}
              >
                {t.label}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
        </TabsPrimitive.Root>

        <div className="relative w-full md:w-72 flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Sipariş no, ihale, tedarikçi…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={cn(
              "w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm",
              "focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
            )}
          />
        </div>
      </div>

      {/* List */}
      {list.isLoading && !list.data ? (
        <div className="py-16 flex items-center justify-center text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Siparişler yükleniyor…
        </div>
      ) : list.isError || !list.data ? (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-danger-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-danger-700">Siparişler yüklenemedi.</p>
        </div>
      ) : list.data.items.length === 0 ? (
        <EmptyState />
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
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                Sipariş No
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                Tedarikçi
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                İhale
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700">
                Toplam
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                Statü
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                Tarih
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={order.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition cursor-pointer"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/siparisler/${order.id}`}
                    className="font-mono font-bold text-brand-700 hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="truncate font-medium text-brand-900">
                      {order.supplier?.companyName ?? "—"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <Link
                    href={`/dashboard/ihaleler/${order.tender.id}`}
                    className="hover:text-brand-700 hover:underline"
                  >
                    <span className="font-mono text-xs text-slate-500">
                      {order.tender.tenderNumber}
                    </span>
                    <span className="block max-w-[200px] truncate">
                      {order.tender.title}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-bold text-brand-900 tabular-nums">
                  {formatMoney(order.totalAmount, order.currency)}
                </td>
                <td className="px-4 py-3">
                  <OrderStatusBadge status={order.status} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {format(new Date(order.createdAt), "d MMM yyyy", {
                    locale: tr,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-16 text-center">
      <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center">
        <Package className="w-6 h-6 text-slate-400" />
      </div>
      <p className="font-display font-bold text-brand-900 mt-3">
        Henüz sipariş yok
      </p>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Bir ihale kazandırdığınızda otomatik olarak burada sipariş(ler)
        oluşturulacak.
      </p>
    </div>
  );
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
