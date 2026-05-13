"use client";

import { ResultCount, SearchInput, SortDropdown } from "@/components/list";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useTenderStats, useTenders } from "@/hooks/use-tenant-tenders";
import type { TenderDateRange, TenderStatus } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { CalendarRange, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { TenderStatsCards } from "./stats-cards";
import { TendersTable } from "./tenders-table";

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "En Yeni" },
  { value: "createdAt:asc", label: "En Eski" },
  { value: "bidsCloseAt:asc", label: "Yakın Biten" },
  { value: "bidsCloseAt:desc", label: "Uzak Biten" },
];

const RANGE_OPTIONS: { value: TenderDateRange; label: string }[] = [
  { value: "7d", label: "Son 7 Gün" },
  { value: "30d", label: "Son 30 Gün" },
  { value: "3m", label: "Son 3 Ay" },
  { value: "6m", label: "Son 6 Ay" },
  { value: "12m", label: "Son 1 Yıl" },
  { value: "all", label: "Tümü" },
];
const VALID_RANGES: TenderDateRange[] = ["7d", "30d", "3m", "6m", "12m", "all"];
const DEFAULT_RANGE: TenderDateRange = "3m";

function parseRange(value: string | null): TenderDateRange {
  if (value && (VALID_RANGES as string[]).includes(value)) {
    return value as TenderDateRange;
  }
  return DEFAULT_RANGE;
}

type TabKey =
  | "all"
  | "DRAFT"
  | "OPEN_FOR_BIDS"
  | "IN_AWARD"
  | "AWARDED"
  | "CANCELLED";

const VALID_TABS: TabKey[] = [
  "all",
  "DRAFT",
  "OPEN_FOR_BIDS",
  "IN_AWARD",
  "AWARDED",
  "CANCELLED",
];

function parseTab(value: string | null): TabKey {
  if (value && (VALID_TABS as string[]).includes(value)) {
    return value as TabKey;
  }
  return "all";
}

function parsePage(value: string | null): number {
  const n = value ? parseInt(value, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

const PAGE_SIZE = 20;

const TRIGGER_CLASSES = cn(
  "group inline-flex items-center px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
  "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50",
  "data-[state=active]:border-brand-600 data-[state=active]:text-brand-700 data-[state=active]:bg-brand-50/30",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 rounded-t-md",
);

function TabBadge({ count }: { count: number | null }) {
  if (count === null) {
    return (
      <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-400">
        —
      </span>
    );
  }
  return (
    <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600 group-data-[state=active]:bg-brand-100 group-data-[state=active]:text-brand-700">
      {count}
    </span>
  );
}

export function IhalelerView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const search = searchParams.get("search") ?? "";
  const sort = searchParams.get("sort") ?? "createdAt:desc";
  const range = parseRange(searchParams.get("range"));
  const page = parsePage(searchParams.get("page"));
  const { user } = useAuth();
  const canCreate = user?.role === "COMPANY_ADMIN";

  const stats = useTenderStats();

  // Tab → status filter map
  // "CANCELLED" tab içinde CANCELLED + CLOSED_NO_AWARD bir arada gösterilir;
  // backend tek status filtreliyor, ikisini ayrı çekip union yerine sadece
  // CANCELLED'ı status query'sinde gönderelim, KPI badge'inde toplam
  // sayıyı kullanıyoruz. CLOSED_NO_AWARD'ı da görebilmek için "all" sekmesine
  // yönlendirme tercih edilebilir; V1 için CANCELLED tab'ında sadece
  // cancelled gösteriliyor ve closedNoAward "İptal/Kapalı" KPI'sında.
  const statusFilter: TenderStatus | undefined =
    tab === "all" ? undefined : (tab as TenderStatus);

  const queryParams = useMemo(
    () => ({
      status: statusFilter,
      search: search || undefined,
      sort,
      range,
      page,
      pageSize: PAGE_SIZE,
    }),
    [statusFilter, search, sort, range, page],
  );

  const list = useTenders(queryParams);

  const updateUrl = useCallback(
    (next: {
      tab?: TabKey;
      search?: string;
      sort?: string;
      range?: TenderDateRange;
      page?: number;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.tab !== undefined) {
        if (next.tab === "all") params.delete("tab");
        else params.set("tab", next.tab);
        params.delete("page");
      }
      if (next.search !== undefined) {
        if (next.search === "") params.delete("search");
        else params.set("search", next.search);
        params.delete("page");
      }
      if (next.sort !== undefined) {
        params.set("sort", next.sort);
        params.delete("page");
      }
      if (next.range !== undefined) {
        if (next.range === DEFAULT_RANGE) params.delete("range");
        else params.set("range", next.range);
        params.delete("page");
      }
      if (next.page !== undefined) {
        if (next.page <= 1) params.delete("page");
        else params.set("page", String(next.page));
      }
      const qs = params.toString();
      router.replace(qs ? `/dashboard/ihaleler?${qs}` : "/dashboard/ihaleler");
    },
    [router, searchParams],
  );

  const handleTabChange = (value: string) => {
    updateUrl({ tab: value as TabKey, search: "", page: 1 });
  };

  const items = list.data?.items ?? [];
  const totalCount = list.data?.pagination.total ?? 0;
  const isFiltered =
    Boolean(search) || tab !== "all" || range !== DEFAULT_RANGE;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-3xl text-brand-900">
            İhaleler
          </h1>
          <p className="text-slate-600 mt-1">
            Tedarik süreçlerinizi yönetin — açın, davet gönderin, kazandırın.
          </p>
        </div>
        {canCreate ? (
          <Link href="/dashboard/ihaleler/yeni">
            <Button variant="primary">
              <Plus className="h-4 w-4" />
              Yeni İhale Aç
            </Button>
          </Link>
        ) : (
          <Button
            variant="primary"
            disabled
            title="Bu işlem için Firma Yöneticisi yetkisi gerekiyor"
          >
            <Plus className="h-4 w-4" />
            Yeni İhale Aç
          </Button>
        )}
      </div>

      <TenderStatsCards />

      <TabsPrimitive.Root
        value={tab}
        onValueChange={handleTabChange}
        className="space-y-4"
      >
        <TabsPrimitive.List
          className="border-b border-surface-border flex gap-1 overflow-x-auto"
          aria-label="İhale sekmeleri"
        >
          <TabsPrimitive.Trigger value="all" className={TRIGGER_CLASSES}>
            Tümü
            <TabBadge count={stats.data?.total ?? null} />
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="DRAFT" className={TRIGGER_CLASSES}>
            Taslak
            <TabBadge count={stats.data?.draft ?? null} />
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger
            value="OPEN_FOR_BIDS"
            className={TRIGGER_CLASSES}
          >
            Yayında
            <TabBadge count={stats.data?.openForBids ?? null} />
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="IN_AWARD" className={TRIGGER_CLASSES}>
            Kazandırma
            <TabBadge count={stats.data?.inAward ?? null} />
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="AWARDED" className={TRIGGER_CLASSES}>
            Tamamlandı
            <TabBadge count={stats.data?.awarded ?? null} />
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="CANCELLED" className={TRIGGER_CLASSES}>
            İptal/Kapalı
            <TabBadge
              count={
                stats.data
                  ? stats.data.cancelled + stats.data.closedNoAward
                  : null
              }
            />
          </TabsPrimitive.Trigger>
        </TabsPrimitive.List>

        <TabsPrimitive.Content value={tab} className="space-y-4 outline-none">
          <div className="card p-3 flex flex-col md:flex-row md:items-center gap-3">
            <SearchInput
              value={search}
              onChange={(v) => updateUrl({ search: v })}
              placeholder="İhale adı veya numarası ara…"
              className="flex-1 min-w-0"
            />
            <div className="relative">
              <CalendarRange className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={range}
                onChange={(e) =>
                  updateUrl({ range: e.target.value as TenderDateRange })
                }
                className={cn(
                  "pl-9 pr-8 py-2 text-sm rounded-lg appearance-none bg-white cursor-pointer min-w-[160px]",
                  "border border-surface-border text-brand-900",
                  "focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
                )}
                aria-label="Tarih aralığı"
              >
                {RANGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <SortDropdown
              value={sort}
              onChange={(v) => updateUrl({ sort: v })}
              options={SORT_OPTIONS}
            />
            <ResultCount
              total={totalCount}
              isFiltered={isFiltered}
              unit="ihale"
              className="md:ml-auto"
            />
          </div>

          <div className="card overflow-hidden">
            <TendersTable
              items={items}
              isLoading={list.isLoading}
              isError={list.isError}
              pageSize={PAGE_SIZE}
              onRetry={() => list.refetch()}
            />
          </div>
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>
    </div>
  );
}
